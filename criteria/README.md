# criteria/ — 판정 근거 데이터 (ROADMAP 14번)

판정·칭찬 규칙을 고치기 위한 **공식 근거 + 반례** 모음. 앱(index.html)에는 넣지 않는다. 사용자가 반례를 직접 기록하지 않는다.

## 1. 판정 기준표 (4등급, 2026-10-27 사용자 승인)

| 등급 | 뜻 | 근거 조건 | 앱 반영 |
|---|---|---|---|
| A | 오류 | 공식 문서에 "필수(must)·안 됨(can't)"이 명시됨 | VALIDATION_RULES `level:'error'` |
| B | 경고 | Security Hub 컨트롤 / AWS Config 관리형 규칙 | VALIDATION_RULES `level:'warn'` |
| C | 제안 | Well-Architected 모범 사례 / 참조 구조도 | SUGGESTION_RULES |
| X | 제외 | 문서에서 근거를 못 찾음 | 규칙을 새로 만들지 않음. 단, **칭찬은 막는다** (불확실하면 칭찬하지 않음) |

공통 조건
- 다이어그램(서비스·영역·연결)으로 표현할 수 있는 항목만 쓴다. 암호화·로그·버전 같은 설정값은 제외.
- 모든 항목에 문서 링크 + 영어 원문 인용 한 줄. 인용을 못 찾으면 X로 둔다.
- 같은 항목이 여러 출처에 있으면 가장 강한 등급을 쓴다.
- 추정 숫자·"보통 그렇다"는 근거가 아니다 (등급 X).

## 2. 항목 양식 (묶음 md 파일 안에서 항목마다 이 형식)

```
### LB-01 · 등급 A
- 요약(한국어, 초보자용): ALB는 서로 다른 AZ의 서브넷을 2개 이상 지정해야 한다
- 대상: lb (ALB), 서브넷, AZ
- 근거: [ELB 사용 설명서 - ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
- 인용: "You must select at least two Availability Zone subnets."
- 표현 방식: LB 1개가 서브넷 ≥2개(서로 다른 AZ)에 걸쳐 있는가
- 반례 구성: AZ마다 LB를 따로 둠 / LB가 서브넷 1개에만 속함
- 반영 규칙: (아직 없음) → 반영 후 `VALIDATION #8` 처럼 규칙 ID 기록
- 상태: 조사됨 | 반영됨 | 보류
```

- ID: `묶음약어-번호` (LB, NAT, IGW, R53, CF, WAF, EC2, ASG, RDS, CACHE, S3, DDB, VPCE, OPS, CTR). 번호는 재사용하지 않는다.
- 규칙 코드 주석에 `// 근거: LB-01` 처럼 ID를 적어 근거를 가리킨다.
- 인용은 15단어 이내 한 줄 (저작권 규칙).

## 3. 파일 구성

| 파일 | 묶음 |
|---|---|
| entry.md | Route 53, CloudFront, WAF, IGW, LB, NAT |
| server.md | EC2, Auto Scaling 그룹, 서브넷·AZ 배치 |
| data.md | RDS, Standby, Replica, ElastiCache, S3, DynamoDB |
| ops.md | VPC Endpoints, Client VPN, Session Manager, IAM, CloudTrail, CloudWatch, CloudFormation |
| container.md | ECR, ECS, EKS, Fargate, Code 4종 |
| PROGRESS.md | 진행표 (세션이 이어받는 유일한 입구) |

## 4. 세션 규칙

- 한 세션 = PROGRESS.md의 칸 1개. 시작할 때 이 README.md와 PROGRESS.md만 읽는다.
- 조사 칸은 코드를 바꾸지 않는다. 반영 칸은 규칙 1~2개 + 테스트 + CHANGELOG/버전.
- 끝나면 PROGRESS.md 칸을 갱신하고 "다음 칸"을 적는다. 테스트 확인은 반영 칸에서만 사용자에게 받는다.
- 조사 칸은 Sonnet 등 저렴한 모델로 해도 된다.
- 웹 조사(WebSearch·WebFetch)는 AWS 공식 도메인(docs.aws.amazon.com 등)만 쓴다 (2026-10-27 승인).
