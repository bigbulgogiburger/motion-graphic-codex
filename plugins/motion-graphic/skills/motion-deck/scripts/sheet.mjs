// 스크린샷 모음 한 장 만들기(Chrome headless --screenshot, Playwright 없음) — 덱 전체를 한눈에 훑거나 둘 이상을 나란히 비교할 때
//   node <스킬>/scripts/sheet.mjs dir <캡처 폴더> <out.png> [--cols 4]
//       폴더의 <sid>-s<n>.png 를 장·스텝 순서로 격자 배치
//   node <스킬>/scripts/sheet.mjs compare <out.png> <폴더A> <폴더B> [<폴더C> …] --keys S00-1-s0,S03-3-s4 [--labels A,B,C]
//       행 = 키(파일 이름), 열 = 폴더
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { lock, findChrome } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 파일 이름 순서: 같은 장이면 스텝 번호 순, 장끼리는 파일 이름 순(장 ID 를 S01-2 처럼 정렬되게 지을 것)
const parse = (f) => { const m = f.match(/^(.*)-s(\d+)\.png$/); return m ? [m[1], +m[2]] : [f, 0]; };
const order = (a, b) => { const [sa, na] = parse(a), [sb, nb] = parse(b); return sa === sb ? na - nb : sa < sb ? -1 : 1; };

async function render(html, height, out, width) {
  const tmp = join(tmpdir(), `motion-deck-sheet-${Date.now()}`); mkdirSync(tmp, { recursive: true });
  const page = join(tmp, 'sheet.html'); writeFileSync(page, html);
  const release = await lock('sheet');
  try {
    const r = spawnSync(findChrome(), ['--headless=new', `--user-data-dir=${join(tmp, 'prof')}`, `--window-size=${width},${height}`, '--hide-scrollbars',
      '--force-device-scale-factor=1', '--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-sync',
      '--virtual-time-budget=4000', `--screenshot=${resolve(out)}`, pathToFileURL(page).href], { stdio: 'pipe', timeout: 90000 });
    if (!existsSync(resolve(out))) throw new Error('스크린샷 실패: ' + (r.stderr?.toString() || '').slice(0, 300));
  } finally {
    release();
    try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* 잠긴 파일 */ }
  }
  console.log('저장', resolve(out));
}

const CSS = `body{margin:0;background:#202020;color:#e8e8e8;font:600 24px/1.2 sans-serif}
figure{margin:0;position:relative;background:#000}img{display:block;width:100%;height:auto}
figcaption{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.7);color:#fff;padding:3px 8px;border-radius:4px;font-size:20px}
.h{padding:10px 14px;font-size:26px}`;

const mode = pos[0];
if (mode === 'dir') {
  const [, folder, out] = pos;
  if (!folder || !out) { console.error('사용법: dir <캡처 폴더> <out.png> [--cols 4]'); process.exit(2); }
  const cols = +opt('cols', 4), W = 1920, w = W / cols, h = Math.round(w * 9 / 16);
  // capture.json 이 있으면 실제 발표 순서대로, 없으면 이름 순으로
  const cj = join(resolve(folder), 'capture.json');
  const onDisk = readdirSync(folder).filter((f) => /-s\d+\.png$/.test(f));
  const imgs = existsSync(cj)
    ? JSON.parse(readFileSync(cj, 'utf8')).shots.map((s) => s.name + '.png').filter((f) => onDisk.includes(f))
    : onDisk.sort(order);
  const rows = Math.ceil(imgs.length / cols);
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS} .g{display:grid;grid-template-columns:repeat(${cols},${w}px)}</style>
<div class="h">${esc(basename(resolve(folder)))} · ${imgs.length}장</div><div class="g">${imgs.map((f) => `<figure><img src="${pathToFileURL(join(resolve(folder), f)).href}"><figcaption>${esc(f.replace('.png', ''))}</figcaption></figure>`).join('')}</div>`;
  await render(html, 48 + rows * h, out, W);
} else if (mode === 'compare') {
  const [, out, ...folders] = pos;
  const keys = (opt('keys', '') || '').split(',').filter(Boolean);
  if (!out || !folders.length || !keys.length) { console.error('사용법: compare <out.png> <폴더…> --keys k1,k2 [--labels A,B]'); process.exit(2); }
  const labels = (opt('labels', '') || folders.map((f) => basename(resolve(f))).join(',')).split(',');
  const W = 1920, lab = 150, w = Math.floor((W - lab) / folders.length), h = Math.round(w * 9 / 16);
  const cell = (f, k) => { const p = join(resolve(f), k + '.png'); return existsSync(p) ? `<figure><img src="${pathToFileURL(p).href}"></figure>` : `<figure style="display:grid;place-items:center;height:${h}px;color:#888">없음</figure>`; };
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS} .g{display:grid;grid-template-columns:${lab}px repeat(${folders.length},${w}px);gap:0}
.k{display:flex;align-items:center;padding:0 10px;font-size:22px;background:#2b2b2b;border-bottom:1px solid #333} .c{text-align:center;padding:8px 0;font-size:28px;background:#2b2b2b}</style>
<div class="g"><div class="c"></div>${labels.map((l) => `<div class="c">${esc(l)}</div>`).join('')}
${keys.map((k) => `<div class="k">${esc(k)}</div>${folders.map((f) => cell(f, k)).join('')}`).join('')}</div>`;
  await render(html, 46 + keys.length * h, out, W);
} else {
  console.error('사용법: dir <캡처 폴더> <out.png> | compare <out.png> <폴더…> --keys k1,k2 [--labels A,B]'); process.exit(2);
}
