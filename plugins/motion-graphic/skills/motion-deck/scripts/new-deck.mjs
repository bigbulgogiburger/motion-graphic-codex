// 새 발표 프로젝트 뼈대: 고른 스타일의 공통 파일을 deck/ 으로 복사하고, story/ 템플릿을 놓는다.
//   node <스킬>/scripts/new-deck.mjs <프로젝트 폴더> --style A|B|C [--title "발표 제목"] [--minutes 25]
// · deck/  meta.json · theme.css · theme.js · DESIGN.md(스타일에서 복사 — 이 발표에 맞게 고쳐도 스킬 원본은 그대로) · slides/ css/ js/ img/
// · story/ brief.md · slides.md · status.md · timing.md (이미 있으면 건드리지 않는다)
// · deck/ 에 이미 테마가 있으면 멈춘다(덮어쓰지 않음)
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const project = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const styles = readdirSync(join(SKILL, 'styles')).filter((d) => existsSync(join(SKILL, 'styles', d, 'theme.css')));
const style = (opt('style', '') || '').toUpperCase();
if (!project || !styles.includes(style)) {
  console.error(`사용법: node new-deck.mjs <프로젝트 폴더> --style ${styles.join('|')} [--title "발표 제목"] [--minutes 25]`);
  process.exit(2);
}
const root = resolve(project);
const deck = join(root, 'deck');
const src = join(SKILL, 'styles', style);
if (existsSync(join(deck, 'theme.css'))) {
  console.error(`${deck} 에 이미 테마가 있다 — 덮어쓰지 않는다. 스타일을 바꾸려면 deck/theme.* 를 직접 옮긴 뒤 다시 실행할 것`);
  process.exit(1);
}
const title = opt('title', '발표');
const minutes = opt('minutes', '');

for (const d of ['deck/slides', 'deck/css', 'deck/js', 'deck/img', 'story', 'out', 'dist']) mkdirSync(join(root, d), { recursive: true });
for (const f of ['theme.css', 'theme.js', 'DESIGN.md']) copyFileSync(join(src, f), join(deck, f));
const meta = JSON.parse(readFileSync(join(src, 'meta.json'), 'utf8'));
meta.title = title;
meta.forbidden = [];
meta.allow = [];
meta.anonymize = false;
writeFileSync(join(deck, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

const styleName = readFileSync(join(src, 'DESIGN.md'), 'utf8').split('\n')[0].replace(/^#\s*/, '');   // 예: 스타일 A 「무대」 — …
const made = [];
for (const f of readdirSync(join(SKILL, 'templates'))) {
  const to = join(root, 'story', f);
  if (existsSync(to)) continue;
  const text = readFileSync(join(SKILL, 'templates', f), 'utf8')
    .replaceAll('{{TITLE}}', title).replaceAll('{{STYLE}}', styleName).replaceAll('{{MINUTES}}', minutes || '?');
  writeFileSync(to, text, 'utf8');
  made.push('story/' + f);
}
console.log(`만듦: ${root}`);
console.log(`  deck/ ← 스타일 ${style} (theme.css · theme.js · DESIGN.md · meta.json)`);
if (made.length) console.log(`  ${made.join(' · ')}`);
console.log(`샘플 장(패턴 참고용): ${join(src, 'samples')}`);
console.log(`다음: deck/slides/ 에 장을 만들고 → node "${join(SKILL, 'scripts', 'build.mjs')}" "${deck}" --out "${join(root, 'dist', 'deck.html')}"`);
