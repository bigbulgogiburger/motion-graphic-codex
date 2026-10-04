/* 주어 자리바꿈 — AI 는 앞에서 올라가고, 사람은 잠깐 어둠(뒤)으로 물러났다가 아래 줄에서 다시 켜진다 */
Deck.on('sentence', (sec, step, d) => {
  if (step !== 1 || d.mode !== 'step') return;
  const h = sec.querySelector('.flip-stage [data-k="h"]');
  if (h) Stage.play(h, [{ opacity: 1 }, { opacity: .2, offset: .3 }, { opacity: .2, offset: .62 }, { opacity: 1 }],
    { duration: 900, easing: 'linear' });
});
