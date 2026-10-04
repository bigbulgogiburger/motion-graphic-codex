// 덱을 실제 발표처럼 넘기며 스크린샷을 찍고 화면을 검사한다(Chrome headless + CDP, Playwright 없음).
//   node <스킬>/scripts/capture.mjs <html> <출력 폴더> [--only S01-2,S03-3] [--wait 2400] [--film S03-3@4,S00-1@0] [--film-ms 2600] [--static]
// · 첫 장 0스텝부터 Reveal.next() 로 끝까지 진행하며 <sid>-s<스텝>.png 저장(<section data-shot-wait="ms"> 로 장별 대기 추가)
// · 검사(capture.json): 실효 글자 크기 ≥ 32px(data-audit="small" 은 28px), 글자 겹침, 화면 밖 글자(data-audit="bleed" 예외),
//   글자 대비 ≥ 4.5(data-audit="decor" 예외), 겹침 예외 data-audit="overlap", 외부 요청 0, 콘솔 오류 0
// · --film sid@step: 그 스텝으로 넘어가는 순간을 screencast 로 기록해 8프레임 모음 <sid>-s<step>-film.png. 첫 장@0 은 새로 고침으로 진입 연출을 기록
// · 기기 전체 잠금으로 다른 캡처·검증과 겹치지 않는다. 끝나면 Chrome 프로세스 트리를 정리한다.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sleep, lock, launchChrome, targets, CDP, evaluate } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : d; };
const flag = (name) => argv.includes('--' + name);
const VALUED = ['--only', '--wait', '--film', '--film-ms'];
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const [htmlArg, outArg] = pos;
if (!htmlArg || !outArg) { console.error('사용법: node capture.mjs <html> <출력 폴더> [--only ..] [--wait ms] [--film sid@step,..] [--film-ms ms] [--static]'); process.exit(2); }
const HTML = resolve(htmlArg), OUT = resolve(outArg);
const ONLY = opt('only', '') ? opt('only').split(',') : null;
const WAIT = +opt('wait', 2400);
const FILMS = opt('film', '') ? opt('film').split(',').map((s) => { const [sid, st] = s.split('@'); return { sid, step: +(st || 0) }; }) : [];
const FILM_MS = +opt('film-ms', 2600);
const T0 = Date.now();
mkdirSync(OUT, { recursive: true });

async function shot(c, file) {
  const t0 = Date.now();
  const r = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 30000);
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  if (Date.now() - t0 > 4000) console.log(`  (느린 캡처 ${Date.now() - t0}ms: ${basename(file)})`);
}

// 페이지 안에서 실행: 지금 보이는 장의 글자 검사
const AUDIT = `(() => {
  const sec = Reveal.getCurrentSlide(); const issues = []; const boxes = [];
  const lum = (c) => { const m = c.match(/[\\d.]+/g); if (!m) return null; const [r,g,b] = m.slice(0,3).map(v => { v = +v/255; return v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return { L: .2126*r + .7152*g + .0722*b, a: m[3] === undefined ? 1 : +m[3], rgb: m.slice(0,3).map(Number) }; };
  const pageBg = getComputedStyle(document.body).backgroundColor;
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const l = lum(c); if (l && l.a > .5) return c; } const l = lum(pageBg); return l && l.a > .5 ? pageBg : 'rgb(255,255,255)'; };
  const els = [...sec.querySelectorAll('*')].filter(el => !el.closest('aside.notes,template,.stage-step') && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  for (const el of els) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let op = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    if (op < .2) continue;
    const range = document.createRange(); range.selectNodeContents(el); const rr = range.getBoundingClientRect();
    if (rr.width < 2 || rr.height < 2) continue;
    const k = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1;
    const fs = parseFloat(cs.fontSize) * (isFinite(k) && k > 0 ? k : 1);
    const text = el.textContent.trim().replace(/\\s+/g,' ').slice(0, 40);
    const tag = el.closest('[data-audit]')?.dataset.audit || '';
    const min = tag.includes('small') ? 28 : 32;
    if (fs < min - .5) issues.push({ type: 'small', text, px: +fs.toFixed(1) });
    if (!tag.includes('bleed') && (rr.left < -2 || rr.top < -2 || rr.right > 1922 || rr.bottom > 1082)) issues.push({ type: 'offscreen', text, rect: [rr.left, rr.top, rr.right, rr.bottom].map(Math.round) });
    if (!tag.includes('decor') && op > .6) {
      const f = lum(cs.color), b = lum(bgOf(el));
      if (f && b) { const fa = f.a * Math.min(1, op); const L = fa * f.L + (1 - fa) * b.L; const hi = Math.max(L, b.L), lo = Math.min(L, b.L); const cr = (hi + .05) / (lo + .05); if (cr < 4.5) issues.push({ type: 'contrast', text, ratio: +cr.toFixed(2), color: cs.color, bg: bgOf(el) }); }
    }
    // 겹침은 보이는 글리프 띠로 판단(글꼴 상자는 줄간보다 커서 오탐): 위 .15em · 아래 .12em 깎기
    boxes.push({ text, r: [rr.left, rr.top + .15 * fs, rr.right, rr.bottom - .12 * fs], tag });
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r; const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]); const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    if (w > 6 && h > 6 && !(boxes[i].tag + boxes[j].tag).includes('overlap')) issues.push({ type: 'overlap', a: boxes[i].text, b: boxes[j].text, px: [Math.round(w), Math.round(h)] });
  }
  const minPx = Math.min(...[...sec.querySelectorAll('*')].filter(el => !el.closest('aside.notes,template') && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(el => parseFloat(getComputedStyle(el).fontSize)));
  return { sid: sec.dataset.sid || '', step: +(sec.dataset.step || 0), issues, texts: boxes.length, minCssPx: minPx };
})()`;

async function main() {
  if (!existsSync(HTML)) throw new Error('파일 없음: ' + HTML);
  const release = await lock(`capture ${HTML}`);
  let chrome = null, page = null;
  const report = { file: HTML, at: new Date().toISOString(), shots: [], films: [], requests: [], console: [], issues: 0 };
  try {
    chrome = await launchChrome();
    const target = (await targets(chrome.port)).find((t) => t.type === 'page');
    page = await new CDP(target.webSocketDebuggerUrl).open();
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    const fileUrl = pathToFileURL(HTML).href;
    let recordNet = true;   // 필름 모음을 여는 동안은 덱의 요청이 아니므로 기록하지 않는다
    page.on('Network.requestWillBeSent', (p) => { const u = p.request.url; if (recordNet && !/^(data|blob):/.test(u) && !u.startsWith(fileUrl.split('#')[0].split('?')[0])) report.requests.push(u.slice(0, 160)); });
    page.on('Runtime.exceptionThrown', (p) => report.console.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text).slice(0, 300)));
    page.on('Runtime.consoleAPICalled', (p) => { if (['error', 'warning', 'assert'].includes(p.type)) report.console.push(`${p.type}: ` + p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)); });
    await page.send('Page.navigate', { url: fileUrl + (flag('static') ? '?static' : '') + '#/0' });
    for (let i = 0; i < 200; i++) { await sleep(100); try { if (await evaluate(page, "document.documentElement.classList.contains('stage-ready')")) break; } catch { /* 로딩 중 */ } }
    report.font = await evaluate(page, "document.fonts.check('700 64px Pretendard')");
    const slides = await evaluate(page, `Reveal.getSlides().map((s,i)=>({i, sid: s.dataset.sid || String(i), steps: +(s.dataset.steps||0), wait: +(s.dataset.shotWait||0)}))`);
    report.slides = slides;
    await evaluate(page, 'Reveal.slide(0,0,-1)');
    await sleep(WAIT + (slides[0]?.wait || 0));
    const filmsLeft = [...FILMS];

    // 필름: 화면 기록 시작 → (연출) → 정지 · 8프레임 모음 저장 → 덱으로 복귀
    const waitReady = async () => { for (let i = 0; i < 100; i++) { await sleep(100); try { if (await evaluate(page, "document.documentElement.classList.contains('stage-ready')")) break; } catch { /* 로딩 */ } } };
    const startFilm = async () => {
      const frames = [];
      page.on('Page.screencastFrame', async (p) => { frames.push({ t: p.metadata.timestamp, data: p.data }); try { await page.send('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch { /* 종료 */ } });
      await page.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 960, maxHeight: 540, everyNthFrame: 1 });
      await sleep(120);
      return frames;
    };
    const saveFilm = async (fname, frames, t0) => {
      await page.send('Page.stopScreencast'); page.off('Page.screencastFrame');
      const fdir = join(OUT, 'film'); mkdirSync(fdir, { recursive: true });
      const picks = [];
      const span = FILM_MS / 1000;
      for (let k = 0; k < 8; k++) {
        const want = t0 + span * (k / 7);
        let best = null; for (const f of frames) if (!best || Math.abs(f.t - want) < Math.abs(best.t - want)) best = f;
        if (best) { const fn = `${fname}-${k}.jpg`; writeFileSync(join(fdir, fn), Buffer.from(best.data, 'base64')); picks.push({ fn, ms: Math.max(0, Math.round((best.t - t0) * 1000)) }); }
      }
      const sheet = join(fdir, fname + '.html');
      writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#1b1b1b;font:600 22px/1 sans-serif;color:#ddd;display:grid;grid-template-columns:repeat(4,480px);gap:0;width:1920px}figure{margin:0;position:relative}img{width:480px;height:270px;display:block}figcaption{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.65);padding:4px 8px;border-radius:4px}</style>` +
        picks.map((p) => `<figure><img src="${p.fn}"><figcaption>${(p.ms / 1000).toFixed(2)}s</figcaption></figure>`).join(''));
      report.films.push({ name: fname, frames: frames.length, picks });
      const back = await evaluate(page, 'location.href');
      recordNet = false;
      await page.send('Page.navigate', { url: pathToFileURL(sheet).href }); await sleep(900);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 540, deviceScaleFactor: 1, mobile: false });
      await shot(page, join(OUT, fname + '.png'));
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
      await page.send('Page.navigate', { url: back.split('#')[0] + '#/' });
      await sleep(300); recordNet = true;
      await waitReady();
    };
    // 첫 장 진입 필름(--film <첫 장>@0): 기록을 켠 채 새로 고침하고, 엔진 준비 완료(진입 연출 시작) 순간을 0초로 잡는다
    const fi0 = slides.length ? filmsLeft.findIndex((f) => f.sid === slides[0].sid && f.step === 0) : -1;
    if (fi0 >= 0) {
      filmsLeft.splice(fi0, 1);
      await evaluate(page, "document.documentElement.classList.remove('stage-ready')");
      const frames = await startFilm();
      await page.send('Page.reload', {});
      let t0 = null;
      for (let i = 0; i < 400 && t0 === null; i++) { await sleep(25); try { if (await evaluate(page, "document.documentElement.classList.contains('stage-ready')")) t0 = Date.now() / 1000 - 0.025; } catch { /* 로딩 */ } }
      await sleep(FILM_MS);
      await saveFilm(`${slides[0].sid}-s0-film`, frames, t0 ?? Date.now() / 1000 - FILM_MS / 1000);
      await evaluate(page, 'Reveal.slide(0,0,-1)');
      await sleep(WAIT + (slides[0]?.wait || 0));
    }
    // 진행: 처음부터 끝까지 Reveal.next()
    let lastKey = '';
    for (let guard = 0; guard < 600; guard++) {
      const st = await evaluate(page, `(()=>{const s=Reveal.getCurrentSlide();const i=Reveal.getIndices();return {h:i.h,f:i.f,sid:s.dataset.sid||String(i.h),step:+(s.dataset.step||0),steps:+(s.dataset.steps||0),wait:+(s.dataset.shotWait||0)}})()`);
      const key = `${st.h}/${st.f}`;
      if (key === lastKey) { console.log('  더 이상 넘어가지 않음 — 종료'); break; }
      lastKey = key;
      if (!ONLY || ONLY.includes(st.sid)) {
        const name = `${st.sid}-s${st.step}`;
        await shot(page, join(OUT, name + '.png'));
        const audit = await evaluate(page, AUDIT);
        report.shots.push({ name, ...audit });
        report.issues += audit.issues.length;
        console.log(`  ${((Date.now() - T0) / 1000).toFixed(1)}s ${name}${audit.issues.length ? ` · 이슈 ${audit.issues.length}` : ''}`);
      }
      if (await evaluate(page, 'Reveal.isLastSlide() && (Reveal.availableFragments().next === false)')) break;
      // 다음 상태가 필름 대상이면 screencast 로 기록
      const nxt = await evaluate(page, `(()=>{const f=Reveal.availableFragments();const s=Reveal.getCurrentSlide();const i=Reveal.getIndices();if(f.next){return {sid:s.dataset.sid||String(i.h),step:+(s.dataset.step||0)+1}}const n=Reveal.getSlides()[i.h+1];return n?{sid:n.dataset.sid||String(i.h+1),step:0}:null})()`);
      const fi = nxt ? filmsLeft.findIndex((f) => f.sid === nxt.sid && f.step === nxt.step) : -1;
      if (fi >= 0) {
        filmsLeft.splice(fi, 1);
        const frames = await startFilm();
        const t0 = Date.now() / 1000;
        await evaluate(page, 'Reveal.next()');
        await sleep(FILM_MS);
        await saveFilm(`${nxt.sid}-s${nxt.step}-film`, frames, t0);
        // 필름 직후 상태로 복귀(해시 이동 → 즉시 상태)
        const idx = await evaluate(page, `(()=>{const s=Reveal.getSlides();const h=s.findIndex(x=>(x.dataset.sid||'')==='${nxt.sid}');return h<0?0:h})()`);
        await evaluate(page, `Reveal.slide(${idx},0,${nxt.step - 1})`);
        await sleep(WAIT);
        continue;
      }
      await evaluate(page, 'Reveal.next()');
      await sleep(WAIT + (st.wait || 0));
    }
    if (filmsLeft.length) console.log(`  찍지 못한 필름: ${filmsLeft.map((f) => `${f.sid}@${f.step}`).join(', ')} (sid·스텝을 확인할 것)`);
  } finally {
    page?.close();
    if (chrome) await chrome.kill();
    release();
  }
  writeFileSync(join(OUT, 'capture.json'), JSON.stringify(report, null, 1));
  const byType = {};
  report.shots.forEach((s) => s.issues.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + 1; }));
  console.log(`캡처 ${report.shots.length}장 · 필름 ${report.films.length} · 폰트 ${report.font ? 'OK' : '실패'} · 외부 요청 ${report.requests.length} · 콘솔 ${report.console.length} · 검사 이슈 ${report.issues} ${JSON.stringify(byType)}`);
  report.shots.forEach((s) => s.issues.slice(0, 6).forEach((i) => console.log(`  ${s.name}: ${JSON.stringify(i)}`)));
  report.console.slice(0, 8).forEach((c) => console.log('  console ' + c));
  report.requests.slice(0, 5).forEach((u) => console.log('  요청 ' + u));
  if (report.issues || report.console.length || report.requests.length || !report.font) process.exitCode = 1;
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
