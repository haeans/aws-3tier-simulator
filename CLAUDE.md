# AWS 3-Tier 아키텍처 시뮬레이터 — 작업 안내

캔버스에 AWS 서비스와 영역(VPC/AZ/서브넷)을 배치·연결하고 3-Tier 구성이 맞는지 검증하는 학습용 웹 도구.
**작업 전에 README.md를 먼저 읽고, 필요한 문서를 이어서 읽는다.**
- GUIDE.md: 주요 기능(1장), 파일 구조(2장), 알려진 제한 사항(3장), 설계 결정(4장)
- ROADMAP.md: 남은 작업 (진행 중·확정·후보·보류·제외·완료)
- CHANGELOG.md: 변경 이력

## 작업 규칙 (사용자가 정한 것)

- 모든 답변과 코드 주석은 한국어로 쓴다. 사용자 안내 문구는 AWS 초보자도 이해할 수 있는 쉬운 말로 쓴다.
- 여러 항목을 함께 요청받아도 한 번에 하지 않는다. 한 단계씩 끝내고 사용자의 테스트 확인을 받은 뒤 다음으로 넘어간다.
- 작업이 끝나면 **사용자가 테스트할 항목 2~4개만** 적는다. 변경 내용과 내부 검증 과정은 쓰지 않는다. 아래 경우에만 그 내용을 보고한다:
  - 오류가 났거나 작업이 실패한 경우
  - 계획과 다르게 고쳤거나, 명세에 없어서 직접 정한 부분이 있는 경우
- 코드를 바꿀 때마다 CHANGELOG.md 맨 위에 항목을 추가한다. package.json의 version도 같은 번호로 맞춘다.
  - 버전: 기능 추가는 가운데 숫자(1.8 → 1.9), 버그 수정만 있으면 끝 숫자(1.8 → 1.8.1)
  - 기능이나 구조가 바뀌면 GUIDE.md(주요 기능·파일 구조·설계 결정), ROADMAP.md(남은 작업), README.md(현재 상태)도 함께 맞춘다.
- docs/ 폴더의 txt는 사용자의 개인 메모다. 사용자가 내용을 주며 요청할 때만 다룬다.
  - docs/는 커밋하지 않는다. 커밋할 때 넣을지 묻지 않는다.

### 중단·승인 규칙

1. 허용된 도구 목록에 없거나 새로 쓰는 도구·프로그램이 필요하면 멈추고, 질문해서 승인을 받는다.
2. 계정 변경, 외부 전송, 삭제처럼 상태를 바꾸는 작업은 사람 확인을 받는다. **git commit과 push도 매번 승인을 받는다.**
3. 같은 실패가 두 번 반복되면, 다른 입력을 시도하기 전에 원인을 먼저 알린다.
4. 근거 문서를 찾지 못하면 찾지 못했다고 답한다.
5. 도구 결과가 서로 충돌하면 최신 결과만 고르지 않고 차이를 보여준다.

## 코드 규칙

- **사용자 실행 환경: 외부 라이브러리 없음, 서버 없음.** index.html을 더블클릭해서 바로 실행된다.
- **예외: 개발 도구는 허용한다** (사용자 승인 2026-10-14). 사용자 실행 파일(index.html, css, js)에는 넣지 않는다.
  - Node.js, Playwright(자동 테스트), ESLint(코드 검사)는 package.json의 devDependencies로 관리한다.
  - `// @ts-check`(타입 검사)를 js 파일마다 첫 줄에 둔다. 새 js 파일에도 넣는다. 설정은 tsconfig.json(기본 강도)이다.
  - VS Code 확장은 설치하지 않는다. 필요한 도구는 npm으로 받아 명령줄에서 쓴다.
  - 새 npm 패키지를 추가하는 것은 "새 도구"에 해당하므로 승인을 받는다.
    - 승인됨: `typescript` (@ts-check 검사용, 2026-10-14)
- **ES 모듈(import/export)은 쓰지 않는다.** 서버 없이 파일로 열면(file://) 브라우저가 막는다.
  - 일반 `<script>` 태그를 index.html에 순서대로 둔다. 순서: data → rules → ui → main.js(항상 마지막)
  - 파일 사이에서는 전역 변수·함수를 공유한다.
  - 다른 파일의 함수는 실행 시점에만 호출한다. 파일을 불러오는 도중(최상위 코드)에 뒤쪽 파일의 함수를 부르면 안 된다.
- 서비스 추가: `js/data/services.js`의 SERVICES와 SERVICE_DESC, `js/data/guide.js`의 SERVICE_GUIDE(설명 패널), `js/data/references.js`의 SERVICE_DOCS(공식 문서)
- 규칙 추가: `js/rules/` 안의 배열(PLACEMENT_RULES / VALIDATION_RULES / SUGGESTION_RULES)
- 배치·이동·크기 조절은 반드시 `commit(before, actedId, movedIds)`(js/ui/core.js)를 거친다.
  - commit은 소속을 다시 계산하고, 규칙 위반이나 겹침이 있으면 동작 전 상태로 되돌린다.
- 되돌리기 기록은 `render()` 끝에서 자동으로 한다(`recordHistory`, js/ui/render.js). 상태를 바꾸는 동작은 마지막에 render()를 불러야 기록된다.
- 드래그 중에는 `render()`(DOM 전체 재생성)를 부르지 않고 `updatePositions()`를 쓴다.
  - render()를 부르면 포인터를 잡고 있던 요소가 사라져 드래그가 끊긴다.

## 테스트 방법

코드를 바꾼 뒤에는 **항상 두 명령을 실행**하고 모두 통과한 다음 보고한다.

```
npm run lint     # ESLint 코드 검사 + 타입 검사(tsc) (오류 0개여야 함)
npm test         # Playwright 자동 테스트 (tests/*.spec.js, 이 PC의 Edge로 실행)
```

- **Node.js 경로:** `C:\Program Files\nodejs`. 터미널이 node를 못 찾으면 경로를 앞에 붙여 실행한다.
  - bash: `export PATH="/c/Program Files/nodejs:$PATH"`
  - VS Code를 다시 시작하면 경로를 인식한다.
- **테스트 파일 구성**
  - `tests/helpers.js`: 앱 열기, 실제 마우스로 끌기, 팔레트에서 놓기, 정상 구성 만들기
  - `tests/placement.spec.js`: 배치·영역·겹침·스냅·크기 조절·저장·화면 이동
  - `tests/edges.spec.js`: 연결점 끌기·손잡이·경로 회피·강조
  - `tests/validation.spec.js`: 판정·제안·흐름 점·결과 클릭
  - `tests/simulation.spec.js`: 성능 시뮬레이션 계산·탭·사용률 막대
  - `tests/regression.spec.js`: 리팩터링 기준선 (판정·제안·시뮬레이션 결과 스냅샷). 결과를 일부러 바꿀 때만 `npx playwright test regression --update-snapshots`
- **기능을 추가하거나 고치면** 해당 spec 파일에 테스트를 추가한다.
  - 화면 조작은 `page.mouse`로 실제 마우스처럼 한다.
  - 준비와 확인은 `page.evaluate`로 앱 전역(state, addNode 등)을 쓴다.
- **ESLint 공유 이름:** 공유 이름 목록은 eslint.config.js가 js/ 파일의 최상위 선언을 읽어 자동으로 만든다.
  - 줄 맨 앞의 `const/let/var/function/class`만 인식한다.
  - 그래서 공유할 이름은 반드시 줄 맨 앞에서 선언한다.

### 예전 방식 (Playwright 이전, 참고용)

npm 도구를 쓸 수 없을 때는 **Microsoft Edge 헤드리스**로 직접 확인한다.

- **테스트 페이지 만들기:** 세션 scratchpad에 만든다. 프로젝트 폴더에는 만들지 않는다.
  - index.html을 복사하고, css/js 경로를 `file:///C:/mzc/ai-foundation/aws-3tier-simulator/...` 절대 경로로 바꾼다.
  - `<head>`에 `localStorage.clear()`와 `window.onerror` 수집 코드를 넣는다.
  - `</body>` 앞에 테스트 스크립트를 넣는다. 결과는 `<pre id="out">`에 쓴다.
  - 테스트 스크립트를 넣을 때는 PowerShell 문자열 처리를 쓴다. bash의 sed 치환은 특수문자 때문에 실패했다.
- **실행:** `msedge --headless=new --disable-gpu --user-data-dir=<scratchpad 안 새 폴더> --window-size=1600,1000 --dump-dom <file URL>`을 실행하고, 출력에서 `<pre id="out">`의 마지막 내용을 읽는다.
- **실제 마우스 입력·애니메이션이 필요할 때:** `--remote-debugging-port`로 Edge를 띄운다. 그다음 DevTools 프로토콜(WebSocket)로 아래 명령을 보낸다.
  - `Input.dispatchMouseEvent`: 실제 마우스 입력
  - `Runtime.evaluate`: 페이지 상태 읽기
  - `--virtual-time-budget`을 쓰면 requestAnimationFrame이 진행되지 않는다. 애니메이션은 이 방식으로 확인한다.
- **자주 틀린 테스트 함정:**
  - 합성 PointerEvent를 쓸 때는 `Element.prototype.setPointerCapture`를 빈 함수로 바꿔야 한다.
  - CDP `mouseMoved`를 버튼 없이 보내려면 `button: 'none'`으로 해야 한다. `'left'`로 보내면 드래그로 인식된다.
  - commit 후에는 state의 객체가 바뀐다. 기대값은 동작 전에 숫자로 미리 저장해 둔다.
  - `.area-public` 같은 선택자는 팔레트 항목과도 겹친다. 캔버스 요소는 `#area-layer` 아래에서 찾는다.
- **사용자에게는** 직접 해볼 테스트 항목을 따로 적어 준다.

## Git

- 원격 저장소: https://github.com/haeans/aws-3tier-simulator (브랜치 main)
- 이름 고정: 저장소·로컬 폴더·package.json 이름은 모두 `aws-3tier-simulator` (2026-10-15 사용자 결정)
- 작성자: 저장소 로컬 설정 `haeans` / `rlaalscjf9856@gmail.com`
  - 교육용으로 공개 이메일을 쓴다 (2026-10-15 사용자 결정. 그 전 커밋은 noreply 주소)
- 커밋 메시지는 한국어로 쓴다. 커밋할 때 CHANGELOG.md도 함께 맞춘다.
- 커밋·푸시는 사용자 승인 후에만 한다.

## 세션 인계 (2026-10-30 기준, v1.40, 새 세션은 여기부터 읽는다)

- **현재 상태:** v1.40, 브랜치 `feat/palette` (main e9e08b9 = PR #4 17번 병합 후 분기). **18번 변경은 아직 커밋 안 함**
  - 작업 계획 4차(사용자 메모 리뷰): 15·16·17번 완료. 18번(C1) 팔레트 추천 묶음 구현, 사용자 테스트 확인 대기. 다음 순서 B1 → D2 → D1 (사용자 결정)
  - 작업 방식: 번호마다 새 브랜치 → 사용자 테스트 → 커밋·푸시(사용자 요청 시) → 사용자가 PR 병합 → main pull 후 다음 브랜치
  - 번호 규칙(2026-10-27 사용자 결정): ROADMAP 번호를 1~14에 이어 붙이고, 브랜치·커밋도 이 번호를 쓴다 (예: "feat: #16 ...")
  - 나머지 메모 항목은 ROADMAP.md [후보] "사용자 메모 2026-10-27" (B1·D2·D1)
  - 작업 계획 3차·14번 [판정 기준 정비]는 완료 (판정 19개·제안 16개)
- **보류:** ROADMAP.md 13번 [C. 마이그레이션 설계 + 성능 시뮬레이션] (기본 사용성이 먼저, 사용자 결정). 다시 시작하면 설계안부터 보여주고 승인받는다
  - 먼저 풀 것: 판정이 앱 서버를 EC2로만 봐서 컨테이너 구성이 오류가 난다 (criteria/container.md CTR-05)
  - 새 서비스 규칙은 14번과 같은 과정: criteria/*.md 조사 → 규칙 + 테스트 + CHANGELOG/버전(다음은 1.38) + 문서
  - 사용자는 Team 요금제라 토큰 한도가 빠듯하다. 작업 단위를 잘게 나누고 결과는 파일에 저장한다
- **판정 기준 정비의 원칙 (사용자 결정, 2026-10-27)**
  - **판정은 현실(AWS 공식 문서)과 벗어나지 않는다.** 문서가 금지하지 않는 것을 오류로 막아도 안 되고(너무 엄격), 문서가 못 박은 것을 통과시켜도 안 된다(너무 느슨).
    - 예: EC2가 퍼블릭 서브넷에 있으면 오류 → 경고(v1.32), 프라이빗 서브넷의 DB는 오류가 아님(v1.33)
  - 등급: A 오류(문서가 필수·안 됨) / B 경고(Security Hub·Config) / C 제안(Well-Architected) / X 제외(근거 없음, 칭찬만 막음). 근거 없는 항목은 규칙을 만들지 않는다
  - 근거 등급과 화면 수준이 다를 수 있다: B등급이어도 "정상"의 의미를 흔들면 제안으로 두고 GUIDE.md에 이유를 적는다. WAF 같은 검증 대상 아닌 서비스(validated:false)의 A등급은 제안(제거)으로 반영
  - `some`(하나라도 있으면 통과)으로 판정하던 규칙은 "모두/각각"으로 바꾸거나, 칭찬을 문제가 없을 때만 내도록 좁힌다
  - 승인 범위(이 작업에서 사용자가 준 것): WebSearch·WebFetch는 AWS 공식 문서 조사용, 코드 수정은 조사한 항목 반영에 한해 승인. **커밋은 사용자가 요청할 때만** 한다 (이 작업 동안은 "커밋 없이 쭉 진행"이 기본이었고, 커밋 메시지는 "docs: 규칙 및 판정 설계 #번호")
  - 근거가 불확실하면 사용자에게 선택지(AskUserQuestion)로 추천안과 함께 묻는다
- **13번 후보(공식 문서 확인 전):** IDC(온프레미스) 영역, Site-to-Site VPN / Direct Connect, MGN, DMS, Lambda, API Gateway. 옮기기 전후 구성을 12번 성능 시뮬레이션 엔진(js/rules/simulation.js)으로 비교하고, 새 서비스는 PERF·PERF_ROUTES(js/data/performance.js)에 성능 정보를 더한다. 컨테이너(ECR·ECS·EKS·Fargate)·CI/CD 박스는 13번에 필요하므로 빼자고 제안하지 않는다
- **사용자가 일하는 방식 (지금까지 확인한 것)**
  - 설계 선택지는 AskUserQuestion으로 골라서 정하게 한다 (추천안 표시, 필요하면 ASCII 미리보기)
  - 테스트 항목은 "무엇을 어디서 눌러 무엇을 확인하는지" 순서대로 구체적으로 쓴다 (구성 만들기부터 물어볼 때가 있음)
  - 동작은 AWS 공식 문서 근거, 문서에서 못 찾은 숫자는 "가정"으로 정하고 화면·GUIDE.md에 그렇게 밝힌다
  - 화면 표현이 바뀌면 직접 스크린샷을 찍어 확인한 뒤 보고한다 (사용자가 "깔끔하지 않다" 같은 시각 피드백을 줌)
  - "진행해"라고 하면 막힐 때(권한·자료 부족·설계 실패·오류 수정 불가)만 멈추고 끝까지 진행
- **작업 요령 (이번 세션에서 겪은 것)**
  - bash heredoc 안에 백틱·`${}`가 많은 JS를 넣으면 "unexpected EOF"로 실패할 때가 있다 → Write 도구로 scratchpad에 node 스크립트를 만들어 실행
  - 화면 확인: scratchpad에 Playwright 설정(testDir = scratchpad, `require('C:/mzc/ai-foundation/aws-3tier-simulator/node_modules/@playwright/test')`)과 spec을 두고 `npx playwright test --config=<그 설정>`으로 스크린샷
  - 결과 영역(아래 패널) 높이가 바뀌면 캔버스가 줄어 기존 테스트의 클릭 좌표가 패널에 가려진다 (탭 높이 24px 유지 이유)
  - 사용자 전역 git 설정: `core.autocrlf = true`. 프로젝트는 .gitattributes로 LF 고정이라 영향 없음
  - 이 PC에는 파이썬이 없다 (문서·파일 일괄 수정은 node 스크립트로). 승인된 uv 설치는 아직 안 했고 필요 없었다
  - scratchpad에서 playwright 설정을 만들 때 `testDir`을 `process.env.TEMP`로 두면 EPERM(WinSAT)이 난다 → scratchpad 경로를 `__dirname`으로
  - 규칙 반영 요령: 판정 규칙은 js/rules/validation.js(맨 끝에 추가), 제안은 js/rules/suggestions.js, 배치는 js/rules/placement.js. 규칙 코드 주석에 `// 근거: LB-02`처럼 criteria ID를 적는다. 검증 대상이 아닌 서비스(route53·waf 등)는 판정 ctx에 없어 `state.edges`로 직접 찾는다
  - 새 테스트는 tests/helpers.js의 `connect`·`verdict`·`moveNode` 도구를 쓴다. 정상 구성(buildValidArch)의 NAT는 AZ A에만 있어 "NAT를 AZ마다" 제안(제안 12)이 기본으로 뜬다
