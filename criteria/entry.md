# 입구 묶음 — Load Balancer · IGW · NAT (조사일 2026-10-27)

기준·양식: README.md. 인용은 영어 원문 15단어 이내. 등급 A 오류 / B 경고 / C 제안 / X 제외.
앱 약속: LB 박스 1개 = "여러 AZ에 노드가 있는 하나의 LB" (PROGRESS.md 결정, 2026-10-27). 앱의 NAT 박스는 public NAT로 본다.
Route 53 · CloudFront · WAF는 2c에서 이어서 쓴다.

## Load Balancer

### LB-01 · 등급 A (앱에서 직접 검사 불가 → 설명·칭찬 문구에만 반영)
- 요약: ALB는 서로 다른 AZ의 서브넷을 2개 이상 지정해야 한다
- 근거: [ALB 사용 설명서 - Subnets](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
- 인용: "You must select at least two Availability Zone subnets."
- 표현 방식: 박스 1개가 이미 여러 AZ를 뜻하므로 규칙 없음. 칭찬·설명에서 "LB는 하나를 만들어 여러 AZ에 둔다"고 안내
- 반례 구성: (없음 — 표현 약속으로 흡수)
- 반영 규칙: 없음
- 상태: 조사됨

### LB-02 · 등급 B
- 요약: LB가 연결된 서버(EC2)가 서로 다른 AZ 2곳 이상에 있어야 한다 (한 AZ에만 있으면 LB의 다른 AZ 노드가 놀게 된다)
- 근거: [Security Hub ELB.13](https://docs.aws.amazon.com/securityhub/latest/userguide/elb-controls.html) (Config 규칙 elbv2-multiple-az), [ELB 동작 원리](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html)
- 인용: "has registered instances from at least the specified number of Availability Zones" (ELB.13)
- 인용(보조): "each enabled Availability Zone has at least one registered target" (ELB 동작 원리)
- 표현 방식: LB와 직접 연결된 EC2들의 AZ 종류 수 ≥ 2
- 반례 구성: LB—EC2 연결이 한 AZ의 EC2에만 있음 (다른 AZ EC2는 LB와 연결 안 됨). 1a: `lb-ec2` 연결 하나 삭제해도 조용히 통과
- 반영 규칙: (아직 없음) 규칙 3 보강 또는 규칙 7 확장 후보
- 상태: 조사됨

### LB-03 · 등급 C
- 요약: AZ마다 LB를 따로 두지 말고, LB 하나를 여러 AZ에 걸쳐 쓴다 (같은 EC2들을 가리키는 LB가 둘 이상이면 제안)
- 근거: [ELB 동작 원리](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html), [ALB 사용 설명서](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
- 인용: "We recommend enabling multiple Availability Zones for all load balancers." / "serves as the single point of contact for clients"
- 주의: 문서는 LB 여러 개를 금지하지 않는다(내부+외부 LB 구성도 문서에 있음). 그래서 오류가 아니라 제안이고, 같은 EC2를 가리키는 공개 LB가 둘 이상일 때만 건다.
- 반례 구성: A·B 퍼블릭에 LB를 하나씩 두고 같은 EC2들에 연결. 1a: 조용히 통과
- 반영 규칙: (아직 없음) SUGGESTION 새 규칙 후보
- 상태: 조사됨

### LB-04 · 등급 A
- 요약: 인터넷에 공개하는 LB를 쓰려면 VPC에 IGW가 있어야 한다
- 근거: [ALB 만들기](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-application-load-balancer.html)
- 인용: "With an internet-facing load balancer, only VPCs with an internet gateway are available"
- 표현 방식: 퍼블릭 서브넷의 LB가 있는데 캔버스에 IGW가 없음 (규칙 1이 이미 오류로 잡음 — 유지)
- 반례 구성: IGW 삭제 → 1a에서 이미 잡힘
- 반영 규칙: VALIDATION #1 (이미 있음)
- 상태: 반영됨

### LB-05 · 등급 X (칭찬만 막음)
- 요약: "모든 공개 LB가 IGW와 이어져 있다"는 문서 문장은 없다 (그림 약속일 뿐)
- 하지만 현재 규칙 1은 `gates.some`이라, IGW와 안 이어진 LB가 하나 더 있어도 칭찬 1을 낸다
- 표현 방식: 칭찬 1은 "퍼블릭 서브넷의 LB가 모두 IGW와 이어졌을 때만" 낸다. 오류는 만들지 않음
- 반례 구성: IGW와 이어진 LB + 이어지지 않은 LB 하나 더. 1a: 조용히 통과
- 반영 규칙: (아직 없음) VALIDATION #1 praise 보강
- 상태: 조사됨

### LB-06 · 등급 C (제거 제안)
- 요약: LB와 NAT를 직접 이을 이유가 없다. LB는 서버(대상)의 사설 IP로 요청을 보내고, NAT는 안에서 밖으로 나가는 용도다
- 근거: [ELB 동작 원리 - scheme](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html), [NAT 게이트웨이](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- 인용: "route requests to your targets using private IP addresses" / "Connections must always be initiated from within the VPC"
- 반례 구성: LB—NAT 연결. 1a: 조용히 통과
- 반영 규칙: (아직 없음) SUGGESTION #7 '불필요한 연결'에 LB—NAT 추가 후보
- 상태: 조사됨

### LB-07 · 등급 X (보류)
- 요약: LB—RDS 직접 연결이 잘못이라는 문장은 이번 문서에서 못 찾음 (NLB는 IP 대상으로 DB를 둘 수도 있어 단정 불가)
- 처리: 오류·경고·제안 모두 만들지 않음. 다만 이 연결이 있으면 칭찬 4·2는 막을지 2b에서 판단 (DB가 LB를 통해 열렸는지 문서 근거 없음)
- 상태: 보류 (3c RDS 조사 때 재확인)

## IGW

### IGW-01 · 등급 A
- 요약: IGW는 VPC에 붙여 쓰는 것이다 (서브넷 안에 두지 않음)
- 근거: [IGW](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html)
- 인용: "you must attach it to a VPC and configure routing"
- 반영 규칙: VALIDATION #2 (이미 있음)
- 상태: 반영됨

### IGW-02 · 등급 A
- 요약: 프라이빗 서브넷의 서버는 IGW로 인터넷과 통신할 수 없다. 공개 IP가 있어도 마찬가지다. 그러니 IGW와 프라이빗 EC2를 직접 잇는 구성은 틀린 것
- 근거: [IGW - basics](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html)
- 인용: "instances in the private subnet can't communicate with the internet, even if they have public IP addresses"
- 표현 방식: IGW와 직접 연결된 박스 중 프라이빗·DB 서브넷 안의 EC2/RDS 계열이 있으면 오류
- 반례 구성: IGW—EC2 직접 연결. 1a: 조용히 통과 (IGW—RDS는 이미 잡힘)
- 반영 규칙: (아직 없음) VALIDATION 규칙 4(DB 보호)와 같은 방식으로 EC2 추가 후보
- 상태: 조사됨

### IGW-03 · 등급 B
- 요약: 사용자(인터넷)가 EC2에 직접 닿으면 안 된다 (EC2는 공개 IP 없이 LB 뒤에 둔다)
- 근거: [Security Hub EC2.9](https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html), [ELB 동작 원리](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html)
- 인용: "Amazon EC2 instances should not have a public IPv4 address" (EC2.9, 심각도 High) / "your targets do not need public IP addresses to receive requests"
- 표현 방식: 사용자(PC·스마트폰·태블릿) — EC2 직접 연결 → 경고
- 반례 구성: PC—EC2. 1a: 조용히 통과하고 칭찬 1("서버는 인터넷에 직접 드러나지 않아요")·칭찬 2도 그대로 남음
- 반영 규칙: (아직 없음) 규칙 1 칭찬 보강 + 새 경고 후보
- 상태: 조사됨

### IGW-04 · 등급 X
- 요약: IGW—NAT 연결은 올바른 구성이다 ("NAT에서 IGW로 경로를 둔다"). 문제로 보면 안 됨
- 인용: "You route traffic from the NAT gateway to the internet gateway for the VPC." ([NAT 게이트웨이](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html))
- 처리: 1a에서 `igw—nat` 조용함은 정상. NAT 쪽 NAT-04에서 다룸

## NAT

### NAT-01 · 등급 A
- 요약: 인터넷으로 나가는 NAT 게이트웨이는 퍼블릭 서브넷에 만든다
- 근거: [NAT 게이트웨이](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- 인용: "You create a public NAT gateway in a public subnet"
- 주의: Private NAT는 온프레미스·다른 VPC 연결용이라 다르다. 앱의 NAT 박스는 public NAT로 간주(GUIDE에 적을 것)
- 표현 방식: 모든 NAT가 퍼블릭 서브넷에 있어야 함 (지금은 하나라도 있으면 통과)
- 반례 구성: 퍼블릭 NAT 하나 + 프라이빗·DB 서브넷 NAT 추가. 1a: 조용히 통과
- 반영 규칙: VALIDATION #6 (수정 후보: `some` → 모든 NAT)
- 상태: 조사됨

### NAT-02 · 등급 C
- 요약: NAT를 AZ마다 하나씩 둔다. NAT 하나를 여러 AZ가 같이 쓰면 그 AZ가 멈출 때 다른 AZ도 인터넷이 끊긴다
- 근거: [NAT 게이트웨이 basics](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html)
- 인용: "create a NAT gateway in each Availability Zone" (같은 문장 앞에 "To improve resiliency")
- 표현 방식: 프라이빗 EC2가 있는 AZ마다 그 AZ 퍼블릭 서브넷에 NAT가 있는가
- 반례 구성: NAT가 AZ 하나뿐인데 칭찬 6("NAT를 퍼블릭 서브넷에 두었어요")이 그대로 나옴. 기본 정상 구성 자체가 NAT 1개
- 반영 규칙: (아직 없음) SUGGESTION 새 규칙 후보. 판정 쪽은 바꾸지 않음
- 주의: 기본 정상 구성(tests/helpers.js buildValidArch)이 NAT 1개이므로 제안이 뜨게 됨 → 테스트 기대값 확인 필요
- 상태: 조사됨

### NAT-03 · 등급 A
- 요약: 인터넷(사용자)이 NAT로 먼저 연결할 수 없다. 사용자—NAT 연결은 틀린 구성
- 근거: [NAT 게이트웨이](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- 인용: "Connections must always be initiated from within the VPC containing the NAT gateway."
- 표현 방식: 사용자(PC·스마트폰·태블릿)와 NAT가 직접 연결되면 오류
- 반례 구성: PC—NAT. 1a: 조용히 통과
- 반영 규칙: (아직 없음) VALIDATION 새 규칙 또는 규칙 6 확장 후보
- 상태: 조사됨

### NAT-04 · 등급 C
- 요약: 퍼블릭 NAT는 IGW로 나가는 경로가 있어야 인터넷에 닿는다 (NAT—IGW 연결이 없으면 제안)
- 근거: [NAT 게이트웨이](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- 인용: "You route traffic from the NAT gateway to the internet gateway for the VPC."
- 주의: 문장이 "must"가 아니라 설명이고, IGW 대신 TGW·VGW로 나가는 구성도 있다 → C로 둠
- 반영 규칙: (아직 없음) SUGGESTION 후보 (우선순위 낮음)
- 상태: 조사됨

## 2b에서 쓸 조사 요약 (반영 우선순위)

| 우선 | ID | 등급 | 바꿀 곳 |
|---|---|---|---|
| 1 | LB-02 | B | LB와 연결된 EC2가 2개 AZ 이상 (규칙 3·7) |
| 2 | LB-05 | X | 칭찬 1: 모든 공개 LB가 IGW와 이어졌을 때만 |
| 3 | IGW-02, IGW-03 | A, B | EC2의 인터넷 직접 연결 (규칙 4 방식 확장 + 칭찬 1·2 보강) |
| 4 | NAT-01, NAT-03 | A | 모든 NAT가 퍼블릭, 사용자—NAT 금지 (규칙 6) |
| 5 | LB-03, LB-06, NAT-02 | C | 제안 규칙 (SUGGESTION) |
