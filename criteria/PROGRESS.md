# 진행표 (ROADMAP 14번)

상태: ☐ 대기 / ▶ 진행 중 / ☑ 완료. 새 세션은 위에서부터 첫 ☐ 칸을 한다.
기준·양식은 README.md. 세션 한 칸 = 새 세션 1개.

| # | 단계 | 내용 | 산출물 | 상태 |
|---|---|---|---|---|
| 0 | 설계 | 기준표·양식·진행표, ALB 문서 1건 시험 확인 | criteria/README.md, PROGRESS.md | ☑ (사용자 승인 대기) |
| 1a | 변이 테스트 | 정상 구성을 자동 변이시켜 칭찬·통과가 남는 경우 수집 (scratchpad) | 우선순위 목록 → PROGRESS.md 하단 | ☑ |
| 1b | 변이 테스트 | 위 결과 정리, 묶음 순서 재조정 | 같음 | ☐ |
| 2a | 조사 | 입구: LB, IGW, NAT | entry.md | ☑ |
| 2b | 반영 | 입구: LB·IGW·NAT 규칙 + 테스트 | 규칙, tests/, CHANGELOG | ☑ v1.30 (4단계로 나눠 진행) |
| 2c | 조사 | 입구: Route 53, CloudFront, WAF | entry.md | ☑ |
| 2d | 반영 | 입구: Route 53·CloudFront·WAF 규칙 + 테스트 | 규칙, tests/, CHANGELOG | ☑ v1.31 |
| 3a | 조사 | 서버: EC2, Auto Scaling, 서브넷·AZ | server.md | ☐ |
| 3b | 반영 | 서버 규칙 + 테스트 | 〃 | ☐ |
| 3c | 조사 | 데이터: RDS·Standby·Replica | data.md | ☐ |
| 3d | 반영 | RDS 계열 규칙 + 테스트 | 〃 | ☐ |
| 3e | 조사 | 데이터: ElastiCache, S3, DynamoDB | data.md | ☐ |
| 3f | 반영 | 캐시·S3·DynamoDB 규칙 + 테스트 | 〃 | ☐ |
| 3g | 조사 | 접근·운영 (VPCE, VPN, SSM, IAM) | ops.md | ☐ |
| 3h | 반영 | 접근 규칙 + 테스트 | 〃 | ☐ |
| 3i | 조사 | 운영 (CloudTrail, CloudWatch, CloudFormation) | ops.md | ☐ |
| 3j | 반영 | 운영 규칙 + 테스트 | 〃 | ☐ |
| 3k | 조사 | 컨테이너·CI/CD | container.md | ☐ |
| 3l | 반영 | 컨테이너·CI/CD 규칙 + 테스트 | 〃 | ☐ |
| 4 | 문서 정리 | GUIDE.md 설계 결정, ROADMAP.md 갱신 | 문서 | ☐ |

※ 칸 수는 약 20개로 시작. 1a 결과와 입구 묶음(2a~2d) 실제 사용량을 보고 다시 예측한다.

## 0단계 시험 확인 (ALB)

- 출처: ELB 사용 설명서 ALB 문서 (위 LB-01 형식)
- 확인됨: "You must select at least two Availability Zone subnets." / "Each subnet must be from a different Availability Zone."
  → AZ마다 LB를 따로 두는 구성은 근거 있는 반례 (등급 A 후보). 기준표·양식이 실제 문서에 맞게 쓰임을 확인.
- 확인됨: "Elastic Load Balancing creates a load balancer node in each zone that you specify." → LB 하나가 AZ 여러 개에 걸침
- 미확인(2a에서 조사): internet-facing LB의 IGW 필요 여부, LB↔NAT 연결 가능 여부 (이 문서에는 없음)

## 변이 테스트 우선순위 (1단계에서 채움)

1a 결과 (2026-10-27). 기본 구성(PC·IGW·LB·NAT·EC2×2·RDS·Standby, 정상·칭찬 5개)을 변이 660건 → "새 문제 없음·칭찬 유지"(조용함) 건수.
방법: 연결 삭제 6 / 박스 삭제 8 / 이동 64 / 서비스 추가(연결 없음 256, 연결 있음 256) / 새 연결 22 / 복제 48. 스크립트는 scratchpad(mut.spec.js)라 저장 안 함, 결과만 여기 기록.

**잡힌 것 (문제 없음)**: 박스 삭제 8/8, PC·IGW를 DB에 직접 연결, 서브넷 잘못 이동(LB·EC2·RDS 등).

**조용한 것 = 근거 조사 후보 (등급은 2~3단계 문서 확인 후 확정)**
| 순위 | 묶음 | 조용히 통과한 변이 | 어떤 규칙이 못 보나 |
|---|---|---|---|
| 1 | LB | AZ마다 LB 복제(A·B 퍼블릭 둘 다), LB 단독, LB—NAT, LB—RDS·Standby | 규칙 3이 `lbs.some`, 규칙 1이 `gates.some` |
| 2 | 입구 | PC—EC2 직접 연결(PC—LB·NAT도), IGW—EC2·NAT 직접 연결. 칭찬 "서버는 인터넷에 직접 드러나지 않아요"가 그대로 남음 | 규칙 1·2는 EC2의 이웃을 안 봄 (DB만 규칙 4가 봄) |
| 3 | 서버 | EC2 한 대가 LB와 안 이어져도 통과(`lb-ec2` 삭제 2건), EC2—EC2·EC2—Standby 연결, 단독 EC2 | 규칙 3·5가 `some`, 규칙 4는 RDS만 |
| 4 | 데이터 | EC2—RDS 연결 삭제 시 통과(2건), EC2—Standby 직접 연결, RDS·Standby 서로 안 이어져도 칭찬 7 유지 | 규칙 5가 `some`, 규칙 7이 Standby 연결을 안 봄 |
| 5 | NAT | NAT를 프라이빗·DB 서브넷에 추가, 단독 NAT, NAT가 AZ 하나뿐이어도 칭찬 6 유지 | 규칙 6이 `nats.some(public)` |
| 6 | 미검증 서비스 22종 | 어디에 어떻게 연결해도 항상 통과 (ADD_LONE·ADD_LINKED 조용함 대부분) | 규칙이 없음 (등급 X → 칭찬은 안 나오므로 영향 작음) |

**결정됨 (2026-10-27): LB 표현은 2번 — 박스 1개 = "여러 AZ에 노드가 있는 하나의 LB"로 간주, 모델·UI는 안 바꿈.**
- AZ마다 LB를 따로 둔 구성의 등급은 2a에서 문서로 정한다 (문서가 "여러 LB 금지"를 말하지 않으면 A가 아니라 B·C).
- 1번(LB를 AZ 걸침 영역으로 표현)은 모델 변경이라 ROADMAP 후보로만 남긴다.

**설계 결정이 필요했던 발견 (위에서 결정됨)**
- 기본 "정상" 구성의 LB가 AZ A 서브넷 하나뿐이다. 앱 모델은 박스 1개 = 서브넷 1개라 "LB 하나가 여러 AZ에 걸침"을 그릴 수 없다. 문서(ALB 최소 2 AZ)와 충돌하므로, LB-01 반영 전에 표현 방식을 정해야 한다 (예: LB를 AZ 걸침 영역처럼 놓기 / LB 박스 1개는 "여러 AZ에 노드가 있는 것"으로 간주하고 AZ마다 따로 둔 것을 오류로 처리 / 그대로 두고 설명으로 보완).
- (참고) 1a 우선순위 표는 사용자가 확인함 (2026-10-27).
- 이동 변이의 조용한 18건 중 PC 8건은 UI가 막는 위치라 의미 없음(상태 직접 조작의 한계). 나머지는 같은 종류 서브넷끼리 이동이라 정상.
