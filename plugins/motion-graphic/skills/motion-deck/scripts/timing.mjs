// 장별 예상 시간 — 발표자 노트를 말하는 시간 + 클릭마다 화면을 보는 틈. story/timing.md 의 근거 숫자.
//   node <스킬>/scripts/timing.mjs <deck 폴더(slides/ 가 있는 곳)> [--rate 4.5] [--click 1]
// · 말하는 속도: 한글 음절/초(기본 4.5 = 분당 270, 큰 홀에서 또박또박 말하는 속도). 영문 낱말은 2음절, 숫자 한 자는 1음절로 센다.
// · 문장 사이 쉼 0.5초, 클릭(data-steps)마다 화면을 보는 틈(--click, 기본 1초)을 더한다.
// · 영상처럼 말없이 흘러가는 시간이 있는 장은 <section data-clip-sec="초"> 를 달면 더한다.
// · 장 sid 의 앞부분(예: S03-2 → S03)을 챕터로 묶어 합계를 낸다. data-visibility="hidden" 장은 합계에서 뺀다.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? Number(argv[i + 1]) : d; };
const deck = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!deck || !existsSync(join(deck, 'slides'))) { console.error('사용법: node timing.mjs <deck 폴더> [--rate 4.5] [--click 1]'); process.exit(2); }
const RATE = opt('rate', 4.5), CLICK = opt('click', 1);

const rows = [];
for (const f of readdirSync(join(deck, 'slides')).filter((n) => n.endsWith('.html')).sort()) {
  const html = readFileSync(join(deck, 'slides', f), 'utf8');
  for (const m of html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
    const attrs = m[1], body = m[2];
    const sid = (attrs.match(/data-sid="([^"]+)"/) || [])[1] || f;
    const steps = Number((attrs.match(/data-steps="(\d+)"/) || [])[1] || 0);
    const clip = Number((attrs.match(/data-clip-sec="(\d+)"/) || [])[1] || 0);
    const hidden = /data-visibility="hidden"/.test(attrs);
    const notes = ((body.match(/<aside class="notes">([\s\S]*?)<\/aside>/) || [])[1] || '').replace(/<[^>]+>/g, ' ');
    const syl = (notes.match(/[가-힣]/g) || []).length + 2 * (notes.match(/[A-Za-z]+/g) || []).length + (notes.match(/\d/g) || []).length;
    const sentences = (notes.match(/[.?!。]/g) || []).length;
    const sec = Math.round(syl / RATE + sentences * 0.5 + steps * CLICK + clip);
    rows.push({ sid, steps, syl, clip, sec, hidden });
  }
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const chapters = new Map();
console.log('| 장 | 클릭 | 노트 음절 | 영상(초) | 예상(초) |');
console.log('|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.sid}${r.hidden ? ' (숨김)' : ''} | ${r.steps} | ${r.syl} | ${r.clip || ''} | ${r.sec} |`);
  if (r.hidden) continue;
  const ch = r.sid.split('-')[0];
  chapters.set(ch, (chapters.get(ch) || 0) + r.sec);
}
const total = [...chapters.values()].reduce((a, b) => a + b, 0);
console.log(`\n챕터별: ${[...chapters].map(([c, s]) => `${c} ${mmss(s)}`).join(' · ')} · 합계 ${mmss(total)} (말하기 ${RATE}음절/초, 클릭 ${CLICK}초)`);
