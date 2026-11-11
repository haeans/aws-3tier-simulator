# 리팩터링 지침 — 구조 정리와 문서 어긋남

작성: 2026-11-11 · v1.49 기준 (코드 리뷰 결과)

이 문서는 리팩터링을 맡은 작업자(AI 포함)가 그대로 따라 할 수 있게 쓴 지침이다.
작업 규칙은 CLAUDE.md, 기능·설계 결정은 GUIDE.md, 남은 작업은 ROADMAP.md.
**이 지침과 CLAUDE.md가 다르면 CLAUDE.md가 우선이고, 다른 점을 사용자에게 알린다.**

- 단계 이름은 R1~R7이다. 시작할 때 ROADMAP 번호를 이어 붙이고(번호 규칙), 브랜치·커밋에 그 번호를 쓴다.
- 28번 [서버 통신 경로 제안]과의 순서는 사용자가 정한다. 추천: R1(문서)만 먼저, 나머지는 28번 뒤.
- 단계가 끝나면 이 문서의 [진행 상태] 표를 고친다. 모두 끝나면 요약을 ROADMAP.md [완료]와 GUIDE.md 4장에 옮긴다.


## 목표

판정·제안·시뮬레이션 결과와 화면 동작은 그대로 두고 구조만 정리한다. 끝나면:

1. 규칙·엔진이 구성을 인자로 받아, 구성 두 개를 따로 계산할 수 있다 (전후 비교의 바탕)
2. js/rules/가 js/ui/에 기대지 않는다
3. 문서가 실제와 맞는다


## 왜 하는지 (리뷰에서 찾은 문제)

| # | 문제 | 영향 | 단계 |
|---|---|---|---|
| 1 | 규칙·엔진이 전역 `state`를 직접 읽는다. `simulateTraffic(rps, faults, attack)`은 구성을 인자로 받지 않는다 | 구성 두 개를 동시에 계산할 수 없다 (13번 전후 비교가 막힘) | R3 |
| 2 | js/rules/가 js/ui/core.js의 `findNode`·`findContainer`·`rectOf`·`inRect` 등을 쓴다 | 규칙이 화면 파일에 기댄다. rules만 따로 쓰거나 테스트할 수 없다 | R2 |
| 3 | 시뮬레이션 엔진 안에 서비스 종류 분기(`'cloudfront'`, `'rds'`, `'elasticache'` 등)가 있다 | 새 서비스를 넣으려면 성능 정보(PERF)만이 아니라 엔진을 고쳐야 한다 | R6 |
| 4 | "연결선의 반대편 박스 찾기"와 Route 53·WAF를 건너뛰는 탐색이 여러 곳에 따로 있다 | 한 곳만 고치면 어긋난다 | R4 |
| 5 | render.js에 저장·되돌리기가, main.js에 기본 틀 만들기가 들어 있다. 저장 `version`을 읽지 않는다 | 파일 이름과 내용이 다르고, 저장 형식을 바꿀 때 옮기는 코드를 둘 자리가 없다 | R5 |
| 6 | 영역 `label`이 `innerHTML`로 들어간다 (js/ui/render.js) | 지금은 위험이 낮지만 파일 불러오기·이름 바꾸기를 넣으면 문제가 된다 | R5 |
| 7 | "트래픽 점 간격" 테스트가 실행이 느리면 실패한다 | 새 PC에서 더 자주 날 수 있다 | R7 |
| 8 | 문서 어긋남 (ROADMAP 구역·옛 값 등) | 새 세션이 잘못된 상태를 읽는다 | R1 |


## 지켜야 할 것

- 한 번에 한 단계. 단계마다 새 브랜치 → 구현 → `npm run lint`, `npm test` 통과 → 사용자 테스트 항목 2~4개 보고 → 사용자 확인 후 다음 단계.
- 커밋·푸시·PR 병합은 매번 사용자 승인. 답변·주석·커밋 메시지는 한국어.
- `npx playwright test regression --update-snapshots`는 쓰지 않는다. 기준선이 달라지면 결과가 바뀐 것이므로 멈추고 차이를 보고한다.
- 판정·제안의 id, 문구, 순서, criteria ID 주석(`// 근거: LB-02`)은 바꾸지 않는다.
- 테스트가 `page.evaluate`로 쓰는 전역 이름(state, addNode, simulateTraffic 등)은 유지한다. 바꾸기 전에 tests/에서 그 이름을 검색한다.
- ES 모듈 금지, 새 npm 패키지 금지, 공유 이름은 줄 맨 앞에서 선언, 새 js 파일 첫 줄은 `// @ts-check`, index.html에 script 태그 추가.
- 코드를 바꾼 단계는 CHANGELOG.md 맨 위 항목과 package.json 버전(끝 숫자, 1.49.1부터)을 올린다. 파일 구조가 바뀌면 GUIDE.md 2장도 맞춘다.
- docs/ 폴더는 건드리지 않는다.
- 같은 실패가 두 번 나면 다른 시도를 하기 전에 원인을 보고한다.


## 단계

### R1. 문서 어긋남 정리 (코드 변경 없음, 버전 그대로)

- ROADMAP.md
  - [진행 중 / 다음]에 완료 항목(15~21번)만 있다 → [완료]로 옮긴다
  - [확정]은 번호 순서가 거꾸로다 → 완료된 22~27번은 [완료]로, 28번만 남긴다
  - [완료] 안 10번의 "진행 중" 표시를 고친다
  - 27번 "응답은 빈 원" → "파랑 큰 원" (GUIDE.md·실제 화면과 같게)
- GUIDE.md 2장 파일 구조에 criteria/ 폴더를 넣는다
- CLAUDE.md의 "다음은 1.38" 같은 옛 버전 값, HANDOFF.md의 main 커밋 값. 실제 값은 `git log`와 package.json으로 확인하고 쓴다
- 내용(결정·이유)은 고치지 않는다. 위치와 틀린 값만 고친다

### R2. 상태·도형 도구를 UI에서 분리

- 지금: js/rules/context.js 등이 js/ui/core.js의 `state`, `findNode`, `findContainer`, `isContainer`, `rectOf`, `centerOf`, `inRect`, `inRectInclusive`, `rectsOverlap`을 쓴다.
- 할 일: 이들을 DOM을 쓰지 않는 새 파일(예: js/model.js)로 옮기고, index.html에서 data 다음, rules 앞에 둔다.
  - `NODE_W`·`NODE_H`·`GRID`·`zoneOf`가 어디서 선언되는지 먼저 확인하고, DOM에 기대지 않는 것만 옮긴다.
- **주의:** script 순서(data → rules → ui → main)는 CLAUDE.md에 적힌 사용자 규칙이다. 순서가 바뀌므로 시작 전에 사용자 승인을 받고 CLAUDE.md·GUIDE.md를 함께 고친다.

### R3. 규칙·엔진이 구성을 인자로 받게

- 지금: `buildContext`, `azOf`, `subnetsIn`, `asgMembersOf`, `linkedNodes`, `containerNodes`, `requestReach`, `perfDistances`, `simulateTraffic`, `validateArchitecture`와 규칙 본문 일부가 전역 `state`를 직접 읽는다.
- 할 일: 구성 `s`를 받는 형태로 바꾼다. 기존 호출과 테스트가 깨지지 않게 마지막 인자 기본값을 `state`로 둔다.
  - 예: `simulateTraffic(rps, faults, attack, s = state)`
  - 규칙 본문이 `state.edges`를 직접 보는 곳은 ctx에 도구를 더해 ctx로 보게 한다.
- 확인: 캔버스와 다른 구성 객체를 넘겨 계산해도 캔버스 결과가 섞이지 않는 테스트를 tests/regression.spec.js나 simulation.spec.js에 하나 추가한다.

### R4. 중복 조회 정리

- "연결선의 반대편 박스 찾기"가 `linkedNodes`(context.js), 판정 4의 praise(validation.js), `frontsOf`(simulation.js)에 따로 있다 → 공용 도구 하나로.
- `requestReach`(context.js)와 `perfDistances`(simulation.js)는 둘 다 Route 53·WAF를 건너뛰는 탐색이지만 보는 박스 범위가 다르다 (검증 대상만 / 전체). 결과가 같다고 확인될 때만 합치고, 다르면 합치지 말고 이유를 주석으로 남긴다.
- `ctx.neighborsOf`와 `linkedNodes`는 범위가 달라 일부러 나눠 둔 것이다 (GUIDE.md 4장 [판정 코드 구조 정리]). 합치지 않는다.

### R5. 저장·기록·기본 틀을 제자리로

- js/ui/render.js의 저장(`saveState`, `loadSaved`, `uiPrefs`)과 되돌리기(`recordHistory`, `stepHistory`, `undo`, `redo`)를 별도 파일로 옮긴다.
- js/main.js의 `loadTemplate`을 js/ui/examples.js로 옮긴다.
- `loadSaved`가 저장된 `version`을 읽게 하고, 예전 형식을 고치는 코드(Auto Scaling 박스 제거 등)를 한 함수에 모은다. 저장 형식은 바꾸지 않는다.
- `buildAreaEl`(js/ui/render.js)에서 영역 label이 `innerHTML`로 들어간다 → 글자는 `textContent`로 넣는다 (자물쇠 SVG는 그대로).

### R6. 시뮬레이션 엔진의 서비스 분기를 데이터로 (설계안 먼저)

- 지금: js/rules/simulation.js 안에 `n.type === 'cloudfront'`, `nextType === 'rds'`, `'elasticache'`, `'rds-replica'`, `'waf'` 분기가 있다.
- 할 일: 코드를 쓰기 전에 설계안(PERF에 어떤 역할 값을 둘지, 옮길 분기와 남길 분기)을 사용자에게 보여 주고 승인받는다. 승인 범위만 구현한다.

### R7. 가끔 실패하는 테스트

- tests/simulation.spec.js의 "트래픽 점 간격" 테스트 (HANDOFF.md 4장). 원인을 먼저 보고하고, 실제 시간에 기대지 않게 고친다.


## 하지 않는 것

- 전역 변수 이름 바꾸기·묶기 (`simRps` 등 테스트가 쓰는 이름)
- `render()`를 나눠 빠르게 만들기 (지금 규모에서 문제없음)
- APP_TYPES에 컨테이너 넣기, 규칙·문구 고치기 (기능 변경이라 별도 작업, ROADMAP.md [후보])
- 디자인·CSS 변경


## 단계마다 보고할 것

사용자가 직접 해볼 테스트 2~4개 (무엇을 어디서 눌러 무엇을 확인하는지).
오류, 계획과 달라진 점, 직접 정한 점이 있을 때만 그 내용을 덧붙인다.


## 진행 상태

| 단계 | 내용 | 상태 | ROADMAP 번호 · 버전 |
|---|---|---|---|
| R1 | 문서 어긋남 정리 | 완료 (PR #16 병합) | 29번 · 버전 그대로 |
| R2 | 상태·도형 도구 분리 | 완료 (PR #18 병합) | 30번 · 1.50.1 |
| R3 | 구성을 인자로 | 시작 전 | |
| R4 | 중복 조회 정리 | 시작 전 | |
| R5 | 저장·기록·기본 틀 | 시작 전 | |
| R6 | 엔진 분기를 데이터로 | 시작 전 (설계안 승인 필요) | |
| R7 | 가끔 실패하는 테스트 | 시작 전 | |
