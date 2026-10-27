# 데이터 묶음 — RDS · Standby · Replica · ElastiCache · S3 · DynamoDB (조사일 2026-10-27)

기준·양식: README.md. 인용은 영어 원문 15단어 이내. 등급 A 오류 / B 경고 / C 제안 / X 제외.
원칙(사용자 결정 2026-10-27): 현실과 벗어나는 판정을 하지 않는다 — 문서보다 엄격(금지하지 않는 것을 오류로)해도, 느슨(문서가 못 박은 것을 통과)해도 안 된다.

## RDS · Standby · Replica (3c)

### DB-01 · 등급 A
- 요약: RDS를 만들려면 VPC에 서로 다른 AZ의 서브넷이 2개 이상 있어야 한다 (한 AZ에만 서브넷이 있으면 만들 수 없다)
- 근거: [RDS - VPC에서 DB 쓰기](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html)
- 인용: "Your VPC must have at least two subnets." / "These subnets must be in two different Availability Zones"
- 표현 방식: RDS(·Standby·Replica)가 있는 VPC 안의 서브넷이 AZ 2곳 미만이면 오류
- 반례 구성: AZ 하나만 있는 VPC에 RDS를 둠. 1a: 기본 틀은 AZ가 항상 2개라 변이에 없었음(사용자가 직접 AZ를 지우면 가능)
- 반영 규칙: VALIDATION #15 DB 서브넷 AZ
- 상태: 반영됨 (v1.33)

### DB-02 · 등급 A
- 요약: Standby(대기 DB)는 읽기·쓰기를 받지 않는다. 앱 서버(EC2)가 Standby에 직접 접속하는 구성은 틀린 것이다. 앱은 RDS(본체)나 Read Replica에 접속한다
- 근거: [RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
- 인용: "You can't use a standby replica to serve read traffic."
- 표현 방식: EC2와 RDS Standby가 직접 연결되면 오류
- 반례 구성: EC2—RDS Standby. 1a: 조용히 통과 (칭찬 4·7 유지)
- 반영 규칙: VALIDATION #13 Standby 접속
- 상태: 반영됨 (v1.33)

### DB-03 · 등급 A
- 요약: Read Replica는 기존 RDS를 원본으로 만든다. RDS 없이 Replica만 있을 수 없다
- 근거: [RDS 읽기 전용 복제본](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html)
- 인용: "you specify an existing DB instance as the source"
- 표현 방식: RDS Read Replica가 있는데 RDS(본체)가 없으면 오류
- 반례 구성: Replica만 놓음. 1a: 기본 구성에서 RDS를 지우면 Replica는 없어 변이에 없었음
- 반영 규칙: VALIDATION #14 Replica 원본
- 상태: 반영됨 (v1.33)

### DB-04 · 등급 B
- 요약: RDS(본체)마다 다른 AZ에 Standby가 있어야 한다 (Multi-AZ). 지금은 RDS 하나와 Standby 하나만 짝이 맞으면 통과한다
- 근거: [Security Hub RDS.5](https://docs.aws.amazon.com/securityhub/latest/userguide/rds-controls.html) (Medium), [RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
- 인용: "RDS DB instances should be configured with multiple Availability Zones" (RDS.5) / "provisions and maintains a synchronous standby replica in a different Availability Zone"
- 표현 방식: RDS마다 서로 다른 AZ의 Standby와 1대1로 짝지어지는가 (Standby 하나로 RDS 둘을 덮지 않음)
- 반례 구성: RDS 2개 + Standby 1개 / Standby가 RDS와 같은 AZ. 1a: RDS 하나만 짝이 맞으면 조용히 통과 (칭찬 7 유지)
- 반영 규칙: VALIDATION #7 (RDS마다 1대1)
- 상태: 반영됨 (v1.33)

### DB-05 · 등급 B/C — 현재 규칙 4가 근거보다 엄격함 ★ 고칠 곳
- 요약: DB는 "DB 서브넷"에만 둔다고 오류로 판정하지만, 문서의 기본 구성은 DB를 프라이빗 서브넷에 두는 것이다. DB 서브넷은 앱 서버와 계층을 나누는 권장 구성(앱의 약속)일 뿐 문서의 필수가 아니다
- 근거: [RDS - VPC에서 DB 숨기기](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html), [Security Hub RDS.2](https://docs.aws.amazon.com/securityhub/latest/userguide/rds-controls.html) (Critical)
- 인용: "The DB instances are deployed in the private subnet." / "all of the subnets in its DB subnet group must be public" (공개 접속 조건) / "RDS DB Instances should prohibit public access" (RDS.2)
- 현재 앱: VALIDATION #4(DB 보호, 오류) — DB가 DB 서브넷이 아니면 "DB 서브넷에 있어야 해요". 프라이빗 서브넷의 DB도 오류가 된다.
- 현실에 맞는 판정:
  - DB 서브넷 → 통과 (칭찬 4 가능)
  - 프라이빗 서브넷 → 오류 아님. 칭찬 4는 안 냄. 제안 새로: "DB는 앱 서버와 다른 DB 서브넷에 두면 더 안전해요" (계층 분리, C)
  - 퍼블릭 서브넷 → 경고 (공개 접속 조건 = 서브넷이 공개, RDS.2 Critical) — 현재 오류를 경고로 (공개 IP를 일부러 켜야 열리므로 금지는 아님)
  - 서브넷 밖(VPC·AZ에만 놓음) → 오류 유지 (위치가 성립하지 않음)
  - DB가 사용자·IGW와 직접 연결 → 오류 유지 (인터넷 노출, 규칙 4의 나머지 부분)
- 영향: 프라이빗 서브넷의 DB가 "오류" → "정상(제안만)"으로, 퍼블릭 서브넷의 DB가 "오류" → "경고"로 바뀜
- 반영 규칙: VALIDATION #4 완화 + #12 DB 위치(경고) + SUGGESTION #14 DB 서브넷 분리 + 칭찬 4 보강
- 상태: 반영됨 (v1.33)

### DB-06 · 등급 X
- 요약: Read Replica에 EC2가 접속하는 것은 올바른 구성이다 (읽기 전용). Replica가 RDS와 반드시 선으로 이어져야 한다는 문장은 없다(복제는 설정). LB—RDS는 근거 없음(LB-07 참조)
- 인용: "read-only access to the replica"
- 처리: 새 규칙 없음. EC2—Replica 연결은 문제로 보지 않는다
- 상태: 제외

## ElastiCache · S3 · DynamoDB (3e)

### CACHE-01 · 등급 C — 현재 배치 제한이 근거보다 엄격함 ★ 고칠 곳
- 요약: ElastiCache는 VPC 안에서 서브넷 그룹으로 만든다. DB 서브넷이어야 한다는 문장은 없다. 앱은 지금 "DB 서브넷에만" 놓을 수 있게 막아 둔다(배치 규칙)
- 근거: [ElastiCache와 VPC](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/VPCs.html), [Security Hub ElastiCache.7](https://docs.aws.amazon.com/securityhub/latest/userguide/elasticache-controls.html) (High)
- 인용: "All node-based clusters ... are launched in Amazon Virtual Private Cloud." / "We recommend using custom subnet groups" (ElastiCache.7)
- 현실에 맞는 판정: 캐시는 프라이빗 서브넷에도 둘 수 있다 (앱 서버와 같은 서브넷 그룹으로 만드는 구성이 흔하다). 퍼블릭 서브넷에 두는 것은 문서에 근거가 없어 지금처럼 막아 둔다(보수적 유지, X)
- 반영 규칙: PLACEMENT allowedZone 'dataSubnet' (DB·프라이빗 서브넷) — js/rules/placement.js
- 상태: 반영됨 (v1.34)

### CACHE-02 · 등급 C (이미 반영됨)
- 요약: 앱(EC2)이 캐시를 먼저 보고 없으면 DB에서 읽어 캐시에 넣는다. 캐시가 DB 앞에서 요청을 대신 받아 전달하지 않는다 → ElastiCache—RDS 연결은 불필요
- 근거: [ElastiCache 캐싱 전략](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html)
- 인용: "Your application next writes the data received from the store to the cache."
- 반영 규칙: SUGGESTION #7 불필요한 연결(ElastiCache—RDS), SUGGESTION #1 DB 캐싱 — 이미 있음
- 상태: 반영됨

### CACHE-03 · 등급 X
- 요약: 자동 장애 조치(ElastiCache.3), 백업(.1), 암호화(.4·.5), 기본 서브넷 그룹 금지(.7)는 설정값이라 표현 불가 → 제외
- 상태: 제외

### S3-01 · 등급 C (이미 반영됨)
- 요약: S3는 VPC 밖의 서비스다. 프라이빗 서브넷의 EC2가 S3에 가려면 NAT나 게이트웨이 엔드포인트가 필요하고, 게이트웨이 엔드포인트는 추가 요금이 없다
- 근거: [S3 게이트웨이 엔드포인트](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html)
- 인용: "without requiring an internet gateway or NAT device for your VPC, and with no additional cost"
- 반영 규칙: SUGGESTION #3 S3 전용 통로, 배치(VPC 밖) — 이미 있음
- 상태: 반영됨

### S3-02 · 등급 X
- 요약: 퍼블릭 읽기·쓰기 차단(S3.2·S3.3 Critical), 계정 차단 설정(S3.1·S3.8), 버전·수명주기·로깅·암호화는 버킷 설정값이라 다이어그램으로 표현할 수 없다 → 제외. 사용자가 S3에 직접 접근하는 구성(정적 웹사이트 호스팅)은 문서가 허용하므로 오류로 보지 않고, 기존 제안 2(CDN)가 CloudFront를 권한다
- 상태: 제외

### DDB-S-01 · 등급 C — 제안 3이 S3만 봄 ★ 고칠 곳
- 요약: DynamoDB도 S3처럼 VPC 밖의 서비스이고, 프라이빗 서브넷의 EC2가 NAT 없이 가려면 게이트웨이 엔드포인트를 쓴다 (추가 요금 없음). 엔드포인트는 서비스마다 따로 만든다
- 근거: [DynamoDB 게이트웨이 엔드포인트](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-ddb.html)
- 인용: "without requiring an internet gateway or NAT device for your VPC, and with no additional cost"
- 현재 앱: 제안 3(S3 전용 통로)은 S3만 보고, VPC Endpoints가 하나라도 있으면 제안을 끈다 (`some`). DynamoDB에는 제안이 없고, S3용 엔드포인트만 있어도 DynamoDB까지 해결된 것처럼 통과한다
- 현실에 맞는 판정: 서비스(S3·DynamoDB)마다 그 서비스와 이어진 VPC Endpoints가 있는지 본다. 문구는 "S3·DynamoDB 전용 통로"
- 반영 규칙: SUGGESTION #3 S3·DynamoDB 전용 통로 (서비스마다 엔드포인트)
- 상태: 반영됨 (v1.34)

### DDB-S-02 · 등급 X
- 요약: DynamoDB는 서버가 없는 완전관리형이라 VPC 밖에 두고(배치 규칙 이미 있음), 데이터는 기본으로 AZ 3곳에 복제되므로 AZ 배치·Standby 같은 규칙이 필요 없다. 사용자·EC2의 직접 접근은 IAM 인증 기반이라 연결 자체를 오류로 볼 근거가 없다
- 인용: "DynamoDB automatically replicates your data across three Availability Zones" (소개 문서 Resilience)
- 상태: 제외

## 3f에서 쓸 조사 요약 (반영 우선순위)

| 우선 | ID | 등급 | 바꿀 곳 |
|---|---|---|---|
| 1 | CACHE-01 | C (현재 배치 제한이 엄격) | ElastiCache를 DB·프라이빗 서브넷 모두 허용 |
| 2 | DDB-S-01 | C | 제안 3을 S3·DynamoDB, 서비스마다 엔드포인트 확인으로 |

## 3d에서 쓸 조사 요약 (반영 우선순위)

| 우선 | ID | 등급 | 바꿀 곳 |
|---|---|---|---|
| 1 | DB-05 | B/C (현재 오류) | 규칙 4 완화(프라이빗 허용, 퍼블릭은 경고) + 새 제안 + 칭찬 4는 DB 서브넷일 때만 |
| 2 | DB-02 | A | 새 오류: EC2—Standby |
| 3 | DB-04 | B | 규칙 7: RDS마다 다른 AZ Standby 1대1 |
| 4 | DB-03 | A | 새 오류: RDS 없이 Replica |
| 5 | DB-01 | A | 새 오류: VPC 서브넷 AZ 2곳 미만 |
