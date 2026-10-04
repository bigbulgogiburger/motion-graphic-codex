/* 스타일 B 「지면」 공통 연출 — 엔진(stage.js) 위에 덧붙인다
   1) 펜 종류 lead: 고친 말(a)에서 여백 주석 묶음(b)으로 잇는 교정 지시선 + 주석을 묶는 괄호
   2) FLIP 장 진입 때 줄 단위 왼→오 와이프(조판): <div class="flip" data-b-wipe …>
   3) 장별 연출은 js/<sid>.js 에서 Deck.on('<sid>', (section, step, detail) => …) 로 등록한다.
      스텝으로 앞으로 갈 때만 재생하고(detail.mode === 'step'), 끝 상태는 CSS 가 갖는다. */
(function () {
  'use strict';
  if (!window.Stage) return;
  const f = (v) => v.toFixed(1);

  Stage.pens.lead = (a, b, j) => {
    const x1 = a.x + a.w + 0.12 * a.fs, y1 = a.mid + 0.04 * a.fs;
    const hook = 0.17 * b.fs;
    const bx = b.x - 0.3 * b.fs;
    const top = b.top - 0.04 * b.fs, bot = b.bottom + 0.06 * b.fs, my = (top + bot) / 2;
    const x2 = bx - 0.1 * b.fs;
    const line = `M${f(x1)} ${f(y1)} Q ${f(x1 + (x2 - x1) * 0.62)} ${f(y1 + (j() - 0.5) * 4)} ${f(x2)} ${f(my)}`;
    const brace = `M${f(bx + hook)} ${f(top)} Q ${f(bx)} ${f(top)} ${f(bx)} ${f(top + hook)} L ${f(bx + (j() - 0.5) * 2)} ${f(bot - hook)} Q ${f(bx)} ${f(bot)} ${f(bx + hook)} ${f(bot)}`;
    return [line, brace];
  };

  const WIPE = [{ clipPath: 'inset(-15% 100% -35% -8%)' }, { clipPath: 'inset(-15% -8% -35% -8%)' }];
  const handlers = {};
  window.Deck = {
    on(sid, fn) { handlers[sid] = fn; },
    WIPE,                                  // 조판 와이프 키프레임(왼→오)
    MOVE: 'cubic-bezier(.65,0,.35,1)',     // = --ease-move
  };
  document.addEventListener('stage:step', (e) => {
    const d = e.detail, { section, mode } = d;
    // 장 진입: FLIP 줄을 줄 단위로 조판(0.30–1.10s)
    if (mode === 'enter') {
      section.querySelectorAll('.flip[data-b-wipe] .flip-stage > p').forEach((p, i) => {
        Stage.play(p, WIPE, { duration: 650, delay: 300 + i * 150, easing: Stage.ease.move });
      });
    }
    const fn = handlers[section.dataset.sid || ''];
    if (fn) fn(section, d.step, d);
  });
})();
