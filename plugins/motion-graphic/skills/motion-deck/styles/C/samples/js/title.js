/* 타이틀: 마침표(작은 초록 점)가 굴러 나가 큰 ● 가 되고 → ◆ 가 그 위에 내려앉는다(진입 자동 연출 ≈ 3.0s) */
Deck.on('title', (sec, step, d) => {
  if (d.mode !== 'enter') return;
  const { $, f2, E, EZ, play, rect } = Deck;
  const agent = $('.t-agent', sec), human = $('.t-human', sec), anchor = $('.t-anchor', sec);
  const fs = parseFloat(getComputedStyle($('.t-title', sec)).fontSize);
  const a = rect(anchor, sec), g = rect(agent, sec);
  const dd = Math.round(fs * .19);                                     // 마침표 크기
  const x0 = a.x + fs * .05 + dd / 2, y0 = a.y - dd / 2 - fs * .005;   // 기준선 위 마침표 자리
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2, s0 = dd / g.w;
  const T = 2100, tPop = 280, tMove = 640;                            // 나타남 → 머묾 → 굴러 나가며 커짐
  const at = (x, y, s) => `translate(${f2(x - cx)}px, ${f2(y - cy)}px) scale(${s.toFixed(4)})`;
  const kf = [
    { offset: 0, transform: at(x0, y0, 0), easing: E.in },
    { offset: tPop / T, transform: at(x0, y0, s0) },
    { offset: tMove / T, transform: at(x0, y0, s0) },
  ];
  const mx = x0 + (cx - x0) * .42, my = Math.min(y0, cy) - 120;        // 위로 살짝 부푼 호
  const N = 36;
  for (let i = 1; i <= N; i++) {
    const u = i / N, p = EZ.move(u), q = 1 - p;
    const x = q * q * x0 + 2 * q * p * mx + p * p * cx, y = q * q * y0 + 2 * q * p * my + p * p * cy;
    const s = s0 + (1 - s0) * Math.pow(p, 1.5);
    kf.push({ offset: (tMove + (T - tMove) * u) / T, transform: at(x, y, s) });
  }
  play(agent, kf, { duration: T, delay: 520, easing: 'linear' });
  play(human, [                                                       // 원이 자리 잡는 순간 위에서 내려와 꼭대기에 앉는다(감속, 지나치지 않음)
    { transform: 'translateY(-150px)', opacity: 0, easing: 'cubic-bezier(.2,.8,.2,1)' },
    { transform: 'none', opacity: 1 },
  ], { duration: 460, delay: 520 + T - 160 });
});
