# 병렬 제작 — Herdr pane 으로 챕터 나누기

Herdr 안에서 실행 중일 때만 쓴다(`test "$HERDR_ENV" = 1`). 아니면 혼자 순서대로 만든다.
메인 세션(나)은 **지휘·통합·검수**를 맡는다. 덱 전체를 끌고 가는 가장 어려운 장면(시그니처 시퀀스, 큰 그림)은 내가 직접 만들거나 가장 강한 모델의 pane 에 맡긴다.

## 언제 나누나
- 장 목록이 승인되고, 스타일 공통 파일(`deck/theme.*`, `deck/DESIGN.md`)이 준비된 뒤.
- 장이 12장 이상이고 챕터끼리 독립적일 때. 그보다 작으면 나누는 비용(지시서·통합·일관성 맞추기)이 더 크다.
- **추가 pane 은 동시에 최대 3개**다. 메모리가 빠듯한 PC 에서 백그라운드 작업이 강제 종료된 적이 있다. Chrome 캡처는 기기 전체 잠금으로 한 번에 하나만 돈다.

## 순서
1. **공통 지시서** `work/COMMON.md` 를 쓴다(모든 pane 이 같이 읽는다).
   - 읽는 순서: `deck/DESIGN.md` → `$SKILL/references/rules.md` → `engine.md` → `tools.md` → 자기 `BRIEF.md`
   - **자기 폴더 `work/<이름>/` 에만 쓴다.** `deck/`·`story/`·다른 pane 폴더는 읽기만 한다. 공통 테마 변경이 필요하면 `work/<이름>/REQUESTS.md` 에 적는다.
   - 폴더 구조: `work/<이름>/{meta.json, slides/, css/, js/, img/}`. meta.json 은 `{ "extends": "../../deck", "title": "미리보기 — <이름>" }` 이다. 그러면 공통 테마를 이어받은 미리보기를 자기 폴더에서 빌드할 수 있다.
   - 장 파일 이름은 장 목록의 순서 번호로 짓는다(통합 때 그대로 `deck/slides/` 로 옮긴다).
   - 금지: 추가 pane·하위 에이전트, 시안 여러 벌(한 벌만), Playwright, 사용자 Chrome 종료.
   - 진행 보고 `work/<이름>/REPORT.md` 는 아래 표를 장마다 갱신하고, 다 끝나면 **마지막 줄에 `DONE`** 을 쓴다.
     `| 장 | 상태 | 한 줄 연출 | 클릭 수 | 클릭별 최장(ms) | 예상 발표 시간(초) | ✂ 후보 |`
     표 아래에는 이 절들을 둔다: 장 목록의 화면 제안에서 바꾼 것과 이유 / 검사 결과(빌드·캡처·verify 출력) / 이미지가 꼭 필요한 곳 / 공통 테마 요청 / 질문.
   - **캡처는 자기 장만**(`--only` 와 필름). 덱 전체 캡처와 단일 파일 검증은 메인이 통합본으로 한 번 한다. pane 셋이 각자 전체 캡처(필름 포함 수십 장)를 돌리면 메모리가 모자라 도중에 죽는다.
   - 장 CSS 선택자는 그 장의 클래스로 시작하고, `@keyframes` 이름에는 장 접두어를 붙인다(합치면 한 파일이 된다).
2. **pane 마다 지시서** `work/<이름>/BRIEF.md` 를 쓴다.
   - 맡은 장 목록(장마다 메시지 한 줄과 메인 지시)
   - 이미 있는 것
   - 다른 pane 과 공유하는 기호·오브젝트(누가 원본을 갖는지)
   - 작업 순서(가장 어려운 장 먼저)
3. **pane 을 연다**(Windows Git Bash 는 `export MSYS_NO_PATHCONV=1` 먼저).
   ```bash
   herdr pane layout --pane "$HERDR_PANE_ID"                       # 넓으면 right, 좁거나 길면 down
   herdr pane split --pane "$HERDR_PANE_ID" --direction right --cwd "<프로젝트>" --no-focus   # → .result.pane.pane_id
   herdr agent start g1 --kind codex --pane <새 pane id> -- -m <모델> -c model_reasoning_effort=<수준>
   herdr agent prompt g1 "work/COMMON.md 와 work/g1/BRIEF.md 를 읽고 시작해라. 끝나면 REPORT.md 마지막 줄에 DONE."
   # 프롬프트가 입력창에만 남아 있으면: herdr agent send-keys g1 enter
   ```
   - 모델은 난이도로 고른다. 어려운 연출 챕터는 가장 강한 모델에 높은 effort, 가벼운 장·검증은 중간 모델이면 된다.
   - `herdr agent start` 가 권한 문제로 거부되면 우회하지 말고 사용자에게 알린 뒤 혼자 순서대로 만든다.
4. **기다린다.** pane 마다 백그라운드로 `herdr agent wait g1 --timeout 7100000` 을 건다(pane 이 백그라운드 명령을 기다리며 잠깐 멈췄다가 다시 일하는 경우가 있으니, 다시 걸 때는 `--until working` 뒤에 한 번 더 기다린다). 메모리가 빠듯하면 실행 환경이 이 대기 명령을 멈출 수 있다 — 사라졌으면 사용자에게 알리고 다시 건다. 돌아오면:
   - `REPORT.md` 마지막 줄이 `DONE` 이면 검수로 간다.
   - 아니면 질문이나 막힘으로 멈춘 것이다. `herdr agent read g1 --source recent-unwrapped --lines 80` 으로 보고 답한다(`herdr agent prompt`).
5. **검수**: 보고서, 모음 그림, 필름을 직접 본다(`tools.md` 검토 루프). 질문에 답하고, 사용자 확인이 필요한 것은 `story/status.md` 에 모은다.
6. **통합**: `work/<이름>/{slides,css,js,img}` 를 `deck/` 같은 자리로 복사하고 빌드한다. 한 pane 만 합쳤을 때는 pane 미리보기 빌드와 통합 빌드가 `<title>` 줄 말고 같아야 한다(`diff` 로 확인). 여럿을 합친 뒤에는 통합본을 전체 캡처해 pane 이 찍은 화면과 픽셀로 비교한다(`tools.md` 「마감 검사」).
7. **pane 을 닫는다**: 결과를 회수하면 바로 `herdr pane close <pane id>`.
8. `story/status.md` 의 pane 표(이름 · pane id · 맡은 장 · 모델 · 전용 폴더 · 상태)를 갱신한다. 사용자가 진행을 여기서 본다.

## 일관성 맞추기
- 여러 챕터가 같은 오브젝트(시그니처 본체, 큰 그림의 기호)를 쓰면 **원본을 한 pane 에 두고** 다른 pane 은 읽기만 하게 한다.
- 원본이 확정되면 나머지 pane 에 알린다. `work/<이름>/FROM-MAIN.md` 에 무엇을 어떻게 맞출지(원본 파일, 화면 PNG, 맞출 항목)를 적고, `herdr agent prompt <이름> "work/<이름>/FROM-MAIN.md 를 읽고 반영해라"` 로 짧게 부른다.
- 다른 워크스페이스·탭의 pane 은 건드리지 않는다. 내가 연 pane 만 닫는다.
