/* stage.js — reveal.js 위의 장면 엔진.
   · 스텝: <section data-steps="n"> → 클릭 n번. section 에 data-step·st-1..st-k 클래스, 요소에 .on/.now/.gone
   · 레이아웃 FLIP: <div class="flip" data-flip="L0 | L1a L1b@700 | L2"> 안의 <template data-name> 들.
     같은 data-k 는 같은 오브젝트로 보고 이전 위치·크기에서 새 위치로 이동(data-arc 로 곡선), 없던 것은 등장, 사라진 것은 퇴장.
   · 펜: 템플릿 안 <i class="pen" data-pk data-pen="strike|underline|circle|caret|check|swap|arrow|bracket" data-to="k ..">
     → 대상 글자의 실제 위치를 재서 손으로 긋는 선을 그린다(Stage.pens 에 종류 추가 가능).
   · 매치컷: 앞뒤 장에 같은 data-match 가 있으면 앞 장의 도형이 화면을 덮었다가 뒷 장의 도형으로 줄어든다.
   · 키네틱 단어(data-split) · P 일시정지 · ?static(모든 모션 끄고 최종 상태) · 모션 줄이기 존중.
   방향별 연출은 theme.js 에서 document 의 'stage:step' 이벤트를 받아 덧붙인다. */
(function () {
  'use strict';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STATIC = /[?&]static\b/.test(location.search) || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (STATIC) document.documentElement.classList.add('static');
  const EASE = {
    move: 'cubic-bezier(.65,0,.35,1)', out: 'cubic-bezier(.16,1,.3,1)', in: 'cubic-bezier(.7,0,.84,0)',
    pen: 'cubic-bezier(.55,.08,.35,1)', spring: 'cubic-bezier(.34,1.45,.64,1)', soft: 'cubic-bezier(.4,0,.2,1)',
  };
  let R = null;
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const scale = () => (R && R.getScale && R.getScale()) || 1;
  const easing = (v, d) => EASE[v] || v || EASE[d] || d;
  const num = (v, d) => (v === undefined || v === null || v === '' ? d : +v);

  /** box 기준 레이아웃 좌표(슬라이드 px). 진행 중인 transform 도 반영된 "보이는" 위치. */
  function rect(el, box) {
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect(), s = scale();
    return { x: (r.left - b.left) / s, y: (r.top - b.top) / s, w: r.width / s, h: r.height / s };
  }
  function play(el, kf, opt) {
    if (STATIC) return null;
    return el.animate(kf, Object.assign({ fill: 'backwards' }, opt));
  }

  /* ───────────── 스텝 ───────────── */
  function prepareSteps() {
    $$('.reveal .slides section[data-steps]').forEach((sec) => {
      const n = parseInt(sec.dataset.steps, 10) || 0;
      for (let i = 0; i < n; i++) {
        const f = document.createElement('i');
        f.className = 'fragment stage-step';
        f.setAttribute('data-fragment-index', String(i));
        f.setAttribute('aria-hidden', 'true');
        sec.appendChild(f);
      }
    });
  }
  const stepOf = (sec) => sec.querySelectorAll(':scope > .stage-step.visible').length;

  function applyStep(sec, k, o) {
    const n = parseInt(sec.dataset.steps || '0', 10);
    const prev = sec.dataset.step === undefined ? -1 : +sec.dataset.step;
    if (o.instant) sec.classList.add('instant');
    if (o.entering && !o.forward) sec.classList.add('noanim');
    sec.dataset.step = String(k);
    for (let i = 1; i <= n; i++) sec.classList.toggle('st-' + i, i <= k);
    $$('[data-at],[data-until]', sec).forEach((el) => {
      const at = num(el.dataset.at, 0), until = el.dataset.until !== undefined ? +el.dataset.until : Infinity;
      el.classList.toggle('on', k >= at);
      el.classList.toggle('now', k === at);
      el.classList.toggle('gone', k > until);
    });
    const mode = o.instant ? (o.entering && o.forward && k === 0 ? 'enter' : 'instant') : (k > prev ? 'step' : 'instant');
    $$('.flip', sec).forEach((box) => Flip.go(box, k, mode));
    if (o.instant) requestAnimationFrame(() => requestAnimationFrame(() => sec.classList.remove('instant')));
    document.dispatchEvent(new CustomEvent('stage:step', {
      detail: { section: sec, step: k, prev, forward: k > prev && !(o.entering && !o.forward), entering: !!o.entering, mode },
    }));
  }

  function onEnter(cur, prev) {
    if (!cur) return;
    if (prev && prev !== cur) leave(prev);
    let forward = true;
    if (prev && R) {
      const a = R.getIndices(prev), b = R.getIndices(cur);
      forward = b.h > a.h || (b.h === a.h && (b.v || 0) >= (a.v || 0));
    }
    applyStep(cur, stepOf(cur), { instant: true, entering: true, forward });
    if (prev && prev !== cur) MatchCut.run(prev, cur);
  }
  function onFragment() {
    const cur = R.getCurrentSlide();
    if (!cur) return;
    const k = stepOf(cur), p = +(cur.dataset.step || 0);
    if (k === p) return;
    applyStep(cur, k, { instant: k < p, entering: false, forward: k > p });
  }
  function leave(sec) {
    sec.classList.remove('noanim');
    $$('.flip', sec).forEach((box) => Flip.clear(box));
  }

  /* ───────────── 키네틱 단어 ───────────── */
  function split(el) {
    let i = num(el.dataset.i0, 0);
    (function walk(node) {
      Array.from(node.childNodes).forEach((ch) => {
        if (ch.nodeType === 3) {
          const parts = ch.textContent.split(/(\s+)/);
          if (parts.every((p) => !p.trim())) return;
          const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (!p.trim()) { frag.appendChild(document.createTextNode(p)); return; }
            const w = document.createElement('span'); w.className = 'w';
            const wi = document.createElement('span'); wi.className = 'wi';
            wi.style.setProperty('--i', String(i++)); wi.textContent = p;
            w.appendChild(wi); frag.appendChild(w);
          });
          ch.replaceWith(frag);
        } else if (ch.nodeType === 1 && ch.tagName !== 'BR' && !ch.classList.contains('w')) walk(ch);
      });
    })(el);
  }

  /* ───────────── 레이아웃 FLIP ───────────── */
  const ENTER = {
    rise: [{ opacity: 0, transform: 'translateY(.45em)' }, { opacity: 1, transform: 'none' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    drop: [{ opacity: 0, transform: 'translateY(-.45em)' }, { opacity: 1, transform: 'none' }],
    pop: [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'none' }],
    grow: [{ transform: 'scale(0)' }, { transform: 'none' }],
    left: [{ opacity: 0, transform: 'translateX(-.6em)' }, { opacity: 1, transform: 'none' }],
    none: null,
  };
  const EXIT = {
    fade: [{ opacity: 1 }, { opacity: 0 }],
    sink: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(.35em)' }],
    up: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-.35em)' }],
    fall: [{ opacity: 1, transform: 'none' }, { opacity: 1, transform: 'translateY(.25em) rotate(4deg)', offset: .35 }, { opacity: 0, transform: 'translateY(1.1em) rotate(9deg)' }],
    shrink: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.2)' }],
  };

  function arcFrames(dx, dy, s, arc) {
    if (!arc) return [{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: 'none' }];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;               // 진행 방향의 수직
    const cx = dx / 2 + nx * arc, cy = dy / 2 + ny * arc;
    const N = 18, f = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = u * u * dx + 2 * u * t * cx, y = u * u * dy + 2 * u * t * cy;
      f.push({ transform: `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${(s + (1 - s) * t).toFixed(4)})`, offset: t });
    }
    return f;
  }

  const Flip = {
    init(box) {
      const tpls = $$(':scope > template', box);
      box._tpl = {};
      tpls.forEach((t, i) => { box._tpl[t.dataset.name || String(i)] = t; });
      const spec = box.dataset.flip || tpls.map((t, i) => t.dataset.name || String(i)).join(' | ');
      box._groups = spec.split('|').map((g) => g.trim().split(/\s+/).filter(Boolean).map((tok) => {
        const [name, at] = tok.split('@');
        return { name, at: num(at, 0) };
      }));
      box._stage = document.createElement('div'); box._stage.className = 'flip-stage';
      box._ghosts = document.createElement('div'); box._ghosts.className = 'flip-ghosts';
      box._pens = document.createElementNS(SVGNS, 'svg'); box._pens.setAttribute('class', 'pen-layer');
      box.append(box._stage, box._ghosts, box._pens);
      box._cur = null; box._timers = [];
      const g0 = box._groups[0];
      Flip.render(box, g0[g0.length - 1].name, false);
    },
    clear(box) { (box._timers || []).forEach(clearTimeout); box._timers = []; },
    group(box, k) { return box._groups[Math.max(0, Math.min(k, box._groups.length - 1))]; },
    go(box, k, mode) {
      Flip.clear(box);
      const g = Flip.group(box, k);
      if (mode === 'instant' || STATIC) { Flip.render(box, g[g.length - 1].name, false); return; }
      g.forEach((it, j) => {
        const first = mode === 'enter' && j === 0;
        const run = () => Flip.render(box, it.name, !first, first);
        if (it.at > 0) box._timers.push(setTimeout(run, it.at)); else run();
      });
    },
    render(box, name, animate, entering) {
      const tpl = box._tpl[name];
      if (!tpl) { console.warn('[stage] flip 레이아웃 없음:', name); return; }
      if (box._cur === name && !entering) return;
      const stage = box._stage;
      // 1) 지금 보이는 위치·스타일 기록(진행 중인 애니메이션 포함) 후 정지
      const prev = new Map();
      $$('[data-k]', stage).forEach((el) => {
        const cs = getComputedStyle(el);
        prev.set(el.dataset.k, { el, r: rect(el, box), o: cs.opacity, c: cs.color, bg: cs.backgroundColor });
      });
      prev.forEach((p) => p.el.getAnimations().forEach((a) => a.cancel()));
      $$(':scope > *', box._ghosts).forEach((g) => g.remove());
      // 2) 새 레이아웃 — 같은 키는 기존 노드를 옮겨 쓴다(같은 오브젝트)
      const frag = tpl.content.cloneNode(true);
      const kept = new Set();
      frag.querySelectorAll('[data-k]').forEach((nu) => {
        const p = prev.get(nu.dataset.k);
        if (!p) return;
        const el = p.el;
        el.className = nu.className;
        if (nu.hasAttribute('style')) el.setAttribute('style', nu.getAttribute('style')); else el.removeAttribute('style');
        Array.from(el.attributes).forEach((a) => { if (a.name.startsWith('data-') && !nu.hasAttribute(a.name)) el.removeAttribute(a.name); });
        Array.from(nu.attributes).forEach((a) => { if (a.name.startsWith('data-')) el.setAttribute(a.name, a.value); });
        if (el.innerHTML !== nu.innerHTML) el.innerHTML = nu.innerHTML;
        nu.replaceWith(el);
        kept.add(nu.dataset.k);
      });
      // 3) 사라질 요소 → 유령(보이던 자리·모양 그대로)
      const ghosts = [];
      if (animate) prev.forEach((p, k) => {
        if (kept.has(k)) return;
        const g = p.el, cs = getComputedStyle(g);
        const keep = ['font-size', 'font-weight', 'letter-spacing', 'line-height', 'color', 'background-color', 'border-radius', 'font-variation-settings'];
        const st = keep.map((prop) => `${prop}:${cs.getPropertyValue(prop)}`).join(';');
        g.setAttribute('style', `${g.getAttribute('style') || ''};${st};left:${p.r.x}px;top:${p.r.y}px;width:${p.r.w}px;height:${p.r.h}px;margin:0;opacity:${p.o}`);
        ghosts.push(g);
      });
      stage.replaceChildren(frag);
      ghosts.forEach((g) => box._ghosts.appendChild(g));
      box._cur = name;
      box.dataset.layout = name;
      Pen.update(box, animate);
      if (!animate) { if (entering) Flip.enterFx(box); return; }
      // 4) FLIP — 이전 위치에서 새 위치로
      $$('[data-k]', stage).forEach((el) => {
        const k = el.dataset.k, p = prev.get(k), d = el.dataset;
        const r = rect(el, box), cs = getComputedStyle(el);
        const dur = num(d.dur, num(box.dataset.dur, 900)), delay = num(d.delay, 0);
        if (p && kept.has(k)) {
          const dx = p.r.x - r.x, dy = p.r.y - r.y;
          const s = d.noscale !== undefined ? 1 : (r.h > 0 && p.r.h > 0 ? p.r.h / r.h : 1);
          if (Math.abs(dx) > .5 || Math.abs(dy) > .5 || Math.abs(s - 1) > .004) {
            play(el, arcFrames(dx, dy, s, num(d.arc, 0)), { duration: dur, delay, easing: easing(d.ease, 'move') });
          }
          if (p.o !== cs.opacity || p.c !== cs.color || p.bg !== cs.backgroundColor) {
            play(el, [{ opacity: p.o, color: p.c, backgroundColor: p.bg }, { opacity: cs.opacity, color: cs.color, backgroundColor: cs.backgroundColor }],
              { duration: Math.round(dur * .8), delay, easing: EASE.soft });
          }
        } else {
          const kf = ENTER[d.in || box.dataset.in || 'rise'];
          if (kf) play(el, kf, { duration: num(d.dur, 700), delay: num(d.delay, num(box.dataset.inDelay, 260)), easing: easing(d.ease, 'out') });
        }
      });
      ghosts.forEach((g) => {
        const kf = EXIT[g.dataset.out || box.dataset.out || 'fade'] || EXIT.fade;
        const a = play(g, kf, { duration: num(g.dataset.outDur, 380), delay: num(g.dataset.outDelay, 0), easing: EASE.in, fill: 'forwards' });
        if (a) a.onfinish = () => g.remove(); else g.remove();
      });
    },
    /** 슬라이드 진입 때 첫 레이아웃의 등장(data-enter="rise|fade|mask|none", data-stagger) */
    enterFx(box) {
      const kind = box.dataset.enter || 'none';
      if (kind === 'none' || STATIC) return;
      const st = num(box.dataset.stagger, 70), d0 = num(box.dataset.enterDelay, 0);
      $$('[data-k]', box._stage).forEach((el, i) => {
        const d = el.dataset, delay = num(d.enterDelay, d0 + i * st);
        if (kind === 'mask') {
          play(el, [{ clipPath: 'inset(-10% -5% 100% -5%)', transform: 'translateY(.9em)' }, { clipPath: 'inset(-10% -5% -25% -5%)', transform: 'none' }],
            { duration: num(d.enterDur, 950), delay, easing: EASE.out });
        } else {
          const kf = ENTER[kind] || ENTER.rise;
          play(el, kf, { duration: num(d.enterDur, 800), delay, easing: EASE.out });
        }
      });
      $$(':scope > g', box._pens).forEach((g) => Pen.draw(g, d0));
    },
  };

  /* ───────────── 펜 ───────────── */
  // 결정적 흔들림(같은 키는 같은 손맛)
  function rng(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }
  /** 글자 상자 → 보이는 글리프 범위(Pretendard: asc .952 / desc .241 / 한글 윗선 ≈ .80em) */
  function glyph(el, box) {
    const r = rect(el, box), cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 16;
    let lh = parseFloat(cs.lineHeight); if (!isFinite(lh)) lh = fs * 1.2;
    const base = r.y + (r.h - lh) / 2 + (lh - 1.193 * fs) / 2 + .952 * fs;
    return { x: r.x, y: r.y, w: r.w, h: r.h, fs, base, top: base - .80 * fs, bottom: base + .1 * fs, mid: base - .35 * fs };
  }
  const f1 = (v) => v.toFixed(1);
  /** 점들을 지나는 매끈한 곡선(Catmull-Rom → 3차 베지어) */
  function smooth(pts) {
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
  }
  const PENS = {
    strike(g, j) { const p = .06 * g.fs; return [`M${f1(g.x - p)} ${f1(g.mid + .05 * g.fs)} Q ${f1(g.x + g.w * .5)} ${f1(g.mid - .02 * g.fs + j() * 6 - 3)} ${f1(g.x + g.w + p)} ${f1(g.mid - .06 * g.fs)}`]; },
    underline(g, j) { const p = .05 * g.fs, y = g.bottom + .14 * g.fs; return [`M${f1(g.x - p)} ${f1(y + 4)} Q ${f1(g.x + g.w * .55)} ${f1(y + 10 + j() * 8)} ${f1(g.x + g.w + p)} ${f1(y - 6)}`]; },
    circle(g, j) {
      const cx = g.x + g.w / 2, cy = g.mid, rx = g.w / 2 + .3 * g.fs, ry = .68 * g.fs;
      const pts = [], a0 = Math.PI * (1.1 + j() * .05), sweep = Math.PI * 2.1, tilt = (j() - .5) * .06;
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, a = a0 + sweep * t, wob = 1 + (j() - .5) * .018 + t * .05;
        const x = Math.cos(a) * rx * wob, y = Math.sin(a) * ry * wob;
        pts.push([cx + x, cy + y + x * tilt]);
      }
      return [smooth(pts)];
    },
    caret(g) { const s = .2 * g.fs, x = g.x - .04 * g.fs, y = g.bottom + .26 * g.fs; return [`M${f1(x - s)} ${f1(y + s * .55)} L${f1(x)} ${f1(y - s * .75)} L${f1(x + s)} ${f1(y + s * .55)}`]; },
    check(g) { const s = .5 * g.fs, x = g.x + g.w + .2 * g.fs, y = g.mid; return [`M${f1(x)} ${f1(y)} L${f1(x + s * .38)} ${f1(y + s * .42)} L${f1(x + s * 1.05)} ${f1(y - s * .72)}`]; },
    bracket(g) { const s = .22 * g.fs, x = g.x - .3 * g.fs; return [`M${f1(x + s)} ${f1(g.top)} Q ${f1(x)} ${f1(g.top)} ${f1(x)} ${f1(g.top + s)} L${f1(x)} ${f1(g.bottom - s)} Q ${f1(x)} ${f1(g.bottom)} ${f1(x + s)} ${f1(g.bottom)}`]; },
    /** a ↔ b 자리바꿈(교정 부호): 두 단어 왼쪽을 감싸는 ⊂ 곡선 + 양 끝 화살촉(두 단어를 향함) */
    swap(a, b, j) {
      const ax = a.x - .14 * a.fs, bx = b.x - .14 * b.fs, h = .17 * a.fs;
      const lx = Math.min(ax, bx) - (.44 + j() * .06) * a.fs;
      const ay = a.mid, by = b.mid;
      const curve = `M${f1(ax)} ${f1(ay)} C ${f1(lx)} ${f1(ay - .06 * a.fs)} ${f1(lx - .04 * a.fs)} ${f1(by + .04 * a.fs)} ${f1(bx)} ${f1(by)}`;
      const hb = `M${f1(bx - h * 1.1)} ${f1(by - h * .62)} L${f1(bx)} ${f1(by)} L${f1(bx - h * 1.05)} ${f1(by + h * .66)}`;
      const ha = `M${f1(ax - h * 1.05)} ${f1(ay - h * .66)} L${f1(ax)} ${f1(ay)} L${f1(ax - h * 1.1)} ${f1(ay + h * .6)}`;
      return [curve, hb, ha];
    },
    /** a → b 곡선 화살표(data-bend 로 휨) */
    arrow(a, b, j, pen) {
      const x1 = a.x + a.w / 2, y1 = a.bottom + .2 * a.fs, x2 = b.x + b.w / 2, y2 = b.top - .15 * b.fs;
      const bend = num(pen.dataset.bend, .25) * Math.hypot(x2 - x1, y2 - y1);
      const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2;
      const ang = Math.atan2(y2 - my, x2 - mx), h = .2 * a.fs;
      const head = `M${f1(x2 - h * Math.cos(ang - .5))} ${f1(y2 - h * Math.sin(ang - .5))} L${f1(x2)} ${f1(y2)} L${f1(x2 - h * Math.cos(ang + .5))} ${f1(y2 - h * Math.sin(ang + .5))}`;
      return [`M${f1(x1)} ${f1(y1)} Q ${f1(mx)} ${f1(my)} ${f1(x2)} ${f1(y2)}`, head];
    },
  };
  const Pen = {
    target(box, keys) {
      const els = String(keys || '').split(/\s+/).filter(Boolean).map((k) => box._stage.querySelector(`[data-k="${k}"]`)).filter(Boolean);
      if (!els.length) return null;
      const gs = els.map((el) => glyph(el, box));
      return gs.reduce((u, g) => ({
        x: Math.min(u.x, g.x), w: Math.max(u.x + u.w, g.x + g.w) - Math.min(u.x, g.x),
        y: Math.min(u.y, g.y), h: Math.max(u.y + u.h, g.y + g.h) - Math.min(u.y, g.y),
        fs: u.fs, base: u.base, top: Math.min(u.top, g.top), bottom: Math.max(u.bottom, g.bottom), mid: (u.mid + g.mid) / 2,
      }));
    },
    paths(box, pen) {
      const fn = PENS[pen.dataset.pen];
      if (!fn) { console.warn('[stage] 펜 종류 없음:', pen.dataset.pen); return null; }
      const j = rng(pen.dataset.pk || pen.dataset.pen);
      if (pen.dataset.a) {
        const a = Pen.target(box, pen.dataset.a), b = Pen.target(box, pen.dataset.b);
        return a && b ? fn(a, b, j, pen) : null;
      }
      const g = Pen.target(box, pen.dataset.to);
      return g ? fn(g, j, pen) : null;
    },
    draw(g, extraDelay) {
      if (STATIC) return;
      const dur = num(g.dataset.dur, 520), d0 = num(g.dataset.delay, 0) + (extraDelay || 0);
      let t = d0;
      $$('path', g).forEach((path, i) => {
        const len = path.getTotalLength ? path.getTotalLength() : 100;
        const dd = i === 0 ? dur : Math.max(140, Math.min(dur, len * 2.2));
        path.style.strokeDasharray = '1 1';
        play(path, [{ strokeDashoffset: 1, opacity: 0 }, { opacity: 1, offset: .02 }, { strokeDashoffset: 0, opacity: 1 }], { duration: dd, delay: t, easing: EASE.pen });
        t += dd * .92;
      });
    },
    update(box, animate) {
      const layer = box._pens, want = new Map();
      $$('.pen', box._stage).forEach((p) => want.set(p.dataset.pk || p.dataset.pen, p));
      $$(':scope > g', layer).forEach((g) => {
        if (want.has(g.dataset.pk)) return;
        const a = animate ? play(g, [{ opacity: 1 }, { opacity: 0 }], { duration: num(g.dataset.outDur, 320), easing: EASE.in, fill: 'forwards' }) : null;
        if (a) a.onfinish = () => g.remove(); else g.remove();
      });
      want.forEach((pen, pk) => {
        const ds = Pen.paths(box, pen);
        if (!ds) return;
        let g = Array.from(layer.children).find((x) => x.dataset.pk === pk);
        const fresh = !g;
        if (!g) { g = document.createElementNS(SVGNS, 'g'); g.dataset.pk = pk; layer.appendChild(g); }
        g.setAttribute('class', 'pen-g ' + (pen.getAttribute('class') || '').replace(/\bpen\b/, '').trim());
        ['delay', 'dur', 'outDur'].forEach((k) => { if (pen.dataset[k] !== undefined) g.dataset[k] = pen.dataset[k]; });
        if (pen.dataset.w) g.style.setProperty('--pen-w', pen.dataset.w);
        if (pen.dataset.color) g.style.setProperty('--pen', pen.dataset.color);
        const paths = Array.from(g.children);
        ds.forEach((d, i) => {
          let p = paths[i];
          if (!p) { p = document.createElementNS(SVGNS, 'path'); p.setAttribute('pathLength', '1'); g.appendChild(p); }
          p.setAttribute('d', d);
        });
        paths.slice(ds.length).forEach((p) => p.remove());
        if (fresh && animate) Pen.draw(g, 0);
      });
    },
  };

  /* ───────────── 매치컷 ───────────── */
  const MatchCut = {
    run(prev, cur) {
      if (STATIC) return;
      const bs = $$('[data-match]', cur);
      if (!bs.length) return;
      const as = $$('[data-match]', prev);
      let a = null, b = null;
      for (const y of bs) { const x = as.find((q) => q.dataset.match === y.dataset.match); if (x) { a = x; b = y; break; } }
      if (!a || !b) return;
      // 레이어는 .slides 밖(.reveal 직속, 화면 좌표)에 둔다 — .slides 안 마지막 장 뒤에 요소가 있으면 reveal 의 isLastSlide() 가 깨진다
      const host = document.querySelector('.reveal');
      let layer = host.querySelector(':scope > .mc-layer');
      if (!layer) { layer = document.createElement('div'); layer.className = 'mc-layer'; host.appendChild(layer); }
      layer.replaceChildren();
      prev.classList.add('mc-hold'); cur.classList.add('mc-wait');
      const hb = host.getBoundingClientRect();
      const scr = (el) => { const q = el.getBoundingClientRect(); return { x: q.left - hb.left, y: q.top - hb.top, w: q.width, h: q.height }; };
      const ra = scr(a), rb = scr(b), W = hb.width, H = hb.height, k = scale();
      const csA = getComputedStyle(a), csB = getComputedStyle(b);
      const color = a.dataset.matchColor || csA.backgroundColor || csA.fill;
      const colorB = b.dataset.matchColor || csB.backgroundColor || color;
      const radius = (cs) => { const v = cs.borderRadius; return /%/.test(v) ? v : (parseFloat(v) * k) + 'px'; };
      const cover = (r) => {                              // r 의 중심에서 화면 네 귀퉁이까지 덮는 배율
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
        return (far * 2.08) / Math.max(1, Math.min(r.w, r.h));
      };
      const shape = document.createElement('div');
      Object.assign(shape.style, { left: ra.x + 'px', top: ra.y + 'px', width: ra.w + 'px', height: ra.h + 'px', background: color, borderRadius: radius(csA) });
      layer.appendChild(shape);
      const t1 = num(a.dataset.matchOut, 560), t2 = num(b.dataset.matchIn, 700);
      b.style.visibility = 'hidden';
      const p1 = shape.animate([{ transform: 'scale(1)' }, { transform: `scale(${cover(ra)})` }], { duration: t1, easing: 'cubic-bezier(.55,0,.85,.35)', fill: 'forwards' });
      p1.onfinish = () => {
        prev.classList.remove('mc-hold'); cur.classList.remove('mc-wait');
        Object.assign(shape.style, { left: rb.x + 'px', top: rb.y + 'px', width: rb.w + 'px', height: rb.h + 'px', background: colorB, borderRadius: radius(csB) });
        p1.cancel();
        const p2 = shape.animate([{ transform: `scale(${cover(rb)})` }, { transform: 'scale(1)' }], { duration: t2, easing: 'cubic-bezier(.15,.65,.25,1)', fill: 'forwards' });
        p2.onfinish = () => { b.style.visibility = ''; shape.remove(); };
      };
    },
  };

  /* ───────────── P 일시정지 ───────────── */
  let paused = null;
  function togglePause() {
    const html = document.documentElement;
    if (paused) {
      paused.forEach((a) => { try { a.play(); } catch (e) { /* 이미 제거된 애니메이션 */ } });
      paused = null; html.classList.remove('is-paused'); return;
    }
    paused = document.getAnimations().filter((a) => a.playState === 'running');
    paused.forEach((a) => a.pause());
    $$('video').forEach((v) => { if (!v.paused) { v.pause(); paused.push({ play: () => v.play() }); } });
    html.classList.add('is-paused');
  }

  /* ───────────── 발표자 보기(S)에서 누른 키 ───────────── */
  // 발표자 보기는 키를 자기 안의 미리보기 덱(?receiver)에 넘기고, 그 덱의 장·스텝만 0.5초 뒤 메인 창에 맞춘다.
  // 그러면 P 일시정지와 장 스크립트의 키 가로채기(예: 재생 클립의 「재생 중 넘기기 = 구간 끝으로」)가 메인 창에 닿지 않는다.
  // 그래서 미리보기 덱은 넘기기·되돌리기·P 를 메인 창에 그대로 보내고, 메인 창은 직접 누른 키처럼 처리한다(지연도 없어진다).
  const RECEIVER = /receiver/.test(location.search);
  const RELAY = { 32: 'next', 33: 'prev', 34: 'next', 37: 'left', 38: 'up', 39: 'right', 40: 'down', 72: 'left', 74: 'down', 75: 'up', 76: 'right', 78: 'next', 80: 'pause' };
  function relayKey(e) {
    try {
      window.parent.opener.postMessage(JSON.stringify({ namespace: 'stage', type: 'key', keyCode: e.keyCode, shiftKey: !!e.shiftKey }), '*');
      if (e.keyCode === 80) togglePause();                    // 미리보기도 같이 멈춰 보이게
    } catch (x) {                                             // 메인 창이 없으면 미리보기 덱이 직접 움직인다
      const m = e.keyCode === 32 && e.shiftKey ? 'prev' : RELAY[e.keyCode];
      if (m === 'pause') togglePause(); else R[m]();
    }
  }
  if (!RECEIVER) {
    window.addEventListener('message', (e) => {
      let d = null;
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
      if (!d || d.namespace !== 'stage' || d.type !== 'key' || !RELAY[d.keyCode]) return;
      document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: d.keyCode, which: d.keyCode, shiftKey: !!d.shiftKey, bubbles: true, cancelable: true }));
    });
  }

  /* ───────────── 부팅 ───────────── */
  async function boot(cfg) {
    try { await document.fonts.load('600 64px Pretendard', '가A1'); await document.fonts.ready; } catch (e) { /* 폰트 실패 → 대체 서체로 진행 */ }
    prepareSteps();
    $$('[data-split]').forEach(split);
    $$('.flip').forEach((box) => Flip.init(box));
    R = window.Reveal;
    R.on('ready', (e) => onEnter(e.currentSlide, null));
    R.on('slidechanged', (e) => onEnter(e.currentSlide, e.previousSlide));
    R.on('fragmentshown', onFragment);
    R.on('fragmenthidden', onFragment);
    const base = {
      width: 1920, height: 1080, margin: 0, center: false, minScale: .1, maxScale: 3,
      hash: true, fragmentInURL: true, history: false, controls: false, progress: false, slideNumber: false,
      transition: 'none', backgroundTransition: 'none', viewDistance: 3, pdfMaxPagesPerSlide: 1,
      keyboard: RECEIVER ? Object.fromEntries(Object.keys(RELAY).map((k) => [k, relayKey])) : { 80: togglePause },
      plugins: window.RevealNotes ? [window.RevealNotes] : [],
    };
    await R.initialize(Object.assign(base, cfg || {}));
    document.documentElement.classList.add('stage-ready');
  }

  window.Stage = { boot, pens: PENS, enter: ENTER, exit: EXIT, ease: EASE, rect, play, split, togglePause, get static() { return STATIC; }, Flip, Pen, MatchCut };
})();
