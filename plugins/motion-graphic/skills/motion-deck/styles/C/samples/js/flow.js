/* 문장 → 흐름: 문장의 작업 막대가 그대로 노선(선로)이 된다(공유 요소) */
Deck.cut('flow', { from: 'sentence', kind: 'morph', a: '.r-bar', b: '.q-track', dur: 700 });

/* 노선도 위 티켓 — hop · 맥박 · 대기 · 도장 · 관문 (클릭마다 ≤ 1.2s) */
(function () {
  const { $, $$, f2, E, EZ, play } = Deck;
  const XS = [200, 390, 580, 770, 960, 1150, 1340, 1530, 1720], TY = 520, HOP = 550;
  const idx = (k) => Math.max(0, Math.min(8, k - 1));
  function ticketXf(sec, k) {
    const tk = $('.q-ticket', sec), w = tk.offsetWidth, h = tk.offsetHeight;
    const x = XS[idx(k)] - w / 2, y = TY - h / 2;
    return k === 0 ? { x, y: y - 30, r: -4 } : { x, y, r: 0 };
  }
  const xf = (p) => `translate(${f2(p.x)}px, ${f2(p.y)}px) rotate(${p.r}deg)`;
  function placeCaps(sec) {
    if (sec._cCaps) return;
    sec._cCaps = true;
    $$('.q-cap-pos', sec).forEach((el) => {
      const x = +el.dataset.x, w = el.offsetWidth, mk = $('.mk', el), mw = mk ? mk.offsetWidth : 0;
      el.style.left = Math.round(Math.max(128, Math.min(1792 - w, x - mw / 2 - 6))) + 'px';
    });
  }
  Deck.on('flow', (sec, k, d) => {
    placeCaps(sec);
    const pos = $('.q-tk-pos', sec), to = ticketXf(sec, k);
    pos.style.transform = xf(to);
    if (d.mode !== 'step') return;
    const from = ticketXf(sec, d.prev);
    const st = (i) => $$('.q-st', sec)[i];
    const sh = (i) => $('.q-sh', st(i));
    const hop = (delay) => {                        // 정거장 사이를 짧은 호로 건너뛴다(0.55s)
      const n = 22, kf = [];
      for (let i = 0; i <= n; i++) {
        const p = EZ.move(i / n);
        const x = from.x + (to.x - from.x) * p, y = from.y + (to.y - from.y) * p - 56 * 4 * p * (1 - p);
        kf.push({ offset: i / n, transform: xf({ x, y, r: 0 }) });
      }
      play(pos, kf, { duration: HOP, delay, easing: 'linear' });
      return delay + HOP;
    };
    const pulse = (el, at, amt) => play(el, [{ transform: 'scale(1)' }, { transform: `scale(${amt || 1.12})`, offset: .4 }, { transform: 'scale(1)' }],
      { duration: 300, delay: at, easing: E.press, fill: 'none' });
    const stamp = (i, at) => {                       // ◆ 도장: 눌렸다 돌아오며 체크 획(대기 테는 CSS 가 걷는다)
      pulse(sh(i), at, .9);
      const p = $('.q-chk path', st(i));
      if (p) play(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 300, delay: at + 80, easing: 'cubic-bezier(.55,.08,.35,1)' });
    };
    const wait = (i, at) =>                          // 승인 대기: 주황 테가 ◆ 둘레로 조여 들어와 그대로 머문다(반복 없음)
      play($('.q-ring', st(i)), [{ transform: 'scale(1.5)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 350, delay: at, easing: E.in });
    switch (k) {
      case 1:                                        // 사람이 문의를 남긴다: ◆ 가 눌리고 티켓이 내려앉는다
        pulse(sh(0), 0, .9);
        play(pos, [{ transform: xf(from) }, { transform: xf(to) }], { duration: 450, delay: 100, easing: E.in });
        break;
      case 2: case 3: pulse(sh(k - 1), hop(0)); break;
      case 4: wait(3, hop(0) - 50); break;
      case 5: stamp(3, 0); pulse(sh(4), hop(260)); break;
      case 6: pulse($$('b', sh(5))[1], hop(0), 1.14); break;   // 다른 AI(청록)가 한 번 더
      case 7: {                                      // 관문: 차단봉이 내려와 막고 → 점검(■ 맥박) → 올라가 통과
        const at = hop(0);
        play($('.q-bar', st(6)), [
          { transform: 'scaleY(0)', easing: E.in },
          { transform: 'scaleY(1)', offset: .25 },
          { transform: 'scaleY(1)', offset: .75, easing: E.exit },
          { transform: 'scaleY(0)' },
        ], { duration: 1000, delay: 100, fill: 'none' });
        pulse(sh(6), at, 1.1);
        break;
      }
      case 8: wait(7, hop(0) - 50); break;
      case 9: stamp(7, 0); pulse(sh(8), hop(260)); break;
      default: break;
    }
  });
})();
