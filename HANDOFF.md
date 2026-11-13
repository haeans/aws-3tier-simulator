# 작업 인계 — 다른 PC에서 이어서 작업하기

마지막 갱신: 2026-11-13 · v1.66.0 · 48번까지 완료 (커밋 값은 git log로 확인)

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
| 5 | `npm run lint` → 오류 0, `npm test` → 모두 통과 확인 | 2026-11-13 기준 143개 |
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

## 2. 지금 상태 (v1.66.0)

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
| 34 | 구조 정리 R6: 트래픽 계산의 서비스 분기를 데이터로(edgeHit·PERF_SIDE_ROUTES·PERF_GUARDS·PERF_OFF_PATH). 장애 엔진은 코드에 둠 | 1.50.5 | #22 |
| 35 | 구조 정리 R7: 트래픽 점 간격 테스트가 실제 시간을 기다리지 않게 (simDrawDots(t)). R1~R7 모두 완료 | 1.50.6 | #23 |
| 36 | 컨테이너(ECS·EKS·Fargate)를 앱 서버로 인정 (CTR-05). 판정·제안·성능 시뮬레이션 모두. EC2만의 기능(ASG·Session Manager 등)은 그대로 | 1.51.0 | #25 |
| 37 | NAT—IGW 선이 없는 NAT에 제안 20 (NAT-04), 그런 NAT가 있으면 판정 6 칭찬 막기 | 1.52.0 | #26 |
| 38 | 트래픽 점 줄이기: 화면 전체 점 수 상한 65개(가정), 넘으면 점 1개가 나타내는 요청 수를 키움. 패널에 "점 1개 ≈ N요청/초" | 1.53.0 | #28 |
| 39 | 구성을 파일로 저장(툴바 [파일로 저장], 날짜 이름 json) / 파일에서 열기([불러오기 ▾] 맨 아래). 코드는 js/ui/storage.js의 exportData·importData | 1.54.0 | #29 |
| 40 | 흐름 단계 해설: 점이 닿는 박스의 한 줄 해설 + 박스 강조, [이전]·[멈춤]·[다음], 네트워크 한 줄(라우팅 테이블·보안 그룹). 문구 js/data/flow-steps.js, 근거 criteria/flow.md | 1.55.0 | #30 |
| 41 | 예시 구성 확장: [불러오기 ▾]에 "예시: 컨테이너 (ECS + Fargate)". Fargate 두 AZ, 이미지는 VPC Endpoints → ECR, 새 규칙 없음. 데이터는 js/data/examples.js의 EXAMPLE_CONTAINER·EXAMPLE_SPECS | 1.56.0 | #31 |
| 42-1 | 단계별 미션 틀 + 만들기 미션 5개: [미션] 탭, 목표 자동 체크·힌트·다음 미션·진행 저장. 데이터 js/data/missions.js, 채점 js/rules/missions.js(gradeMission), 화면 js/ui/mission.js | 1.57.0 | #32 |
| 42-2 | 고치기 미션 3개(선 실수·위치 실수·랜덤, 문제는 숨기고 힌트로만)·개선 미션 3개(빠르게 → 안전하게 운영 → 장애에 강하게, 끝내면 제안 0개). 채점은 검증 결과 그대로(missionContext의 verdict) | 1.58.0 | #33 |
| 43-1 | 오른쪽 학습 패널: 툴바 [학습 ◂]로 열고, [미션]을 아래 결과 패널에서 옮김, [문제] 탭 자리(준비 중). 코드 js/ui/learn.js, 열림·탭은 uiPrefs | 1.59.0 | #34 |
| 43-2 | 면접식 설계 문제 3개(게시판·쇼핑몰·사진 공유 앱), [제출] 요구 사항별 ✓/✗ + 없는 역할·이유, 모범 답안 불러오기(되돌리기 한 번으로 복귀). 데이터 js/data/problems.js, 채점 js/rules/problems.js(gradeProblem), 화면 js/ui/problem.js | 1.60.0 | #35 |
| 44 | 구성 두 개 비교: 결과 패널 [비교] 탭. A로 담기 → 지금(B)과 판정·트래픽·한 AZ 장애 표 + 박스·제안 차이, A 불러오기. 계산 js/rules/compare.js(compareConfigs), 화면 js/ui/compare.js | 1.61.0 | #36 |
| 45 | 네트워크 ②: 서브넷을 누르면 라우팅 테이블, 박스를 누르면 보안 그룹(들어오는 규칙)을 설명 패널에 자동 계산(예시 숫자). 계산 js/rules/network.js, 근거 criteria/flow.md F5·F6·F9·F10·F16·F18·F19 | 1.62.0 | #38 |
| 46 | 간단한 설정값: 서버·DB 크기(설명 패널 "설정" 칸, 처리량 ½·1·2배 가정), Auto Scaling 그룹 최소·최대·목표 사용률(그룹 영역을 누름). 박스 size·영역 asgMin/asgMax/asgTarget, 계산 perfCapacity·asgSettings(js/rules/simulation.js) | 1.63.0 | #39 |
| 47 | 비용: 결과 패널 [비용] 탭(서울 온디맨드 × 730시간, AWS 공식 가격 2026-11-13), [비교] 비용 줄, 설정 칸 1대 월 비용. 근거 criteria/cost.md, 가격표 js/data/cost.js, 계산 js/rules/cost.js(costOf) | 1.64.0 | #40 |
| 48-1 | IDC(온프레미스) 영역·온프레미스 서버·DB·고객 게이트웨이·VGW, 고객 게이트웨이—VGW 선 [VPN]/[Direct Connect], 판정 20·21·제안 21, 옮기기 전 구성(IDC만) 판정. 근거 criteria/hybrid.md | 1.65.0 | #41 |
| 48-2 | IDC의 성능(온프레미스 = AWS 보통과 같은 처리량, DX +5ms·VPN +20ms)·라우팅 테이블(온프레미스 → VGW)·보안 그룹·비용(VPN 연결·DX 포트)·예시 2개(옮기기 전·하이브리드). 판정 5가 IDC DB를 받아들임 | 1.66.0 | (gh로 확인) |

### 다음 할 일 (순서대로)

1. **작업 계획 7차 (2026-11-13 사용자 결정, ROADMAP [확정]) — 완성본까지.** 위에서부터 한 단계씩
   - 45 네트워크 ②(라우팅 테이블·보안 그룹 보여 주기) → 46 간단한 설정값 → 47 비용 → 48~50 마이그레이션(IDC·VPN/DX → MGN·DMS → 서버리스)
     → 51 비동기 처리(SQS·SNS) → 52 보안 깊이(IAM·암호화) → 53 멀티 리전·재해 복구 → 54 (필요하면) 네트워크 ③ 직접 설정
     → 55 완성본 다듬기(디자인 + 전체 구조·판정·판정 문서 검증)
   - 45~48번 완료 (v1.66.0). **다음은 49번 [마이그레이션 ②: MGN·DMS, 옮기기 전후 비교]** (시작할 때 문서 조사 → 설계안 승인). 48~53번은 시작할 때마다 AWS 공식 문서 조사 → 설계안 승인
2. (완료) 작업 계획 6차 (2026-11-12): 38~44번 (I·C·A·D·B·H·E)
3. 네트워크(G)는 7차 45번(②)·54번(③)으로, 디자인 다듬기는 55번으로 옮겼다. 55번에는 전체 구조·판정·판정 문서 검증도 함께 (사용자 결정 2026-11-13)

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
- 시뮬레이션 "트래픽 점 간격" 테스트가 느릴 때 가끔 실패하던 문제는 R7(35번)에서 고침: 애니메이션은 실제 시간을 기다리지 말고 simDrawDots(t)처럼 시각을 넘겨 그려서 확인한다
- 판정 결과를 일부러 바꿨을 때만 `npx playwright test regression --update-snapshots`, 그 뒤 바뀐 줄이 의도한 것뿐인지 diff로 확인
- 흐름 단계 해설(40번): 단계 나누기 `flowStepsOf`·표시 `showFlowStep`(js/ui/result.js), 문구 `FLOW_STEP_TEXT`(js/data/flow-steps.js). 응답 구간은 src·dst가 요청 구간 그대로라 점이 닿는 박스는 `flowArrive(f)`로 구한다
- 연결선 종류·방향은 `EDGE_RULES`(js/data/services.js), 선 하나의 종류는 `edgeInfoOf(ed)`(js/ui/edges.js), 검증 흐름은 `computeFlow`·`requestCycles`·`serverCycles`(js/ui/result.js)
- 사용자는 Team 요금제라 토큰 한도가 빠듯하다. 작업 단위를 잘게, 결과는 파일에
- 가격 조사(47번): AWS 가격 페이지는 숫자를 스크립트로 불러와 본문 읽기로는 안 보인다. 공식 Price List(`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<서비스>/current/ap-northeast-2/index.json`)를 curl로 받아 node로 찾았다. EC2 파일은 300MB라 grep으로 필요한 줄만
