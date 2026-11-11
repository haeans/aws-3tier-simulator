# 작업 인계 — 다른 PC에서 이어서 작업하기

마지막 갱신: 2026-11-11 · v1.50.4 · main은 PR #21까지 병합 (커밋 값은 git log로 확인)

이 문서는 **다른 PC에서 저장소를 받아 바로 이어서 작업**하기 위한 요약이다.
자세한 규칙은 CLAUDE.md, 기능·설계는 GUIDE.md, 남은 작업은 ROADMAP.md, 변경 이력은 CHANGELOG.md.

---

## 1. 새 PC 준비 (처음 한 번)

| 순서 | 할 일 | 비고 |
|---|---|---|
| 1 | `git clone https://github.com/haeans/aws-3tier-simulator` (이미 있으면 `git checkout main && git pull`) | 브랜치 main |
| 2 | 저장소 로컬 작성자 설정: `git config user.name haeans` / `git config user.email rlaalscjf9856@gmail.com` | 교육용 공개 이메일 (사용자 결정) |
| 3 | Node.js 설치 후 `npm install` | 개발 도구(Playwright·ESLint·TypeScript)만 받음. 앱 실행에는 필요 없음 |
| 4 | Microsoft Edge 설치 확인 | 자동 테스트가 설치된 Edge로 실행 (playwright.config.js) |
| 5 | `npm run lint` → 오류 0, `npm test` → 모두 통과 확인 | 2026-11-10 기준 121개 |
| 6 | (선택) GitHub CLI `gh` 설치·로그인 | PR 생성·병합에 사용 |
| 7 | (선택) AWS 공식 아이콘: https://aws.amazon.com/architecture/icons/ 에서 Icon package zip을 받아 풀고 `npm run icons -- <푼 폴더>` | icons/ 폴더는 커밋하지 않음 (공개 재배포 규정이 없어서). 없으면 글자 박스로 동작 |

- 이 PC(첫 PC)의 경로: Node.js `C:\Program Files\nodejs`, gh `C:\Program Files\GitHub CLI`. bash에서 못 찾으면 `export PATH="/c/Program Files/nodejs:$PATH"`
- 이 PC에는 파이썬이 없었다. 문서·파일 일괄 수정은 node 스크립트로 했다.
- docs/ 폴더는 사용자 개인 메모라 저장소에 없다 (커밋하지 않음). 다른 PC에는 없는 것이 정상.

### Claude Code 메모리 (PC마다 따로 저장됨 → 여기에 옮겨 둠)

첫 PC의 Claude 메모리에만 있던 내용. 새 PC의 Claude는 이것을 모르므로 여기서 읽는다.

- **메인 기능 계획 3단계 (2026-10-15 사용자 결정, 순서대로)**
  1. 검증할 때 오류·개선뿐 아니라 잘한 부분도 보여주기 — 완료
  2. 성능 시뮬레이션 (트래픽 부하, 장애, 요청 등) — 완료 (12번)
  3. 최종: CI/CD와 서버를 포함해 IDC→AWS, 서버리스·컨테이너로 옮기는 마이그레이션 아키텍처를 설계하고 성능 시뮬레이션까지 함께 보기 — ROADMAP 13번, **보류 중**
- 그래서 컨테이너(ECR·ECS·EKS·Fargate)와 CI/CD 박스는 지금 규칙에 덜 쓰여도 **빼자고 제안하지 않는다.** 서비스 추가·삭제는 이 3단계에 필요한지로 판단한다 (IDC 영역, VPN/Direct Connect, MGN, DMS, Lambda, API Gateway 등이 후보).

---

## 2. 지금 상태 (v1.50.4)

### 최근에 끝낸 것 (작업 계획 5차 + 동작 개편)

| 번호 | 내용 | 버전 | PR |
|---|---|---|---|
| 22 | Load Balancer를 서브넷 밖(두 AZ의 퍼블릭 서브넷 사이)에. LB의 AZ = 연결된 EC2의 AZ | 1.44 | #9 |
| 23 | AWS 공식 아이콘(icons/는 커밋 안 함), 흰 카드 박스, 둥근 연결선, 점 격자 | 1.45 | #10 |
| 24 | AZ 장애 때 ElastiCache도 멈춤 → 다른 AZ 캐시가 이어받거나 RDS로. 제안 18 | 1.46 | #11 |
| 25 | 연결선 종류 네 가지: 요청 / 서버가 시작한 통신 / 복제·전달 / 설정 관계 (박스 짝으로 자동, 방향 포함) | 1.47 | #12 |
| 26 | 서버—S3·DynamoDB·CloudWatch는 설명 패널에서 선 종류를 바꿈 (연결선 `kind`로 저장) | 1.48 | #13 |
| 27 | 응답 흐름(파랑 응답 점이 같은 길로 돌아옴), 캐시에 없는/있는 요청 번갈아, 보기 전환 [사용자 요청]/[서버 통신] | 1.49 | #14 |
| 28 | 서버 통신 경로 제안(제안 19): 프라이빗 서버의 CloudWatch 에이전트·ECS Exec에 NAT도 VPC Endpoints도 없으면 제안. VPC Endpoints 선을 초록으로 | 1.50 | #17 |
| 30 | 구조 정리 R2: 상태·도형 도구를 js/model.js로 (script 순서 data → model → rules → ui → main) | 1.50.1 | #18 |
| 31 | 구조 정리 R3: 판정·제안·시뮬레이션·장애 엔진이 구성 s를 인자로 받음 (기본값 캔버스) | 1.50.2 | #19 |
| 32 | 구조 정리 R4: 연결 상대 찾기를 edgeOtherEnd 하나로, requestReach는 perfDistances 결과 사용 | 1.50.3 | #20 |
| 33 | 구조 정리 R5: 저장·되돌리기를 js/ui/storage.js로, 기본 틀을 examples.js로, 저장 형식 고치기 migrateSaved, 영역 이름 textContent | 1.50.4 | #21 |

### 다음 할 일 (순서대로)

1. **REFACTOR.md R6·R7** — R2~R5(30~33번) 완료(v1.50.4). R6(엔진 분기를 데이터로)는 설계안부터 승인, R7은 가끔 실패하는 테스트
   - **구조 정리(리팩터링)**: REFACTOR.md의 R1~R7. R1(문서 어긋남, ROADMAP 29번)은 완료(PR #16 병합). R2 이후 순서는 사용자가 정한다
   - **방향성 후보**: ROADMAP [후보] 맨 위 (흐름 단계 해설, 단계별 미션, 구성 파일 내보내기 등 A~G, 사용자 판단 전)
2. **디자인 다듬기** — 사용자가 "마지막에" 하기로 함 (ROADMAP 23번 아래 보류 항목: 영역 테두리를 공식 그림 스타일로, 팔레트 흰 카드)
3. **13번 [마이그레이션 설계 + 성능 시뮬레이션]** — 보류. 다시 시작하면 설계안부터. 먼저 풀 것: 판정이 앱 서버를 EC2로만 봐서 컨테이너 구성이 오류가 난다 (criteria/container.md CTR-05)

---

## 3. 일하는 방식 (사용자가 정한 것, 요약)

- 답변·주석은 한국어, 안내 문구는 AWS 초보자도 이해하는 쉬운 말
- **한 번에 한 단계.** 번호마다: 새 브랜치 → 구현 → 사용자 테스트 → (요청 시) 커밋·푸시 → PR → (승인 시) `gh pr merge <번호> --merge` → main pull → 다음 브랜치
  - 브랜치·커밋에 ROADMAP 번호 사용 (예: `feat: #28 ...`), 커밋 메시지는 한국어
  - 병합 전에 `gh pr view <번호> --json state`로 실제 상태 확인
- 설계 선택지는 AskUserQuestion으로 추천안과 함께 묻는다 (필요하면 ASCII 미리보기)
- 끝나면 **사용자가 테스트할 항목 2~4개**만 (먼저 그 순서대로 Playwright로 직접 해 보고 통과한 것만. 화면이 바뀌지 않는 구조 정리는 사용자 테스트 생략, 확인 결과만 보고) "무엇을 어디서 눌러 무엇을 확인하는지" 순서로 적는다. 계획과 달라진 점·직접 정한 점·오류만 따로 보고
- 코드를 바꿀 때마다: CHANGELOG.md 맨 위 항목 + package.json version (기능 = 가운데 숫자, 버그만 = 끝 숫자), 필요하면 GUIDE·ROADMAP·README도
- 코드 변경 후 항상 `npm run lint`와 `npm test` 모두 통과한 뒤 보고. 화면이 바뀌면 직접 스크린샷으로 확인 (사용자가 시각 피드백을 자주 줌: "잘 안 보인다", "구별이 어렵다")
- 판정은 AWS 공식 문서와 어긋나지 않게 (너무 엄격도, 너무 느슨도 안 됨). 근거 등급 A 오류 / B 경고 / C 제안 / X 제외. 문서에 없는 숫자는 "가정"으로 밝힌다
- 커밋·푸시·병합·외부 전송·새 도구 설치는 매번 사용자 승인

---

## 4. 작업 요령 (겪은 함정)

- bash에서 `node -e "..."`나 heredoc 안에 템플릿 문자열(\`${...}\`)·`$변수`가 있으면 셸이 먼저 바꿔 버려 코드가 깨진다 → **Write 도구로 scratchpad에 node 스크립트 파일을 만들어 실행**
- 화면 확인: scratchpad에 Playwright 설정(`testDir: __dirname`, `require('<저장소>/node_modules/@playwright/test')`, `channel: 'msedge'`)과 spec을 두고 `npx playwright test --config=<그 설정>`으로 스크린샷. 결과 패널 아래에 가려진 점·박스를 찍지 않게 위치를 확인
- 시뮬레이션 "트래픽 점 간격" 테스트가 실행이 느릴 때 가끔 실패한다 → 다시 돌리면 통과 (2026-11-10 한 번 발생)
- 판정 결과를 일부러 바꿨을 때만 `npx playwright test regression --update-snapshots`, 그 뒤 바뀐 줄이 의도한 것뿐인지 diff로 확인
- 연결선 종류·방향은 `EDGE_RULES`(js/data/services.js), 선 하나의 종류는 `edgeInfoOf(ed)`(js/ui/edges.js), 검증 흐름은 `computeFlow`·`requestCycles`·`serverCycles`(js/ui/result.js)
- 사용자는 Team 요금제라 토큰 한도가 빠듯하다. 작업 단위를 잘게, 결과는 파일에
