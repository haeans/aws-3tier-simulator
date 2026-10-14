# AWS 3-Tier 아키텍처 시뮬레이터 — 작업 안내

캔버스에 AWS 서비스와 영역(VPC/AZ/서브넷)을 배치·연결하고 3-Tier 구성이 맞는지 검증하는 학습용 웹 도구.
**작업 전에 README.txt를 먼저 읽는다.** 기능, 파일 구조, 변경 이력, 설계 결정(6장), 남은 작업(7장)이 정리되어 있다.

## 작업 규칙 (사용자가 정한 것)

- 모든 답변과 코드 주석은 한국어로 쓴다. 사용자 안내 문구는 AWS 초보자도 이해할 수 있는 쉬운 말로 쓴다.
- 여러 항목을 함께 요청받아도 한 번에 하지 않는다. 한 단계씩 끝내고 사용자의 테스트 확인을 받은 뒤 다음으로 넘어간다.
- 작업이 끝나면 **사용자가 테스트할 항목 2~4개만** 적는다. 변경 내용과 내부 검증 과정은 쓰지 않는다. 아래 경우에만 그 내용을 보고한다:
  - 오류가 났거나 작업이 실패한 경우
  - 계획과 다르게 고쳤거나, 명세에 없어서 직접 정한 부분이 있는 경우
- 코드를 바꿀 때마다 README.txt "4. 변경 이력" 맨 위에 항목을 추가한다.
  - 버전: 기능 추가는 가운데 숫자(1.8 → 1.9), 버그 수정만 있으면 끝 숫자(1.8 → 1.8.1)
  - 기능이나 구조가 바뀌면 2장(주요 기능), 3장(파일 구조), 6장(설계 결정), 7장(남은 작업)도 함께 맞춘다.
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
- 서비스 추가: `js/data/services.js`의 SERVICES와 SERVICE_DESC, `js/data/guide.js`의 SERVICE_GUIDE(설명 패널)
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
  - `tests/placement.spec.js`: 배치·영역·겹침·스냅·크기 조절·저장
  - `tests/edges.spec.js`: 연결 모드·연결점·손잡이·경로 회피·강조
  - `tests/validation.spec.js`: 판정·제안·흐름 점·결과 클릭
- **기능을 추가하거나 고치면** 해당 spec 파일에 테스트를 추가한다.
  - 화면 조작은 `page.mouse`로 실제 마우스처럼 한다.
  - 준비와 확인은 `page.evaluate`로 앱 전역(state, addNode 등)을 쓴다.
- **ESLint 공유 이름:** 공유 이름 목록은 eslint.config.js가 js/ 파일의 최상위 선언을 읽어 자동으로 만든다.
  - 줄 맨 앞의 `const/let/var/function/class`만 인식한다.
  - 그래서 공유할 이름은 반드시 줄 맨 앞에서 선언한다.

### 예전 방식 (Playwright 이전, 참고용)

npm 도구를 쓸 수 없을 때는 **Microsoft Edge 헤드리스**로 직접 확인한다.

- **테스트 페이지 만들기:** 세션 scratchpad에 만든다. 프로젝트 폴더에는 만들지 않는다.
  - index.html을 복사하고, css/js 경로를 `file:///C:/mzc/ai-foundation/AWS_T3_Arch_Sim/...` 절대 경로로 바꾼다.
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

- 원격 저장소: https://github.com/haeans/aws-t3-arch-sim (브랜치 main)
- 작성자: 저장소 로컬 설정 `haean` / `270256123+haeans@users.noreply.github.com`
  - 개인 이메일은 쓰지 않는다.
- 커밋 메시지는 한국어로 쓴다. 커밋할 때 README 변경 이력도 함께 맞춘다.
- 커밋·푸시는 사용자 승인 후에만 한다.
