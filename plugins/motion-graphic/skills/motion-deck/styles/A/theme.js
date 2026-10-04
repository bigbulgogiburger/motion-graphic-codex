/* 스타일 A 「무대」 공통 연출
   · 바닥선 마스크: 새 글자는 자기 바닥선 아래에서 떠오르고(Stage.enter.mask), 사라지는 글자는 바닥선 아래로 가라앉는다(Stage.exit.under).
   · 장별 연출은 js/<sid>.js 에서 Deck.on('<sid>', (section, step, detail) => …) 로 등록한다.
     스텝으로 앞으로 갈 때만 재생하고(detail.mode === 'step'), 끝 상태는 CSS 가 갖는다(뒤로 가기·?static 안전). */
(function () {
  'use strict';
  const S = window.Stage;
  if (!S) return;

  S.enter.mask = [
    { clipPath: 'inset(-30% -12% 105% -12%)', transform: 'translateY(105%)' },
    { clipPath: 'inset(-30% -12% -30% -12%)', transform: 'translateY(0)' },
  ];
  S.exit.under = [
    { clipPath: 'inset(-30% -12% -30% -12%)', transform: 'translateY(0)' },
    { clipPath: 'inset(-30% -12% 105% -12%)', transform: 'translateY(105%)' },
  ];

  const handlers = {};
  window.Deck = {
    on(sid, fn) { handlers[sid] = fn; },
    POP: [{ transform: 'scale(0)' }, { transform: 'scale(1)' }],
    MOVE: 'cubic-bezier(.65,0,.35,1)',   // = --ease-move (이동·카메라·펜과 같은 곡선)
    OUT: 'cubic-bezier(.2,.7,.2,1)',     // 등장(감속)
  };
  document.addEventListener('stage:step', (e) => {
    const d = e.detail, f = handlers[d.section.dataset.sid || ''];
    if (f) f(d.section, d.step, d);
  });
})();
