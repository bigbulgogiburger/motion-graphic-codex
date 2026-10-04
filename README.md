# motion-graphic (Codex)

말로 하는 발표를 **모션그래픽 슬라이드**로 만드는 Codex 스킬(`motion-deck`)입니다. 결과물은 인터넷 없이 더블클릭으로 열리는 **HTML 파일 하나**입니다.

- 발표자가 앞에서 말하고 화면이 뒤에서 돕는 발표에 씁니다. 보고서·제안서처럼 읽는 문서는 만들지 않습니다.
- 결과물 HTML 안에 CSS·JS·폰트·이미지가 모두 들어 있습니다.
  - 발표 조작: `→`·`←` 진행 · `S` 발표자 노트 · `P` 일시정지 · `F` 전체 화면
- 실제 사내 컨퍼런스 발표(33장)를 만들면서 다듬은 과정을 그대로 스킬로 옮겼습니다.

## 스타일 세 가지

| A 「무대」 | B 「지면」 | C 「색면과 도형」 |
|---|---|---|
| ![A](plugins/motion-graphic/skills/motion-deck/styles/A/shots/sheet.png) | ![B](plugins/motion-graphic/skills/motion-deck/styles/B/shots/sheet.png) | ![C](plugins/motion-graphic/skills/motion-deck/styles/C/shots/sheet.png) |
| 검정 무대에 한 번에 하나만 불을 켭니다. 큰 글자가 움직이며 말하고 카메라가 따라갑니다. | 흰 지면 위에 글이 조판되고, 사람은 주황 펜으로 고칩니다. | ◆ 사람 · ● AI · ■ 장치 세 도형이 배우처럼 연기하고, 글자는 자막입니다. |

움직이는 미리보기는 `plugins/motion-graphic/skills/motion-deck/styles/<A|B|C>/preview.html` 을 내려받아 더블클릭한 뒤 `→` 로 넘겨 보면 됩니다.

## 진행 순서
1. **브리프**: 준 자료를 먼저 읽고 빈칸(주제·청중·시간)만 묻습니다.
2. **스타일 고르기**
3. **장 목록**: 한 번만 승인받습니다.
4. **제작**: 끝까지 만듭니다.
   - 가장 어려운 장면부터 만듭니다.
   - Herdr 안에서 돌리면 챕터를 pane에 나눠 병렬로 만듭니다.
5. **검사**
   - 빌드: 금칙어·외부 참조·서체 검사
   - 헤드리스 Chrome 캡처: 글자 크기·겹침·대비·외부 요청
   - 모션 필름
   - 단일 파일 `file://` 검증: 발표자 보기 키 전달까지
6. **납품**: 단일 HTML, 타이밍표, 사용자 확인이 필요한 목록

## 필요한 것
- Codex CLI (`codex plugin` 명령이 있는 버전; 0.159.3에서 검증)
- Node.js 22 이상: 스크립트가 내장 `WebSocket`·`fetch` 를 씁니다. npm 설치는 필요 없습니다.
- Chrome·Edge·Chromium 중 하나: 자동으로 찾고, 못 찾으면 `CHROME_PATH` 를 씁니다.
- 선택
  - Herdr: 병렬 제작
  - 이미지 생성 도구: 사진·일러스트가 꼭 필요할 때(Codex에서 직접 생성)
- Windows에서 만들고 검증했습니다.

## 설치

### 플러그인으로 (권장)
```bash
codex plugin marketplace add bigbulgogiburger/motion-graphic-codex --ref main
codex plugin add motion-graphic@motion-graphic
```
- 확인: `codex plugin list --marketplace motion-graphic`
- 새 Codex 세션에서 `/skills` 또는 `$` 선택기로 `motion-graphic:motion-deck`를 골라 「발표 주제 · 자료 폴더 · 요청」을 적습니다.
- 업데이트: `codex plugin marketplace upgrade motion-graphic` 후 `codex plugin add motion-graphic@motion-graphic`를 다시 실행하고 새 세션을 엽니다.

### 스킬 폴더만 복사해서
`plugins/motion-graphic/skills/motion-deck` 폴더 전체를 `~/.agents/skills/motion-deck`에 복사합니다. `agents/openai.yaml`과 스크립트·에셋도 함께 복사합니다.
- 프로젝트에서만 쓰려면 해당 프로젝트의 `.agents/skills/motion-deck`에 복사합니다.
- 부르기: `$motion-deck 발표 주제 · 자료 폴더 · 요청`
- Codex가 자동으로 찾지 못하면 새 세션을 엽니다.

이 스킬은 직접 부를 때만 동작합니다(`agents/openai.yaml`의 `policy.allow_implicit_invocation: false`).
`$SKILL`은 Codex가 읽은 `SKILL.md`의 실제 설치 폴더입니다. 플러그인 캐시 경로를 고정해서 쓰지 않습니다.

## 구성

| 경로(`plugins/motion-graphic/skills/motion-deck/` 아래) | 내용 |
|---|---|
| `SKILL.md` · `agents/openai.yaml` | 진행 여섯 단계·규칙·직접 호출 정책 |
| `references/` | rules(말투·글자·색·모션·"AI 느낌" 목록) · engine(무대 엔진) · tools(검사) · parallel(Herdr) · images · new-style |
| `styles/A·B·C/` | 디자인 시스템(DESIGN.md·theme) · 샘플 3장 · 미리보기 · 스크린샷 |
| `scripts/` | new-deck · build · capture · sheet · verify · timing (Node 스크립트, Playwright 없음) |
| `engine/` · `vendor/reveal/` · `fonts/` | 빌드가 넣는 무대 엔진 · reveal.js · Pretendard |
| `templates/` | 브리프·장 목록·진행·타이밍 양식 |

## 원본과 포팅 범위
[Claude Code 원본](https://github.com/bigbulgogiburger/motion-graphic) v1.0.0(커밋 `bec6e91`)을 Codex에 맞게 옮겼습니다.
- 질문은 한 번에 하나씩 평문으로 하고, Herdr 제작 pane은 Codex 명령으로 엽니다.
- 이미지는 현재 Codex 세션에서 직접 생성할 수 있으면 직접 만듭니다.
- 진행 단계·말투·검사 기준은 같습니다. Node 스크립트·엔진·폰트·스타일·샘플·미리보기·템플릿은 원본 그대로입니다.
- 마켓플레이스: `.agents/plugins/marketplace.json`
- 플러그인: `plugins/motion-graphic/.codex-plugin/plugin.json`

설치 형식과 직접 호출 정책은 [OpenAI 플러그인 문서](https://developers.openai.com/plugins/build/plugins)와 [스킬 문서](https://learn.chatgpt.com/docs/build-skills)를 참고합니다.

## 라이선스
- 이 저장소: MIT
- 동봉한 것
  - reveal.js: MIT, `plugins/motion-graphic/skills/motion-deck/vendor/reveal/LICENSE`
  - Pretendard: SIL OFL 1.1, `plugins/motion-graphic/skills/motion-deck/fonts/LICENSE.txt`
