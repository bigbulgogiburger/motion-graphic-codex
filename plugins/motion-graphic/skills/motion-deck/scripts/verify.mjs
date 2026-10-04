// 단일 파일 검증: 프로젝트 밖 임시 폴더로 복사한 뒤 file:// 로 열어 발표 조작까지 확인한다(Chrome headless + CDP).
//   node <스킬>/scripts/verify.mjs <html> [<html> …]
// 확인: 외부 요청 0 · 콘솔 오류 0 · Pretendard 로드 · 장마다 노트 · → / ← 진행 · P 일시정지 · S 발표자 노트 창(노트 글 표시) · 40MB 이하
//       · 발표자 보기 창에서 누른 → / ← / P 가 메인 창에 닿는지(엔진의 키 전달)
// 결과: out/verify/<이름>.json(지금 폴더 기준). 기기 전체 잠금으로 캡처와 겹치지 않고, 끝나면 Chrome 을 정리한다.
import { mkdirSync, writeFileSync, existsSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { sleep, lock, launchChrome, targets, CDP, evaluate } from './lib.mjs';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((f) => resolve(f));
if (!files.length) { console.error('사용법: node verify.mjs <html> [<html> …]'); process.exit(2); }
for (const f of files) if (!existsSync(f)) { console.error('파일 없음: ' + f); process.exit(2); }

const KEYS = { ArrowRight: [39, 'ArrowRight', ''], ArrowLeft: [37, 'ArrowLeft', ''], p: [80, 'KeyP', 'p'], s: [83, 'KeyS', 's'] };
async function press(c, key) {
  const [vk, code, text] = KEYS[key];
  await c.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, text, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

async function verify(src) {
  const dir = join(tmpdir(), `motion-deck-verify-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, basename(src));
  copyFileSync(src, file);
  const fileUrl = pathToFileURL(file).href;
  const r = { source: src, copiedTo: file, bytes: statSync(file).size, requests: [], console: [], checks: {} };
  const chrome = await launchChrome(['--disable-popup-blocking']);
  const conns = [];
  try {
    const first = (await targets(chrome.port)).find((t) => t.type === 'page');
    const page = await new CDP(first.webSocketDebuggerUrl).open(); conns.push(page);
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    page.on('Network.requestWillBeSent', (p) => { const u = p.request.url; if (!/^(data|blob|about):/.test(u) && !u.startsWith(fileUrl.split('#')[0])) r.requests.push(u.slice(0, 160)); });
    page.on('Runtime.exceptionThrown', (p) => r.console.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text).slice(0, 240)));
    page.on('Runtime.consoleAPICalled', (p) => { if (['error', 'warning', 'assert'].includes(p.type)) r.console.push(`${p.type}: ` + p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 240)); });
    await page.send('Page.navigate', { url: fileUrl });
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await sleep(100); try { ready = await evaluate(page, "document.documentElement.classList.contains('stage-ready')"); } catch { /* 로딩 */ } }
    r.checks.ready = ready;
    r.checks.font = await evaluate(page, "document.fonts.check('700 64px Pretendard') && [...document.fonts].some(f => f.family.replace(/\"/g,'') === 'Pretendard' && f.status === 'loaded')");
    const info = await evaluate(page, `(() => { const s = Reveal.getSlides(); return { slides: s.length, noNotes: s.filter(x => !(x.querySelector('aside.notes')?.textContent.trim())).map(x => x.dataset.sid || '?') }; })()`);
    r.checks.slides = info.slides; r.checks.slidesWithoutNotes = info.noNotes;
    // 방향키
    await sleep(1200);
    const idx = () => evaluate(page, 'JSON.stringify(Reveal.getIndices())');
    const i0 = await idx(); await press(page, 'ArrowRight'); await sleep(900); const i1 = await idx();
    await press(page, 'ArrowLeft'); await sleep(900); const i2 = await idx();
    r.checks.arrowRight = i1 !== i0; r.checks.arrowLeftBack = i2 === i0;
    // P 일시정지
    await press(page, 'ArrowRight'); await sleep(150);
    await press(page, 'p'); await sleep(250);
    const pausedOn = await evaluate(page, "document.documentElement.classList.contains('is-paused')");
    await press(page, 'p'); await sleep(250);
    const pausedOff = !(await evaluate(page, "document.documentElement.classList.contains('is-paused')"));
    r.checks.pauseToggle = pausedOn && pausedOff;
    // S 발표자 노트 창
    const before = new Set((await targets(chrome.port)).map((t) => t.id));
    await press(page, 's');
    let pop = null;
    for (let i = 0; i < 40 && !pop; i++) { await sleep(150); pop = (await targets(chrome.port)).find((t) => t.type === 'page' && !before.has(t.id)); }
    r.checks.speakerWindow = !!pop;
    if (pop) {
      const pc = await new CDP(pop.webSocketDebuggerUrl).open(); conns.push(pc);
      await pc.send('Runtime.enable');
      let notes = '';
      for (let i = 0; i < 40 && !notes; i++) { await sleep(250); try { notes = await evaluate(pc, "(document.querySelector('.speaker-controls-notes .value') || document.querySelector('.speaker-controls-notes'))?.innerText?.trim() || ''"); } catch { /* 로딩 */ } }
      r.checks.speakerNotesText = notes.slice(0, 80);
      // 발표자 보기 창에서 누른 키가 메인 창에 닿는지(넘기기·되돌리기·P) — 발표 때는 보통 이 창에 초점이 있다
      await sleep(1500);
      const s0 = await idx(); await press(pc, 'ArrowRight'); await sleep(900); const s1 = await idx();
      await press(pc, 'ArrowLeft'); await sleep(900); const s2 = await idx();
      r.checks.speakerArrows = s1 !== s0 && s2 === s0;
      await press(pc, 'p'); await sleep(300);
      const spOn = await evaluate(page, "document.documentElement.classList.contains('is-paused')");
      await press(pc, 'p'); await sleep(300);
      const spOff = !(await evaluate(page, "document.documentElement.classList.contains('is-paused')"));
      r.checks.speakerPause = spOn && spOff;
    }
  } finally {
    conns.forEach((c) => c.close());
    await sleep(300);
    await chrome.kill();
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* 잠긴 파일 */ }
  }
  const c = r.checks;
  r.checks.under40MB = r.bytes <= 40 * 1048576;
  r.pass = c.ready && c.font && !r.requests.length && !r.console.length && !c.slidesWithoutNotes.length && c.arrowRight && c.arrowLeftBack
    && c.pauseToggle && c.speakerWindow && !!c.speakerNotesText && c.speakerArrows && c.speakerPause && c.under40MB;
  return r;
}

const release = await lock('verify');
let allPass = true;
try {
  const outDir = resolve('out', 'verify'); mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    const r = await verify(f);
    writeFileSync(join(outDir, basename(f, '.html') + '.json'), JSON.stringify(r, null, 1));
    allPass &&= r.pass;
    const c = r.checks;
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${basename(f)} (${(r.bytes / 1048576).toFixed(2)}MB, 임시 폴더로 복사해 file:// 로 열어 봄)`);
    console.log(`  외부 요청 ${r.requests.length} · 콘솔 ${r.console.length} · 폰트 ${c.font ? 'OK' : '실패'} · 장 ${c.slides} (노트 없음 ${c.slidesWithoutNotes.length}) · →${c.arrowRight ? 'OK' : '실패'} ←${c.arrowLeftBack ? 'OK' : '실패'} · P ${c.pauseToggle ? 'OK' : '실패'} · S ${c.speakerWindow ? '창 열림' : '창 없음'}${c.speakerNotesText ? ` 「${c.speakerNotesText.slice(0, 30)}…」` : ''} · 발표자 보기에서 →← ${c.speakerArrows ? 'OK' : '실패'} P ${c.speakerPause ? 'OK' : '실패'}${c.under40MB ? '' : ' · 40MB 초과'}`);
    r.requests.slice(0, 5).forEach((u) => console.log('  요청 ' + u));
    r.console.slice(0, 5).forEach((m) => console.log('  ' + m));
    if (c.slidesWithoutNotes.length) console.log('  노트 없는 장: ' + c.slidesWithoutNotes.join(', '));
  }
} finally { release(); }
process.exit(allPass ? 0 : 1);
