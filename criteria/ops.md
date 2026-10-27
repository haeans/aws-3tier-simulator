# 접근·운영 묶음 — VPC Endpoints · Client VPN · Session Manager · IAM · CloudTrail · CloudWatch · CloudFormation

기준·양식: README.md. 인용은 영어 원문 15단어 이내. 등급 A 오류 / B 경고 / C 제안 / X 제외.
원칙(사용자 결정 2026-10-27): 현실과 벗어나는 판정을 하지 않는다. 근거 등급과 화면 수준이 다를 수 있다
(근거가 B여도 "정상"의 의미를 흔들면 제안으로 두고, route table처럼 앱이 표현하지 못하는 조건이 끼면 한 단계 낮춘다).

## 접근 (3g, 조사일 2026-10-27) — VPCE · Client VPN · Session Manager · IAM

### VPCE-01 · 등급 X (이미 반영됨)
- 요약: 게이트웨이 엔드포인트는 S3·DynamoDB 전용이고 서비스마다 따로 필요하다. 그 밖의 서비스는 인터페이스 엔드포인트
- 근거: [Gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)
- 인용: "Gateway VPC endpoints provide reliable connectivity to Amazon S3 and DynamoDB" / "no additional charge"
- 반영 규칙: SUGGESTION #3 (v1.34, DDB-S-01에서 서비스마다 따로 필요하도록 반영)
- 상태: 반영됨 (추가 작업 없음)

### VPCE-02 · 등급 C ★ 고칠 곳
- 요약: VPC Endpoints는 IGW·NAT 없이 AWS 서비스에 가는 길이다. VPC Endpoints를 IGW나 NAT와 선으로 잇는 것은 의미 없는 연결이다 (엔드포인트가 있으면 IGW·NAT가 필요 없다는 뜻이지, 이으라는 뜻이 아니다)
- 근거: [SSM용 VPC 엔드포인트](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-create-vpc.html), [Gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)
- 인용: "you don't need an internet gateway, a NAT device, or a virtual private gateway" / "without requiring an internet gateway or a NAT device"
- 표현 방식: VPC Endpoints — IGW, VPC Endpoints — NAT 연결이 있으면 제안(제거). 금지 문장은 아니므로 오류·경고 아님
- 반례 구성: VPCE—IGW, VPCE—NAT. 1a: 미검증 서비스라 조용히 통과
- 반영 규칙: SUGGESTION #7 PAIRS에 추가
- 상태: 반영됨 (v1.35)

### VPCE-03 · 등급 — 현재 배치 규칙이 문서보다 엄격함 ★ 고칠 곳
- 요약: 인터페이스 엔드포인트는 "고른 서브넷"마다 네트워크 인터페이스가 생긴다. 서브넷 종류(퍼블릭·프라이빗·DB)에 제한이 없다. 지금 앱은 프라이빗 서브넷만 허용해 퍼블릭·DB 서브넷에 놓으면 배치가 거부된다
- 근거: [인터페이스 엔드포인트 만들기](https://docs.aws.amazon.com/vpc/latest/privatelink/vpce-interface.html), [PrivateLink 개념](https://docs.aws.amazon.com/vpc/latest/privatelink/concepts.html)
- 인용: "select the subnets in which to create endpoint network interfaces" / "For each subnet that you specify"
- 표현 방식: 배치 규칙 `endpoint`를 "VPC 경계·VPC 안·모든 서브넷"으로 넓힌다 (프라이빗 권장은 근거 문서를 못 찾아 X — 안내문에서만 "보통 프라이빗" 표현 유지)
- 영향: 퍼블릭·DB 서브넷에 VPC Endpoints를 놓을 수 있게 됨 (판정 규칙은 VPC Endpoints를 검증하지 않으므로 오류가 새로 생기지 않음)
- 반영 규칙: PLACEMENT_RULES.endpoint 완화
- 상태: 반영됨 (v1.35)

### SSM-01 · 등급 A(근거) → 화면 B 경고 ★ 새 규칙
- 요약: Session Manager는 서버(SSM Agent)가 AWS 쪽으로 먼저 연결한다. 인터넷에 나가는 길이 없는 프라이빗 서브넷의 서버는 (1) NAT를 거쳐 나가거나 (2) 인터페이스 VPC Endpoints(ssm·ssmmessages 등)를 써야 Session Manager에 닿는다. 둘 다 없으면 연결되지 않는다
- 근거: [SSM용 VPC 엔드포인트](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-create-vpc.html)
- 인용: "The alternative to using a VPC endpoint is to allow outbound internet access" / "SSM Agent initiates all connections to the Systems Manager service"
- 표현 방식: 프라이빗 서브넷의 EC2가 Session Manager와 연결돼 있는데, (EC2에 NAT 연결이 없음) 그리고 (Session Manager에 VPC Endpoints 연결이 없음)이면 경고
- 등급 이유: 문서상 필수 조건이라 근거는 A지만, 앱은 라우팅 테이블·보안 그룹을 그리지 않아 "길이 있는지"를 연결선으로만 추정한다 → 오탐 가능성 때문에 경고(B)
- 반례 구성: 프라이빗 EC2 — Session Manager, NAT·VPC Endpoints 없음. 1a: 미검증 서비스 연결이라 조용히 통과
- 반영 규칙: VALIDATION #16 Session Manager 경로
- 상태: 반영됨 (v1.35)

### SSM-02 · 등급 X
- 요약: Session Manager를 쓰려면 서버에 IAM 권한이 있어야 하지만, 인스턴스 프로파일(IAM—EC2) 없이도 Default Host Management Configuration(계정 설정)으로 대신할 수 있다. 그래서 "IAM과 EC2를 이어라"는 필수가 아니다
- 근거: [Systems Manager 인스턴스 권한](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-instance-permissions.html)
- 인용: "allows instance management without the use of instance profiles"
- 표현 방식: 규칙을 만들지 않는다 (IAM 연결은 설정 영역, 다이어그램 필수 아님)
- 상태: 제외

### SSM-03 · 등급 B → 화면 C(제안) ★ 새 제안
- 요약: 모든 EC2는 Systems Manager로 관리되는 것이 권장이다 (Security Hub SSM.1, 심각도 Medium). Session Manager로 접속하면 열린 접속 포트·Bastion·SSH 키가 필요 없다
- 근거: [Security Hub SSM.1](https://docs.aws.amazon.com/securityhub/latest/userguide/ssm-controls.html), [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- 인용: "Amazon EC2 instances should be managed by AWS Systems Manager" (SSM.1) / "without the need to open inbound ports, maintain bastion hosts, or manage SSH keys"
- 표현 방식: EC2가 있는데 Session Manager와 이어진 EC2가 하나도 없거나 일부만 이어짐 → 제안. 모든 EC2가 이어져 있으면 칭찬
- 등급 이유: 근거는 B(경고)지만, Session Manager가 없다고 구성이 틀린 것은 아니고 정상(3계층) 구성의 의미를 흔들므로 제안으로 둔다 (GUIDE.md 설계 결정에 이유 기록)
- 반례 구성: Session Manager 없이 EC2만 있음. 1a: 조용히 통과 (제안 6은 Bastion만 봄)
- 반영 규칙: SUGGESTION #15 Session Manager로 서버 관리
- 상태: 반영됨 (v1.35)

### CVPN-01 · 등급 X (표현 불가)
- 요약: Client VPN 엔드포인트는 대상 네트워크(서브넷)를 하나 이상 연결해야 하고, 서브넷을 여러 개 연결하면 AZ가 서로 달라야 한다(2개 이상 권장). 연결한 서브넷이 속한 VPC의 리소스에 접속할 수 있다
- 근거: [Client VPN 대상 네트워크](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/cvpn-working-target.html)
- 인용: "must have at least one target network" / "each subnet must be in a different Availability Zone"
- 표현 방식: 박스 1개(VPC 경계)와 선으로는 서브넷 연결·AZ 이중화를 그릴 수 없다. 규칙을 만들지 않는다 (모델 변경은 ROADMAP 후보)
- 상태: 제외

### CVPN-02 · 등급 X (현행 유지)
- 요약: 규칙 4의 "DB 관리자 — DB 직접 연결은 오류"는 근거와 맞는다. 관리자는 VPC 밖 사람이라 DB에 직접 닿는 길은 인터넷(공개 접속)뿐이고, Client VPN은 VPC 안으로 들어오는 공식 방법이다. 제안 6(Bastion)은 Session Manager·Client VPN을 대안으로 안내해 문서와 일치
- 근거: [Client VPN](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/what-is.html), [Client VPN 시나리오](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/how-it-works.html)
- 인용: "securely access your AWS resources and resources in your on-premises network"
- 상태: 변경 없음

### IAM-01 · 등급 X
- 요약: IAM은 계정 수준 서비스이고 추가 요금이 없다. 연결선(트래픽 경로)으로 그릴 필수 관계가 문서에 없다. 규칙을 만들지 않는다
- 근거: [What is IAM?](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html)
- 인용: "offered at no additional charge"
- 상태: 제외 (현재 배치 규칙 `outside`는 유지)

## 운영 (3i, 조사일 2026-10-27) — CloudTrail · CloudWatch · CloudFormation

### CT-01 · 등급 B → 화면 C(제안, 현행 유지)
- 요약: 계정에 CloudTrail 추적(trail)이 하나 이상 있어야 한다 (Security Hub CloudTrail.3, High). 기본 이벤트 기록(90일)은 계정을 만들면 자동으로 있지만, 추적을 따로 만들어야 장기 보관·분석이 된다
- 근거: [Security Hub CloudTrail.3](https://docs.aws.amazon.com/securityhub/latest/userguide/cloudtrail-controls.html), [CloudTrail 소개](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html)
- 인용: "At least one CloudTrail trail should be enabled" / "past 90 days of management events"
- 표현 방식: EC2가 있는데 CloudTrail 박스가 없으면 제안 (현재 SUGGESTION #5가 이미 함)
- 등급 이유: 기본 90일 기록이 있어 "추적이 없어서 틀린 구성"은 아니므로 제안 유지
- 상태: 반영됨 (변경 없음)

### CT-02 · 등급 B → 화면 C(제안) ★ 고칠 곳
- 요약: CloudTrail 로그를 CloudWatch Logs로 보내면 이상한 작업을 실시간으로 알림받을 수 있다 (Security Hub CloudTrail.5, Medium). 지금 앱은 CloudTrail·CloudWatch가 같이 있기만 하면 "잘한 점"을 내고, 둘이 이어졌는지 보지 않는다
- 근거: [Security Hub CloudTrail.5](https://docs.aws.amazon.com/securityhub/latest/userguide/cloudtrail-controls.html)
- 인용: "CloudTrail trails should be integrated with Amazon CloudWatch Logs"
- 표현 방식: CloudTrail·CloudWatch가 둘 다 있고 서로 이어지지 않았으면 제안 "CloudTrail — CloudWatch 연결". 칭찬(제안 5)은 두 서비스가 이어졌을 때만 내도록 좁힘 (불확실하면 칭찬하지 않음)
- 반례 구성: CloudTrail·CloudWatch를 따로 둠. 1a: 칭찬 유지
- 반영 규칙: SUGGESTION #5 보강
- 상태: 반영됨 (v1.36)

### CW-01 · 등급 X
- 요약: AWS 서비스는 기본 지표를 CloudWatch로 자동으로 보내므로 CloudWatch와 EC2·RDS를 선으로 잇지 않아도 모니터링이 된다. 연결을 필수로 요구할 근거가 없다. 상세 지표·로그는 CloudWatch 에이전트(설정)가 필요하지만 다이어그램 항목이 아님
- 근거: [What is CloudWatch?](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html)
- 인용: "Many AWS services automatically report metrics into CloudWatch"
- 상태: 제외 (연결 규칙 없음)

### CFN-01 · 등급 X
- 요약: CloudFormation은 템플릿으로 리소스를 한 번에 만들고 관리한다 (코드형 인프라). Security Hub의 CloudFormation 컨트롤은 스택 태그·종료 보호·서비스 역할 같은 설정값이고(CloudFormation.1은 2024-04 폐지), 다이어그램으로 그릴 관계가 아니다. Well-Architected(OPS05-BP01) 템플릿 버전 관리도 설정 항목
- 근거: [What is CloudFormation?](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html), [Security Hub CloudFormation](https://docs.aws.amazon.com/securityhub/latest/userguide/cloudformation-controls.html)
- 인용: "manage a collection of resources as a single unit"
- 상태: 제외 (규칙 없음)

## 3h·3j 반영 요약 (다음 칸이 할 일)

| 칸 | 변경 | 근거 |
|---|---|---|
| 3h | PLACEMENT endpoint 완화 / SUGGESTION #7에 VPCE—IGW·NAT / VALIDATION #16 Session Manager 경로(경고) / SUGGESTION #15 서버 관리 | VPCE-02·03, SSM-01·03 |
| 3j | SUGGESTION #5 보강(CloudTrail—CloudWatch 연결, 칭찬 조건 강화) | CT-02 |
