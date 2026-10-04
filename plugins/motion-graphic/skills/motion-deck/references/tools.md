# 도구 — 만들기·빌드·캡처·검증

`$SKILL` = Codex가 읽은 `SKILL.md`의 실제 설치 폴더(폴더만 설치한 예: `~/.agents/skills/motion-deck`). 플러그인 설치는 Codex 플러그인 캐시 안의 `skills/motion-deck/`를 쓴다. 모든 명령은 발표 프로젝트 폴더에서 실행한다.

## 준비물
- **Node 22 이상**: 스크립트가 내장 `fetch`·`WebSocket` 을 쓴다. `node --version` 으로 확인한다.
- **Chrome**: Edge·Chromium 도 된다. 못 찾으면 환경 변수 `CHROME_PATH` 에 실행 파일 경로를 넣는다.
- Playwright·Puppeteer 는 쓰지 않는다. 설치할 것이 없다.
- 폰트(Pretendard Variable, OFL)·reveal.js 5.2.1(MIT)·엔진은 스킬에 들어 있다. 빌드가 단일 파일에 넣는다.

## 명령
| 하는 일 | 명령 |
|---|---|
| 프로젝트 뼈대 | `node $SKILL/scripts/new-deck.mjs <프로젝트 폴더> --style A\|B\|C [--title "발표 제목"]` |
| 빌드 | `node $SKILL/scripts/build.mjs deck --out dist/<이름>.html` |
| 캡처·검사 | `node $SKILL/scripts/capture.mjs dist/<이름>.html out/shots [--only sid1,sid2] [--film sid@step,…] [--wait 2400] [--film-ms 2600] [--static]` |
| 모음 그림 | `node $SKILL/scripts/sheet.mjs dir out/shots out/sheet.png [--cols 4]` |
| 나란히 비교 | `node $SKILL/scripts/sheet.mjs compare out/cmp.png out/shots-old out/shots --keys title-s0,flow-s3 --labels 전,후` |
| 단일 파일 검증 | `node $SKILL/scripts/verify.mjs dist/<이름>.html` |
| 시간표 근거 | `node $SKILL/scripts/timing.mjs deck [--rate 4.5] [--click 1]` — 노트 음절 ÷ 말하는 속도 + 문장 쉼 + 클릭 |

### new-deck 이 만드는 것
```
<프로젝트>/
  deck/   meta.json · theme.css · theme.js · DESIGN.md(고른 스타일에서 복사) · slides/ · css/ · js/ · img/
  story/  brief.md · slides.md · status.md · timing.md(템플릿 — 이미 있으면 덮어쓰지 않는다)
  out/ · dist/
```
- 스타일 파일은 **복사**한다. 그래서 이 발표에 맞게 토큰(색)을 바꿔도 스킬의 원본은 그대로다.
- 샘플 장은 복사하지 않는다. 패턴이 필요하면 `$SKILL/styles/<X>/samples/` 를 읽고 옮겨 쓴다.

### build 가 막는 것(하나라도 걸리면 파일을 만들지 않는다)
- `meta.forbidden` 의 말: 화면·노트·CSS·JS·제목 어디에서든 막는다. `allow` 로 한 장에서만 허용할 수 있다.
- `anonymize: true` 이면 금액 표기(원·달러·₩·$)와 도메인 주소도 막는다.
- 외부 URL: 단일 파일은 오프라인에서 열린다. 사진·영상·폰트는 상대경로로 두면 빌드가 data URI 로 넣는다.
- 장 HTML 안의 `<script>`, 발표자 노트가 없는 장, `data-sid` 가 겹치는 장, 없는 파일 참조.
- 40MB 를 넘으면 경고한다. 영상·사진을 줄여야 한다.

### capture 가 보는 것(`out/shots/capture.json`)
첫 장 0스텝부터 실제 발표처럼 `→` 를 누르며 상태마다 `<sid>-s<step>.png` 를 찍고, 그 화면을 검사한다.

| 이슈 | 뜻 | 고치는 법 | 예외 표시(정말 그럴 때만) |
|---|---|---|---|
| `small` | 실효 글자 < 32px(카메라 축소까지 반영) | 키우거나, 카메라 배율을 올리거나, 라벨을 뗀다 | `data-audit="small"`(28px까지 — 출처 한 줄만) |
| `overlap` | 글자끼리 겹침 | 자리·줄바꿈·크기를 고친다 | `data-audit="overlap"`(일부러 겹친 연출) |
| `offscreen` | 화면 밖 글자 | 자리를 고친다 | `data-audit="bleed"`(의도된 잘림) |
| `contrast` | 글자 대비 < 4.5 | 색을 바꾼다(`rules.md` 5절 대비표) | `data-audit="decor"`(읽지 않아도 되는 장식 글자) |
| requests | 외부 요청 | 외부 참조를 지운다 | 없음 |
| console | 콘솔 오류 | 연출 코드를 고친다 | 없음 |

- 불투명도 0.2 미만(꺼진 조명)인 글자는 검사에서 뺀다. 대비 검사는 불투명도 0.6 이상인 글자만 한다.
- 이슈·콘솔 오류·외부 요청이 있으면 종료 코드 1 로 끝난다.
- `--only` 를 써도 처음부터 넘기며 간다(앞 장의 상태가 뒷 장 진입에 영향을 줄 수 있어서). 고친 장만 다시 볼 때 쓴다.
- 장마다 대기가 더 필요하면 `<section data-shot-wait="1500">` 을 단다(캡처에만 영향).

### 필름 — 움직임을 정지 화면으로 확인
`--film sid@step` 은 그 스텝으로 넘어가는 순간을 기록해 8프레임 모음 `<sid>-s<step>-film.png` 를 만든다(기본 2.6s 구간, `--film-ms` 로 조정).
- 첫 장 진입은 `--film <첫 장 sid>@0`(새로 고침으로 기록), 장 사이 전환은 `--film <다음 장 sid>@0`.
- 볼 것: 클릭 연출이 1.2s 안에 끝나는가, 튕김(지나쳤다 돌아옴)이 없는가, 한 번에 한 동작인가, 글자가 다 나온 뒤 읽을 틈이 있는가.
- 필름은 프레임이 바뀔 때만 찍히므로, 뒤쪽 칸이 같은 시각으로 반복되면 움직임이 그때 끝났다는 뜻이다.

### verify 가 보는 것
단일 파일을 **프로젝트 밖 임시 폴더로 복사해 `file://` 로 열고** 확인한다(폴더 의존이 남아 있으면 여기서 잡힌다).
- 외부 요청 0, 콘솔 오류 0, Pretendard 로드
- 노트 없는 장 0, `→`·`←` 진행, `P` 일시정지
- `S` 발표자 노트 창이 열리고 노트 글이 보이는가, 40MB 이하인가
- **발표자 보기 창에서 누른 `→`·`←`·`P` 가 메인 화면에 닿는가.** 노트북으로 발표하면 초점은 보통 발표자 보기 창에 있다. reveal 은 이 창의 키를 안쪽 미리보기에 넘기고 장·스텝만 0.5초 뒤 메인에 맞춘다. 그래서 엔진이 넘기기·되돌리기·P 를 메인 창으로 직접 보낸다(`engine.md` 「발표자 보기」).
- 결과는 `out/verify/<이름>.json` 에 남는다.

## 검토 루프(장 하나를 만들 때마다)
1. 빌드한다. 막히면 메시지대로 고친다.
2. 그 장만 캡처한다(`--only <sid> --film <sid>@1,…`).
3. `capture.json` 의 이슈를 0 으로 만든다.
4. **스크린샷과 필름을 직접 열어 본다**(사용 가능한 이미지 보기 도구로 PNG). 검사 통과는 최소 조건일 뿐이다. 아래를 본다.
   - `rules.md` 8절 "AI 느낌" 목록에 걸리는 것이 없는가
   - 크기 대비와 여백이 살아 있는가
   - 스타일 DESIGN.md 의 색·기호를 지켰는가
   - 말투 규칙(3절)을 지켰는가
5. 고친 장만 다시 캡처한다. 다 만들면 전체를 한 번 캡처하고 모음 그림으로 덱 전체의 리듬을 본다(같은 구도가 계속되지 않는지, 장마다 구도가 달라도 한 시스템으로 읽히는지).

## 마감 검사(덱 전체 — 납품 전에 한 번)
1. 전체 빌드 → 전체 캡처. 챕터 경계마다 `--film <다음 장 sid>@0` 으로 **이음새 필름**을 찍는다(앞 장의 끝 화면이 다음 장 진입으로 이어지는지).
2. 챕터별 모음 그림(`sheet.mjs dir`)을 만들어 덱 전체의 리듬과 시그니처 오브젝트의 일관성을 본다.
3. **내용 대조**: `story/slides.md` 의 장마다 「메시지」가 화면이나 발표자 노트에 빠짐없이 있는지 한 장씩 대조한다. 화면에서 뺀 풀이·사례는 노트에 있어야 한다. 빠진 것은 노트에 보탠다.
4. **합친 뒤 충돌**: 여러 손(pane)이 만든 장을 합쳤다면 장 CSS 선택자가 모두 자기 장 클래스(`.a-…`)로 시작하는지, `@keyframes` 이름이 겹치지 않는지 확인한다. 가능하면 pane 이 찍은 화면과 통합본 화면을 픽셀로 비교한다.
5. `verify.mjs` PASS(발표자 보기 조작 포함). 재생 클립처럼 키를 가로채는 장이 있으면 발표자 보기 창에서도 그 조작을 따로 시험한다.
6. `timing.mjs` 숫자와 제작 때 적은 장별 예상을 모아 `story/timing.md` 를 쓴다(둘 중 긴 쪽을 채택, 줄이는 순서는 제안만).

## 메모리·프로세스
- 캡처·검증·모음 그림은 **기기 전체에서 한 번에 하나만** 돈다(임시 폴더의 `motion-deck-chrome.lock`). 다른 것이 돌고 있으면 기다렸다가 이어서 한다. 병렬 pane 이 동시에 캡처해도 Chrome 이 여러 개 뜨지 않는다.
- 끝나면 자기가 띄운 headless Chrome 프로세스 트리를 정리한다. **사용자가 쓰는 Chrome 은 절대 종료하지 않는다**(`taskkill /IM chrome.exe` 같은 명령 금지).
- 잠금 파일은 주인 프로세스가 죽었거나 90초 넘게 갱신이 없으면 저절로 풀린다. 그래도 막히면 잠금 파일의 PID 를 확인한 뒤 지운다.
- 메모리가 빠듯한 PC 에서는 전체 캡처(100장 이상 + 필름)가 도중에 강제 종료될 수 있다. 병렬 pane 은 **자기 장만** 캡처하고, 전체 캡처와 단일 파일 검증은 메인이 통합본으로 **한 번** 한다. 끝난 pane 은 바로 닫는다.
- 메모리가 부족하면 실행 환경이 백그라운드 명령(감시·대기)을 멈출 수 있다. 감시가 사라졌으면 사용자에게 알리고 다시 건다.

## 막힐 때
| 증상 | 할 일 |
|---|---|
| `Chrome·Edge·Chromium 을 찾지 못했다` | `CHROME_PATH` 설정(Windows 예: `C:\Program Files\Google\Chrome\Application\chrome.exe`) |
| `WebSocket is not defined` | Node 22 이상으로 실행 |
| 캡처가 `더 이상 넘어가지 않음` 으로 일찍 끝남 | 마지막 장이 아닌데 멈췄다면 `data-steps` 수와 실제 상태 정의를 확인 |
| 폰트가 실패로 나옴 | 빌드를 다시 하고 `<style>@font-face` 가 들어갔는지 확인(스킬 `fonts/` 의 파일이 있어야 함) |
| 첫 장 필름이 비어 있음 | `--film <첫 장 sid>@0` 의 sid 철자 확인, 진입 연출이 `stage-ready` 뒤에 시작하는지 확인 |
| `?print-pdf` 가 빈 화면 | 쓰지 않는다. 정지 화면이 필요하면 캡처 PNG 를 쓴다 |
