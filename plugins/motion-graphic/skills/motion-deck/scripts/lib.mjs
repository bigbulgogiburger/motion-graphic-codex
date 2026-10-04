// motion-deck 공용 도구: Chrome 찾기·띄우기·정리, 기기 전체에서 Chrome 하나만 쓰게 하는 잠금, 최소 CDP 클라이언트.
// Playwright 는 쓰지 않는다. 이 PC 의 Chrome(없으면 Edge·Chromium)을 headless 로 띄워 DevTools 프로토콜로 조작한다.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, openSync, closeSync, writeFileSync, readFileSync, statSync, unlinkSync, utimesSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const env = process.env.CHROME_PATH;
  if (env) {
    if (existsSync(env)) return env;
    throw new Error(`CHROME_PATH 가 가리키는 파일이 없다: ${env}`);
  }
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const list = process.platform === 'win32'
    ? [join(pf, 'Google\\Chrome\\Application\\chrome.exe'), join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
       local && join(local, 'Google\\Chrome\\Application\\chrome.exe'),
       join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
         '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
         '/snap/bin/chromium', '/usr/bin/microsoft-edge'];
  const hit = list.find((p) => p && existsSync(p));
  if (!hit) throw new Error('Chrome·Edge·Chromium 을 찾지 못했다. 환경 변수 CHROME_PATH 에 실행 파일 경로를 넣고 다시 실행할 것');
  return hit;
}

// ── 기기 전체 잠금: 캡처·검증·모음 그림이 동시에 Chrome 을 여럿 띄우지 않게 한다(메모리 보호) ──
// 잠금 파일은 20초마다 갱신한다. 주인 프로세스가 죽었거나 90초 넘게 갱신이 없으면 버려진 잠금으로 본다.
const LOCK = join(tmpdir(), 'motion-deck-chrome.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export async function lock(label) {
  const t0 = Date.now();
  let told = false;
  for (;;) {
    try {
      const fd = openSync(LOCK, 'wx');
      writeFileSync(fd, `${process.pid} ${new Date().toISOString()} ${label}`);
      closeSync(fd);
      const beat = setInterval(() => { try { const n = new Date(); utimesSync(LOCK, n, n); } catch { /* 지워짐 */ } }, 20000);
      beat.unref();
      const release = () => {
        clearInterval(beat);
        try { if (readFileSync(LOCK, 'utf8').startsWith(`${process.pid} `)) unlinkSync(LOCK); } catch { /* 없음 */ }
      };
      process.once('exit', release);
      return release;
    } catch {
      try {
        const txt = readFileSync(LOCK, 'utf8');
        const age = Date.now() - statSync(LOCK).mtimeMs;
        const pid = parseInt(txt, 10);
        const stale = txt ? (!alive(pid) || age > 90e3) : age > 5000;   // 막 만들어져 아직 비어 있으면 기다린다
        if (stale) { unlinkSync(LOCK); continue; }
      } catch { /* 다른 프로세스와 경쟁 — 다시 시도 */ }
      if (Date.now() - t0 > 30 * 60e3) throw new Error(`Chrome 잠금을 30분 넘게 기다렸다 — ${LOCK} 를 확인할 것`);
      if (!told) { console.log('다른 캡처·검증이 Chrome 을 쓰는 중 — 끝나면 이어서 한다'); told = true; }
      await sleep(1500);
    }
  }
}

// ── Chrome 띄우기: 임시 프로필, 디버깅 포트, 끝나면 프로세스 트리째 정리 ──
export async function launchChrome(extra = []) {
  const exe = findChrome();
  const prof = join(tmpdir(), `motion-deck-chrome-${process.pid}-${Date.now()}`);
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--window-size=1920,1080',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', ...extra, 'about:blank'];
  const proc = spawn(exe, args, { stdio: 'ignore', detached: process.platform !== 'win32' });
  const kill = async () => {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-proc.pid, 'SIGKILL');
    } catch { /* 이미 종료 */ }
    await sleep(400);
    try { rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* 잠긴 파일 */ }
  };
  let port = null;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(150);
    try { port = readFileSync(join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { /* 아직 */ }
  }
  if (!port) { await kill(); throw new Error(`Chrome 디버깅 포트를 찾지 못했다(${exe})`); }
  return { exe, port, kill };
}

export async function targets(port) {
  return (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
}

// ── 최소 CDP 클라이언트 ──
export class CDP {
  constructor(url) { this.url = url; this.n = 0; this.wait = new Map(); this.subs = new Map(); }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res(this);
      this.ws.onerror = (e) => rej(e);
      this.ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id) {
          const w = this.wait.get(d.id);
          if (w) { this.wait.delete(d.id); d.error ? w.rej(new Error(d.error.message)) : w.res(d.result); }
        } else if (d.method) (this.subs.get(d.method) || []).forEach((f) => f(d.params));
      };
    });
  }
  send(method, params = {}, ms = 45000) {
    const id = ++this.n;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.wait.delete(id); rej(new Error(`CDP 시간 초과(${ms}ms): ${method}`)); }, ms);
      this.wait.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
    });
  }
  on(method, f) { if (!this.subs.has(method)) this.subs.set(method, []); this.subs.get(method).push(f); }
  off(method) { this.subs.delete(method); }
  close() { try { this.ws.close(); } catch { /* 무시 */ } }
}

export async function evaluate(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
