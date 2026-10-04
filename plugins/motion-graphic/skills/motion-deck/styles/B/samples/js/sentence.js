/* ③: 펜이 여백을 가리킨 뒤(지시선 0–0.65s) 주석 두 줄이 조판된다(0.38–0.97s) */
Deck.on('sentence', (sec, step, d) => {
  if (d.mode !== 'step' || step !== 3) return;
  ['n1', 'n2'].forEach((k, i) => {
    const el = sec.querySelector(`.flip-stage [data-k="${k}"]`);
    if (el) Stage.play(el, Deck.WIPE, { duration: 500, delay: 380 + i * 90, easing: Stage.ease.move });
  });
});
