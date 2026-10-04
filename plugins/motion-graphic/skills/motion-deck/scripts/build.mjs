// motion-deck 빌드: 덱 폴더 → standalone 단일 HTML(CSS·JS·폰트·이미지 전부 인라인, 네트워크·폴더 의존 0)
//   node <스킬>/scripts/build.mjs <덱 폴더> [--out <파일>]        기본 출력 <덱 폴더>/dist/index.html
//
// 덱 폴더
//   slides/*.html  장(최상위 <section> 들, 파일 이름 순). deck.html 하나에 다 써도 된다(그러면 그것이 먼저)
//   theme.css · theme.js · css/*.css · js/*.js   스타일과 연출(이름 순). img/ 등 에셋은 덱 폴더 기준 상대경로
//   meta.json {
//     title, lang("ko"), page(바탕색), bodyClass, reveal:{ transition, transitionSpeed, … },
//     extends   다른 덱 폴더(이 폴더 기준). 그 폴더의 meta·theme·css·js 를 먼저 깐다(장은 안 가져옴).
//               같은 이름의 css/·js/ 파일은 이 폴더 것이 대신한다 — pane 미리보기·스타일 샘플용
//     forbidden ["고객사 이름", "/\\bKEY-\\d+\\b/", …]  화면·노트·CSS·JS 어디에도 나오면 안 되는 말(대소문자 무시)
//     allow     [{ "sid": "S00-1", "text": "홍길동 · 예시팀" }]  그 장 안에서만 한 번 허용(금칙어와 겹치는 발표자 소속 등)
//     anonymize true 면 금액 표기(원·달러)와 도메인 주소도 막는다
//   }
// 검사(하나라도 걸리면 중단): 금칙어 · (anonymize) 금액·도메인 · 외부 URL · 장 안 <script> · 장마다 발표자 노트 · 참조 파일
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(p, 'utf8');
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff',
};
const dataUri = (f) => `data:${MIME[extname(f).toLowerCase()] || 'application/octet-stream'};base64,${readFileSync(f).toString('base64')}`;
const scriptSafe = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function forbiddenRegex(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const parts = list.map((w) => {
    const m = /^\/(.+)\/([a-z]*)$/.exec(w);
    return m ? m[1] : w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(parts.join('|'), 'i');
}

function checkText(label, text, bad, rx, anonymize) {
  const m = rx && text.match(rx);
  if (m) bad.push(`${label}: 금칙어 「${m[0]}」`);
  if (!anonymize) return;
  if (/\d[\d,.]*\s*(?:억\s*원|만\s*원|원|달러)(?![가-힣])/.test(text) || /[₩$]\s*\d/.test(text)) bad.push(`${label}: 금액 표기`);
  // 도메인: SVG 네임스페이스, 코드의 메서드 호출(x.io( 같은 식별자), CSS 복합 선택자(.who.ai) 는 제외
  const dm = [...text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|ai|co\.kr|kr)\b(?!\()/gi)]
    .filter((x) => text[x.index - 1] !== '.').map((x) => x[0])
    .find((d) => !/^(?:www\.w3\.org|(?:CLAUDE|AGENTS|README)\.md)$/i.test(d));
  if (dm) bad.push(`${label}: 도메인 주소 「${dm}」`);
}

const listDir = (d, ext) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(ext)).sort() : []);
const readMeta = (d) => (existsSync(join(d, 'meta.json')) ? JSON.parse(read(join(d, 'meta.json'))) : {});
function layer(d) {
  const piece = (name, file) => ({ name, file, base: d });
  return {
    css: [...(existsSync(join(d, 'theme.css')) ? [piece('theme.css', join(d, 'theme.css'))] : []),
      ...listDir(join(d, 'css'), '.css').map((f) => piece('css/' + f, join(d, 'css', f)))],
    js: [...(existsSync(join(d, 'theme.js')) ? [piece('theme.js', join(d, 'theme.js'))] : []),
      ...listDir(join(d, 'js'), '.js').map((f) => piece('js/' + f, join(d, 'js', f)))],
  };
}

export function buildDeck(deckDir, outFile) {
  const dir = resolve(deckDir);
  if (!existsSync(dir)) throw new Error(`덱 폴더가 없다: ${dir}`);
  const bad = [];
  const own = readMeta(dir);
  const baseDir = own.extends ? resolve(dir, own.extends) : null;
  if (baseDir && !existsSync(baseDir)) throw new Error(`extends 폴더가 없다: ${baseDir}`);
  const baseMeta = baseDir ? readMeta(baseDir) : {};
  const meta = { ...baseMeta, ...own, reveal: { ...(baseMeta.reveal || {}), ...(own.reveal || {}) } };
  const rx = forbiddenRegex(meta.forbidden);
  const allow = Array.isArray(meta.allow) ? meta.allow : [];

  // 장: deck.html + slides/*.html — 주석은 화면에 안 나오고, 장 사이에 있으면 장 분할을 깨뜨리므로 지운다
  const parts = [];
  if (existsSync(join(dir, 'deck.html'))) parts.push(read(join(dir, 'deck.html')));
  for (const f of listDir(join(dir, 'slides'), '.html')) parts.push(read(join(dir, 'slides', f)));
  if (!parts.length) throw new Error(`${dir}: slides/*.html 또는 deck.html 이 없다`);
  let deck = parts.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();

  // 스타일·스크립트: (extends 폴더) → 이 폴더
  const mine = layer(dir), base = baseDir ? layer(baseDir) : { css: [], js: [] };
  const merge = (b, m) => [...b.filter((p) => p.name.startsWith('theme.') || !m.some((q) => q.name === p.name)), ...m];
  const cssPieces = merge(base.css, mine.css).map((p) => ({ ...p, text: read(p.file) }));
  const jsPieces = merge(base.js, mine.js).map((p) => ({ ...p, text: read(p.file) }));

  // 구조·글 검사
  if (/<script[\s>]/i.test(deck)) bad.push('장 HTML 에 <script> 금지 — 연출 코드는 js/<sid>.js 로');
  const sections = deck.match(/<section[\s\S]*?<\/section>\s*(?=<section|$)/gi) || [];
  if (!sections.length) bad.push('<section> 이 하나도 없다');
  const sids = new Set();
  sections.forEach((s, i) => {
    const sid = (s.match(/data-sid="([^"]+)"/) || [])[1] || `#${i + 1}`;
    if (sids.has(sid)) bad.push(`${sid}: data-sid 가 겹친다`);
    sids.add(sid);
    if (!/<aside\b[^>]*class=["'][^"']*\bnotes\b/i.test(s)) bad.push(`${sid}: 발표자 노트(<aside class="notes">) 없음`);
    let t = s;
    for (const a of allow) if (a && a.sid === sid && a.text) t = t.replace(a.text, '');
    checkText(sid, t, bad, rx, meta.anonymize);
  });
  const noNotes = deck.replace(/<aside[\s\S]*?<\/aside>/gi, '');
  if (/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(noNotes.replace(/xmlns(?::\w+)?="[^"]*"/g, ''))) bad.push('장 HTML: 외부 URL 금지(단일 파일은 오프라인에서 열린다)');
  for (const p of cssPieces) {
    checkText(p.name, p.text, bad, rx, meta.anonymize);
    if (/https?:\/\//i.test(p.text.replace(/xmlns[^"]*"[^"]*"/g, ''))) bad.push(`${p.name}: 외부 URL 금지`);
  }
  for (const p of jsPieces) {
    checkText(p.name, p.text, bad, rx, meta.anonymize);
    if (/https?:\/\/(?!www\.w3\.org)/i.test(p.text)) bad.push(`${p.name}: 외부 URL 금지`);
  }
  if (rx) { const m = String(meta.title || '').match(rx); if (m) bad.push(`meta.title: 금칙어 「${m[0]}」`); }

  // 에셋 인라인: src/poster/href="상대경로" 와 CSS url(상대경로) → data URI (경로는 각 조각의 덱 폴더 기준)
  deck = deck.replace(/\b(src|poster|href)=(["'])(?!data:|#|blob:)([^"']+)\2/gi, (all, attr, q, p) => {
    const f = join(dir, p);
    if (!existsSync(f)) { bad.push(`참조 파일 없음: ${p}`); return all; }
    return `${attr}=${q}${dataUri(f)}${q}`;
  });
  const cssInl = cssPieces.map((pc) => pc.text.replace(/url\((["']?)(?!data:|#)([^"')]+)\1\)/gi, (all, q, p) => {
    const f = join(pc.base, p);
    if (!existsSync(f)) { bad.push(`${pc.name}: 참조 파일 없음 ${p}`); return all; }
    return `url("${dataUri(f)}")`;
  })).join('\n');

  if (bad.length) { const e = new Error('빌드 중단:\n- ' + bad.join('\n- ')); e.bad = bad; throw e; }

  const font = join(SKILL, 'fonts', 'PretendardVariable.woff2');
  const html = `<!doctype html>
<html lang="${esc(meta.lang || 'ko')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || 'Presentation')}</title>
<!-- motion-deck 빌드 생성물. 직접 고치지 말고 덱 폴더를 고친 뒤 다시 빌드할 것 -->
<style>${read(join(SKILL, 'vendor/reveal/reveal.css'))}</style>
<style>@font-face{font-family:'Pretendard';src:url(${dataUri(font)}) format('woff2');font-weight:45 930;font-style:normal;font-display:block}
:root{--page:${meta.page || '#fff'}}</style>
<style>${read(join(SKILL, 'engine/stage.css'))}</style>
<style>${cssInl}</style>
</head>
<body class="${esc(meta.bodyClass || '')}">
<div class="reveal"><div class="slides">
${deck}
</div></div>
<script>${scriptSafe(read(join(SKILL, 'vendor/reveal/reveal.js')))}</script>
<script>${scriptSafe(read(join(SKILL, 'vendor/reveal/notes.js')))}</script>
<script>${scriptSafe(read(join(SKILL, 'engine/stage.js')))}</script>
<script>${scriptSafe(jsPieces.map((p) => p.text).join('\n;\n'))}</script>
<script>Stage.boot(${JSON.stringify(meta.reveal || {})});</script>
</body>
</html>
`;
  const out = outFile ? resolve(outFile) : join(dir, 'dist', 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  return { out, bytes: Buffer.byteLength(html), sections: sections.length };
}

// CLI (다른 스크립트가 buildDeck 만 가져다 쓸 때는 실행하지 않는다)
const self = fileURLToPath(import.meta.url), called = resolve(process.argv[1] || '');
if (process.platform === 'win32' ? self.toLowerCase() === called.toLowerCase() : self === called) {
  const args = process.argv.slice(2);
  const deckDir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  if (!deckDir) { console.error('사용법: node build.mjs <덱 폴더> [--out <파일>]'); process.exit(2); }
  const oi = args.indexOf('--out');
  try {
    const res = buildDeck(deckDir, oi >= 0 ? args[oi + 1] : null);
    const mb = res.bytes / 1048576;
    console.log(`빌드 통과: ${relative(process.cwd(), res.out)} · 장 ${res.sections} · ${mb.toFixed(2)} MB · 금칙어·노트·외부 참조 검사 통과`);
    if (mb > 40) console.log('  주의: 40MB 를 넘는다 — 영상·사진을 줄일 것');
  } catch (e) { console.error(e.message); process.exit(1); }
}
