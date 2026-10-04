# 무대 엔진(stage) 사용법

`engine/stage.js`·`engine/stage.css` 는 reveal.js 5.2.1 위에서 도는 장면 엔진이다. 빌드가 자동으로 넣으므로 덱에서는 아래 속성만 쓰면 된다. 화면은 1920×1080 고정, 좌표는 전부 px.
엔진은 덱마다 고치지 않는다. 스타일 고유 연출은 그 덱의 `theme.js`, 장 고유 연출은 `js/<sid>.js` 에 둔다.

## 목차
1. 덱 폴더 구조
2. 장(section)과 스텝
3. 레이아웃 FLIP — 같은 오브젝트가 변형·이동하며 이어진다
4. 펜 — 손으로 긋는 선
5. 매치컷(엔진 기본)
6. 장별 연출 코드
7. 기타(P·?static·이징) · 발표자 보기에서 누르는 키
8. 주의
9. 재생 클립 — 녹화 영상 대신 HTML 이 흘러가는 시연

## 1. 덱 폴더 구조
```
deck/
  meta.json   { "title", "page": "#000000", "bodyClass": "dir-a", "reveal": { "transition": "fade", "transitionSpeed": "fast" },
                "forbidden": [...], "allow": [{ "sid", "text" }], "anonymize": false }
  theme.css   스타일 공통(토큰·공용 클래스) — 스타일 프리셋에서 복사해 온 것
  theme.js    스타일 공통 연출 + 장별 연출 등록 함수 Deck.on(…)
  DESIGN.md   그 스타일의 규칙
  slides/     장 하나 = 파일 하나. 파일 이름 순서가 곧 장 순서(예: 0010-title.html, 0020-agenda.html — 사이에 끼울 자리를 남긴다)
  css/<sid>.css   그 장의 스타일. 선택자는 그 장의 클래스로 시작(.a-title …)
  js/<sid>.js     그 장의 연출(Deck.on('<sid>', …))
  img/        (선택) 상대경로로 쓰면 빌드가 data URI 로 넣는다
```
- 장 HTML 에는 `<script>` 를 쓰지 않는다(빌드가 막는다).
- 장마다 `<aside class="notes">구어체 노트</aside>` 가 있어야 한다(빌드가 막는다).
- `meta.json` 의 `extends: "../deck"` 은 다른 덱 폴더의 meta·theme·css·js 를 먼저 깔고 이 폴더 것을 얹는다(장은 안 가져옴). 병렬 pane 이 자기 폴더에서 공통 테마를 이어받아 미리보기를 만들 때 쓴다.

## 2. 장(section)과 스텝
```html
<section data-sid="flow" class="a-flow" data-steps="10" data-shot-wait="900"> … <aside class="notes">…</aside></section>
```
- `data-sid` 는 장 ID(캡처 파일 이름·필름·연출 등록·allow 에 쓰임). 덱 안에서 겹치면 빌드가 막는다.
- `data-steps="n"` → 그 장에서 클릭 n번. 엔진이 section 에 `data-step="k"` 와 누적 클래스 `st-1 … st-k` 를 단다.
- CSS 로 상태를 정의한다: `section[data-step="3"] .cam { transform: … }`(정확히 3), `.st-2 .ticket { … }`(2 이상). 전환은 `transition` 으로 — 앞으로 갈 때만 보이고, 뒤로 가거나 장에 들어올 땐 즉시 적용된다(키노트처럼).
- 요소 단위: `data-at="k"`(k 스텝부터 보임 `.on`), `data-until="k"`(k 스텝 뒤 사라짐 `.gone`), 정확히 k 스텝일 때 `.now`.
- 등장 효과 `data-fx="fade|rise|drop|wipe|wipe-up|pop|grow-x|grow-y|draw"` + `style="--delay:.3s; --dur:.8s"`. data-at 이 없으면 장 진입 때, 있으면 그 스텝에 재생. `draw` 는 SVG path(`pathLength="1"`)를 펜처럼 그린다.
- `data-split` → 단어(띄어쓰기 단위)마다 마스크 안에서 떠오름(`--stagger:70ms`, `--delay`).
- `data-shot-wait="ms"` 는 캡처 대기만 늘린다(발표에는 영향 없음).

## 3. 레이아웃 FLIP — "같은 오브젝트가 변형·이동하며 이어진다"
```html
<div class="flip big" data-flip="L0 | L1a L1b@800 | L2" data-enter="mask" data-stagger="90" style="left:160px; top:300px">
  <template data-name="L0">
    <p><span data-k="h">사람이</span> <span data-k="w">찾고,</span></p>
    <p><span data-k="ai">AI가</span> <span data-k="help">거든다.</span></p>
  </template>
  <template data-name="L1a"> … </template>
  <template data-name="L1b"> … <span data-k="h" data-arc="-140" data-dur="1000">사람</span><span data-k="p2">은</span> … </template>
  <template data-name="L2"> … </template>
</div>
```
- `data-flip`: `|` 로 스텝을 나누고, 한 스텝 안에서 `이름@ms` 로 시간차 연쇄. 스텝 0 그룹은 장 진입 때 재생.
- 같은 `data-k` = 같은 DOM 노드가 옮겨 간다 → 이전 위치·크기에서 새 위치로 이동(FLIP). `data-arc="px"` 로 곡선(부호로 휘는 방향), `data-dur` `data-delay` `data-ease="move|out|in|pen|cubic-bezier(…)"`.
- 새 키 = 등장(`data-in="mask|rise|fade|drop|pop|grow|left|none"`), 없어진 키 = 퇴장(`data-out="under|fade|sink|up|fall|shrink"`, `data-out-dur`, `data-out-delay`). 클래스·색·투명도가 바뀌면 그 변화도 함께 보간된다.
  - `mask`·`under` 는 스타일 theme.js 가 정의한 "바닥선 아래에서 떠오름/가라앉음"이다(스타일 A·B 에 있음).
- `data-k` 는 잎 요소에만(중첩 금지). 텍스트뿐 아니라 도형(div)도 키를 주면 위치·크기가 FLIP 된다(크기는 높이 비율로 균일 확대).
- `data-enter="mask|rise|fade|none"`: 장 진입 때 첫 레이아웃의 등장 방식. `data-enter-delay`, 낱말별 `data-enter-dur`.
- 박스 위치는 `style="left/top"` 또는 CSS. 박스는 `position:absolute` 이고 내용 크기만큼 자란다.

## 4. 펜 — 손으로 긋는 선(교정 부호·밑줄·동그라미)
템플릿 안에 자리표시를 둔다. 그 레이아웃에 처음 나타날 때 그려지고, 사라지면 흐려진다.
```html
<i class="pen" data-pk="s1" data-pen="strike" data-to="help" data-delay="300" data-dur="500" data-w="11px" data-color="#E36007"></i>
```
- 종류: `strike`(취소선) `underline` `circle` `caret`(삽입 ‸) `check` `bracket` `swap`(data-a, data-b: 자리바꿈) `arrow`(data-a → data-b, `data-bend`). 스타일 B 는 `lead`(고친 말 → 여백 주석 지시선)를 더한다.
- 대상 `data-to="키 키"` 는 그 레이아웃 안 글자의 실제 위치를 재서 그린다(글자가 움직이면 다음 레이아웃에서 다시 잰다).
- 새 종류: theme.js 에서 `Stage.pens.myMark = (g, j, pen) => ['M… path', …]` (g = {x,y,w,h,fs,base,top,bottom,mid}, j() = 0~1 결정적 난수).
- 기본 색 `--pen`, 굵기 `--pen-w`(theme.css).
- 제자리에 남아야 하는 교정 자국(다음 레이아웃에서 글자가 움직여도 따라가면 안 되는 것)은 정적 SVG + `data-fx="draw"` 로 그린다.

## 5. 매치컷(엔진 기본)
앞 장과 뒷 장에 같은 `data-match="키"` 요소가 있으면 장 전환 때 앞 장 도형이 커져 화면을 덮고(0.56s) → 뒷 장 도형 크기로 줄어든다(0.7s). 색은 각 요소의 배경색(`data-match-color` 로 지정 가능). meta.json 의 reveal `transition` 은 `"none"` 으로.
- 기본 길이 합 1.26s → 1.2s 규칙에 맞추려면 `data-match-out="450"`(앞 장)·`data-match-in="550"`(뒷 장)으로 줄인다.
- 덮개는 축 정렬 상자다 → ◆ 처럼 회전한 도형에서 시작하면 상자로 커진다. 원·막대·■ 에서 시작한다.
- 스타일 C 는 더 정교한 자체 컷(`Deck.cut` — cover 는 원·모서리 클립으로 정확히 덮음, morph·carry 는 공유 요소)을 쓴다. `styles/C/DESIGN.md` 참고.

## 6. 장별 연출 코드
CSS 만으로 안 되는 연기(경로를 따라 달리기, 펜 끝을 타는 점, 계산이 필요한 위치)는 `js/<sid>.js` 에 쓴다.
```js
Deck.on('flow', (section, step, detail) => {
  // detail = { section, step, prev, forward, entering, mode }
  //   mode: 'enter'(앞으로 넘겨 장에 들어옴) | 'step'(클릭으로 한 스텝 앞으로) | 'instant'(뒤로 가기·건너뛰기 — 연기 없이 상태만)
  if (detail.mode !== 'step') return;                 // 연기는 앞으로 넘길 때만
  Stage.play(el, keyframes, { duration: 700, easing: Deck.MOVE });   // ?static 에서는 자동으로 빠진다
});
```
- **끝 상태는 CSS 가 갖는다.** JS 는 "앞으로 넘길 때 한 번 도는 연기"만 얹는다. 그래야 뒤로 가기·건너뛰기·?static·캡처가 언제나 맞는 화면을 보여 준다.
- 엔진 도우미: `Stage.play(el, kf, opt)`, `Stage.rect(el, box)`(슬라이드 px 좌표), `Stage.ease.{move,out,in,pen}`, `Stage.static`.
- 엔진 이벤트를 직접 받아도 된다: `document.addEventListener('stage:step', e => { const { section, step, prev, forward, entering, mode } = e.detail; … })`.

## 7. 기타
- `P`: 모든 애니메이션 일시정지/재개. `S`: 발표자 노트 창. `F`: 전체 화면. `?static`(주소 뒤에): 모든 모션을 끄고 최종 상태(OS 의 모션 줄이기 설정도 존중).
- **발표자 보기(S)에서 누르는 키**: reveal 의 발표자 보기는 키를 자기 안 미리보기 덱(주소에 `?receiver`)에 넘기고, 그 덱의 장·스텝만 0.5초 뒤 메인 창에 맞춘다. 그러면 P 일시정지나 장 스크립트의 키 가로채기가 메인 화면에 닿지 않는다. 그래서 엔진은 미리보기 덱이 받은 넘기기·되돌리기 키(Space·PageUp/Down·방향키·H J K L·N)와 P 를 메인 창으로 보내고(postMessage), 메인 창은 같은 keydown 을 직접 누른 것처럼 다시 쏜다. 메인 창에서 직접 누르는 키는 그대로다. `verify.mjs` 가 이것을 확인한다.
- reveal 기본 전환: meta.json `reveal.transition` 에 `fade`/`slide`/`none`, `transitionSpeed` 에 `default|fast|slow`.
- 이징 변수: `--ease-out`(등장) `--ease-move`(이동·카메라) `--ease-in`(퇴장) `--ease-pen`. `--ease-spring` 은 호환용으로만 남아 있다 — 쓰지 않는다(튕김 금지).

## 8. 주의 — 검증하며 나온 것
- `vector-effect: non-scaling-stroke` + `pathLength` + `stroke-dashoffset`(펜·`draw`)을 카메라 확대·축소 월드 안에서 함께 쓰면 Chrome 에서 대시가 어긋난다. 대시를 쓰는 선은 non-scaling-stroke 를 빼고 굵기를 월드 단위로 준다.
- `data-fx` 진입 규칙은 특이도가 높아 같은 요소의 다른 `animation` 을 덮어쓴다 → fx 는 래퍼에, 맥박 같은 다른 애니메이션은 안쪽 요소에.
- 펜은 레이아웃마다 대상 글자를 다시 잰다. 이미 그은 획이 글자를 따라 움직이면 안 되는 곳은 정적 SVG 로.
- 장 HTML 의 주석(`<!-- -->`)은 빌드가 지운다(장 사이에 있으면 장 분할을 깨뜨리기 때문).
- 첫 장 진입 연출은 캡처의 `--film <첫 장 sid>@0` 이 새로 고침으로 기록한다.
- **엔진이 쓰는 클래스 이름**은 장 CSS 에서 다른 뜻으로 쓰지 않는다: `on` · `now` · `gone`(스텝 공개) · `instant` · `noanim`(전환 끄기) · `present`(reveal 현재 장) · `stage-step`(스텝 자리표시). 예를 들어 장 CSS 에 `.gone { … }` 을 따로 만들면 엔진의 퇴장(`opacity !important`)이 덮인다.
- **장 스크립트가 키를 가로챌 때**는 `window` 의 keydown 을 capture 로 받고, `?receiver`(발표자 보기 안 미리보기)에서는 가로채지 않는다. 발표자 보기에서 누른 키는 엔진이 메인 창에 다시 쏴 주므로 같은 코드가 그대로 듣는다.
- 여러 손(pane)이 만든 장을 한 덱에 합치면 CSS·`@keyframes` 이름이 한 파일에 모인다. 장 CSS 선택자는 반드시 그 장의 클래스로 시작하고, `@keyframes` 이름에는 장 접두어를 붙인다.

## 9. 재생 클립 — 녹화 영상 대신 HTML 이 흘러가는 시연
"실제로는 이렇게 흘러갑니다" 같은 시연을 영상 대신 장 하나 안의 스크립트 재생으로 만든다. 가상 화면이라 익명화가 쉽고, 글자가 선명하고, 용량이 거의 없다.
- 클릭(스텝) 하나 = 재생 덩어리 하나. 사람이 결정하는 지점(승인 대기)에서 덩어리를 끊으면 "재생 → 멈춤 → 발표자가 말함 → → 로 승인 → 다음 덩어리"가 된다.
- 덩어리마다 보이지 않는 시계 요소에 WAAPI 애니메이션을 하나 걸고, 화면은 **그 시각의 순수 함수**로 그린다. 시계가 `document.getAnimations()` 에 잡히므로 P 일시정지가 그대로 듣는다.
- 언제 무엇이 켜지는지는 HTML 에 적는다: `data-q="<덩어리>@<초> <클래스>, …"` — 그 시각이 지나면 그 요소에 클래스가 붙는다. 모양은 CSS(`.p1 { … }`)가 갖는다.
- 앞으로 한 스텝 = 그 덩어리를 0초부터 재생. 뒤로·진입·`?static` = 그 덩어리의 끝 상태를 즉시(캡처도 끝 상태를 찍는다 — `data-shot-wait` 을 덩어리 길이보다 길게).
- 재생 중 넘기기 키 = 그 덩어리 끝(승인 대기)으로 건너뛴다. 승인을 실수로 지나치지 않게 하려는 것이다. 한 번 더 누르면 다음 덩어리.
```html
<section data-sid="demo" class="a-clip" data-steps="2" data-shot-wait="31000">
  <i class="clk" aria-hidden="true"></i>                       <!-- 시계(크기 0) -->
  <p class="cap" data-q="1@1.5 go, 1@12 ex">AI가 먼저 묻습니다</p>
  <i class="dot" data-q="1@4 go"></i> …
  <!-- CSS: .a-clip .cap { opacity: 0; transition: opacity .4s } .a-clip .cap.go { opacity: 1 } .a-clip .cap.ex { opacity: .28 }  (on·gone 같은 엔진 클래스 이름은 피한다) -->
  <aside class="notes">… (클릭) …</aside>
</section>
```
```js
(function () {
  const SID = 'demo', DUR = [0, 20, 30];                         // 덩어리별 길이(초). 0번 = 대기 화면
  const FWD = new Set([32, 34, 39, 40, 74, 76, 78]);              // Space · PageDown · → · ↓ · J · L · N
  const RECEIVER = /receiver/.test(location.search);
  const cue = (w) => { const m = /^(\d)@([\d.]+)$/.exec(w); return { c: +m[1], t: +m[2] }; };
  const past = (q, c, t) => q.c < c || (q.c === c && q.t <= t);
  const items = (sec) => sec._q || (sec._q = [sec, ...sec.querySelectorAll('[data-q]')].flatMap((el) =>
    (el.dataset.q || '').split(',').filter((x) => x.trim()).map((x) => { const [w, cls] = x.trim().split(/\s+/); return { el, q: cue(w), cls }; })));
  const render = (sec, c, t) => items(sec).forEach((it) => it.el.classList.toggle(it.cls, past(it.q, c, t)));
  const snap = (sec, c, t) => { sec.classList.add('instant'); render(sec, c, t); void sec.offsetWidth; sec.classList.remove('instant'); };
  const stop = (sec) => { if (sec._run) { sec._run.cancel(); sec._run = null; } };
  function play(sec, c) {
    stop(sec); snap(sec, c, -1);                                   // 앞 덩어리들은 끝난 상태에서 시작
    const a = (sec._run = sec.querySelector('.clk').animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR[c] * 1000, fill: 'forwards' }));
    a.c = c;
    const tick = () => {
      if (sec._run !== a) return;
      if (!sec.classList.contains('present')) return stop(sec);   // 다른 장으로 가면 멈춘다
      render(sec, c, Math.min(DUR[c], (a.currentTime || 0) / 1000));
      if (a.playState === 'finished') { sec._run = null; return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  Deck.on(SID, (sec, step, d) => {
    if (d.mode === 'step' && step > 0 && !Stage.static) play(sec, step);
    else { stop(sec); snap(sec, step, DUR[step] || 0); }
  });
  window.addEventListener('keydown', (e) => {                     // 재생 중 넘기기 = 덩어리 끝으로
    if (RECEIVER || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !FWD.has(e.keyCode)) return;
    const sec = Reveal.getCurrentSlide();
    if (!sec || sec.dataset.sid !== SID || !sec._run) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const c = sec._run.c; stop(sec); snap(sec, c, DUR[c]);
  }, true);
})();
```
- 노트에는 "실제로는 몇 분~몇십 분 걸리는 일을 줄였다"는 말과, 재생 중 조작(넘기기 = 구간 끝, P = 일시정지)을 적는다.
- 숫자가 올라가는 표시(예: 자동 점검 0/12 → 12/12)는 `data-count="<덩어리>@<초> <덩어리>@<초> <끝 수>"` 처럼 두 시각 사이를 세는 속성을 하나 더 두고 render 에서 글자를 바꾸면 된다.
