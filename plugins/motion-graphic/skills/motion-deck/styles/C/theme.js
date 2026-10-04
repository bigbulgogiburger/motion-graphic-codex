/* 스타일 C 「색면과 도형」 공통 연출 — 엔진(stage.js)의 'stage:step' 이벤트에 덧붙인다.
   원칙: 상태(위치·보임)는 CSS 가 정하고, 여기서는 "앞으로 넘길 때만" 한 번 도는 연기(WAAPI)를 얹는다.
   뒤로 가기·건너뛰기·?static 에서는 연기 없이 최종 상태. 여기서 만든 애니메이션은 id='cfx' 로 표시해 엔진 것과 섞이지 않게 정리한다.
   튕김 없음: 등장 = 감속, 퇴장 = 가속, 이동 = 대칭 가감속(cubic-bezier 의 y 는 0~1 안). 클릭 한 번의 연출 ≤ 1.2s.
   · 장별 연출: js/<sid>.js 에서 Deck.on('<sid>', (section, step, detail) => …)  — 장에 들어올 때마다 그 장의 연기는 먼저 멈춘다
   · 장 사이 컷: js/<sid>.js 에서 Deck.cut('<sid>', { from: '<앞 장 sid>', kind, a: '앞 장 선택자', b: '이 장 선택자', … })
       cover : 앞 장 도형이 커져 화면을 정확히 덮는 그 프레임에 이 장이 열리고, 색면은 이 장 도형으로 접힌다(color, t1, t2)
               덮는 색 = 이 장 주인공 도형의 색. ● 는 circle(), 그 밖은 inset() 클립으로 그린다
       morph : 앞 장 도형이 색면 없이 이 장 도형으로 변한다(위치·크기·모서리·색, dur)
       carry : 앞 장 도형들이 이 장의 한 도형으로 옮겨 가 합쳐진다(◆ 끼리, dur, gap)
     잉크(검정) 전체 화면은 쓰지 않는다. 색면 컷(cover)은 연달아 두지 않는다. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const isStatic = () => !!(window.Stage && window.Stage.static);
  const f2 = (v) => (+v).toFixed(2);

  /* cubic-bezier(x1,y1,x2,y2) → 시간(0~1) → 진행(0~1) */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const fx = (t) => ((ax * t + bx) * t + cx) * t, fy = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 40; i++) { const v = fx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return fy(t);
    };
  }
  const E = {                                              // 덱 공통 곡선(문자열 · 함수 짝)
    in: 'cubic-bezier(.2,.7,.2,1)', move: 'cubic-bezier(.65,0,.35,1)', inout: 'cubic-bezier(.45,0,.4,1)',
    exit: 'cubic-bezier(.6,0,.8,.2)', press: 'cubic-bezier(.3,0,.3,1)',
  };
  const EZ = { move: bezier(.65, 0, .35, 1), inout: bezier(.45, 0, .4, 1) };

  function play(el, kf, opt) {
    if (!el || isStatic()) return null;
    const a = el.animate(kf, Object.assign({ fill: 'backwards' }, opt));
    a.id = 'cfx';
    return a;
  }
  /** 이 장에서 내가 만든 연기만 멈춘다(엔진의 등장 효과·CSS 애니메이션은 건드리지 않음) */
  function stop(sec) {
    sec.getAnimations({ subtree: true }).forEach((a) => { if (a.id === 'cfx') a.cancel(); });
  }
  const rect = (el, box) => window.Stage.rect(el, box);

  /* ═════════ 장 사이 컷 ═════════ */
  const CUTS = {};
  let cutNow = null;
  function cutClear() {
    if (!cutNow) return;
    cutNow.anims.forEach((a) => a.cancel());
    cutNow.hidden.forEach((el) => { el.style.visibility = ''; });
    cutNow.layer.replaceChildren();
    $$('.reveal .slides > section.mc-hold, .reveal .slides > section.mc-wait').forEach((s) => s.classList.remove('mc-hold', 'mc-wait'));
    cutNow = null;
  }
  function cut(prev, cur) {
    cutClear();
    const c = CUTS[cur.dataset.sid];
    if (!c || isStatic() || !prev || prev.dataset.sid !== c.from) return;
    const host = $('.reveal');
    let layer = $(':scope > .c-cut-layer', host);
    if (!layer) { layer = document.createElement('div'); layer.className = 'c-cut-layer'; host.appendChild(layer); }
    const hb = host.getBoundingClientRect(), k = (window.Reveal.getScale && window.Reveal.getScale()) || 1;
    const scr = (el) => { const q = el.getBoundingClientRect(); return { x: q.left - hb.left, y: q.top - hb.top, w: q.width, h: q.height }; };
    const st = cutNow = { cur, layer, anims: [], hidden: [] };
    const run = (el, kf, opt) => { const a = el.animate(kf, Object.assign({ fill: 'forwards' }, opt)); st.anims.push(a); return a; };
    const hide = (el) => { el.style.visibility = 'hidden'; st.hidden.push(el); };
    const shape = (css) => { const d = document.createElement('div'); d.style.cssText = css; layer.appendChild(d); return d; };
    const done = () => { if (cutNow === st) cutClear(); };
    // 앞 장은 reveal 이 이미 숨겼다 → 잠깐 붙잡아 실제 위치를 잰다
    prev.classList.add('mc-hold');
    const As = $$(c.a, prev), B = $(c.b, cur);
    if (!As.length || !B) { prev.classList.remove('mc-hold'); cutNow = null; return; }
    const ras = As.map(scr), rb = scr(B);

    if (c.kind === 'cover') {
      const A = As[0], ra = ras[0], Wd = hb.width, Ht = hb.height;
      const far = (r) => { const cx = r.x + r.w / 2, cy = r.y + r.h / 2; return Math.max(Math.hypot(cx, cy), Math.hypot(Wd - cx, cy), Math.hypot(cx, Ht - cy), Math.hypot(Wd - cx, Ht - cy)); };
      const clip = (el, r, full) => {
        if (el.classList.contains('dot')) return `circle(${f2(full ? far(r) : r.w / 2)}px at ${f2(r.x + r.w / 2)}px ${f2(r.y + r.h / 2)}px)`;
        if (full) return 'inset(0px 0px 0px 0px round 0px)';
        const rad = (parseFloat(getComputedStyle(el).borderRadius) || 0) * k;
        return `inset(${f2(r.y)}px ${f2(Wd - r.x - r.w)}px ${f2(Ht - r.y - r.h)}px ${f2(r.x)}px round ${f2(rad)}px)`;
      };
      cur.classList.add('mc-wait');
      hide(B);
      const sh = shape(`inset:0;background:${c.color}`);
      run(sh, [{ clipPath: clip(A, ra, false) }, { clipPath: clip(A, ra, true) }], { duration: c.t1 || 400, easing: E.exit }).onfinish = () => {
        if (cutNow !== st) return;
        prev.classList.remove('mc-hold'); cur.classList.remove('mc-wait');         // 덮은 바로 그 프레임에 다음 장이 열린다
        run(sh, [{ clipPath: clip(B, rb, true) }, { clipPath: clip(B, rb, false) }], { duration: c.t2 || 560, easing: E.in }).onfinish = done;
      };
      return;
    }
    prev.classList.remove('mc-hold');                                               // 공유 요소 컷: 앞 장은 바로 닫힌다
    hide(B);
    if (c.kind === 'morph') {
      const ra = ras[0], csA = getComputedStyle(As[0]), csB = getComputedStyle(B);
      const box = (r, cs) => ({ left: f2(r.x) + 'px', top: f2(r.y) + 'px', width: f2(r.w) + 'px', height: f2(r.h) + 'px',
        borderRadius: f2((parseFloat(cs.borderRadius) || 0) * k) + 'px', backgroundColor: cs.backgroundColor });
      const sh = shape('');
      run(sh, [box(ra, csA), box(rb, csB)], { duration: c.dur || 700, easing: E.move }).onfinish = done;
      return;
    }
    // carry — ◆ 는 회전한 정사각형: 변 길이는 레이아웃 폭, 위치는 상자 중심
    const sB = B.offsetWidth * k, cxB = rb.x + rb.w / 2, cyB = rb.y + rb.h / 2;
    const runs = As.map((A, i) => {
      const ra = ras[i], s = (A.offsetWidth * k) / sB;
      const sh = shape(`left:${f2(cxB - sB / 2)}px;top:${f2(cyB - sB / 2)}px;width:${f2(sB)}px;height:${f2(sB)}px;background:${getComputedStyle(A).backgroundColor}`);
      const dx = ra.x + ra.w / 2 - cxB, dy = ra.y + ra.h / 2 - cyB;
      return run(sh, [{ transform: `translate(${f2(dx)}px, ${f2(dy)}px) rotate(45deg) scale(${s.toFixed(4)})` }, { transform: 'translate(0px, 0px) rotate(45deg) scale(1)' }],
        { duration: c.dur || 700, delay: i * (c.gap || 50), easing: E.move, fill: 'both' });
    });
    Promise.all(runs.map((a) => a.finished)).then(done, () => {});
  }

  /* ═════════ 등록과 배달 ═════════ */
  const handlers = {};
  window.Deck = {
    on(sid, fn) { handlers[sid] = fn; },
    cut(sid, def) { CUTS[sid] = def; },
    $, $$, f2, bezier, E, EZ, play, stop, rect,
  };
  let lastSec = null;
  document.addEventListener('stage:step', (e) => {
    const d = e.detail, sec = d.section;
    if (d.entering) {
      if (lastSec && lastSec !== sec && d.mode === 'enter') cut(lastSec, sec); else cutClear();
    } else if (cutNow && cutNow.cur !== sec) cutClear();
    lastSec = sec;
    const h = handlers[sec.dataset.sid || ''];
    if (h) { stop(sec); h(sec, d.step, d); }
  });
})();
