# 입구 묶음 — Load Balancer · IGW · NAT (조사일 2026-10-27)

기준·양식: README.md. 인용은 영어 원문 15단어 이내. 등급 A 오류 / B 경고 / C 제안 / X 제외.
앱 약속: LB 박스 1개 = "여러 AZ에 노드가 있는 하나의 LB" (PROGRESS.md 결정, 2026-10-27). 앱의 NAT 박스는 public NAT로 본다.
Route 53 · CloudFront · WAF는 아래에 이어서 씀 (2c, 2026-10-27).

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
- 반영 규칙: VALIDATION #7 (고가용성)에 LB 연결 EC2 AZ 검사 추가
- 상태: 반영됨 (v1.30)

### LB-03 · 등급 C
- 요약: AZ마다 LB를 따로 두지 말고, LB 하나를 여러 AZ에 걸쳐 쓴다 (같은 EC2들을 가리키는 LB가 둘 이상이면 제안)
- 근거: [ELB 동작 원리](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html), [ALB 사용 설명서](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
- 인용: "We recommend enabling multiple Availability Zones for all load balancers." / "serves as the single point of contact for clients"
- 주의: 문서는 LB 여러 개를 금지하지 않는다(내부+외부 LB 구성도 문서에 있음). 그래서 오류가 아니라 제안이고, 같은 EC2를 가리키는 공개 LB가 둘 이상일 때만 건다.
- 반례 구성: A·B 퍼블릭에 LB를 하나씩 두고 같은 EC2들에 연결. 1a: 조용히 통과
- 반영 규칙: SUGGESTION #11 Load Balancer 하나로
- 상태: 반영됨 (v1.30)

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
- 반영 규칙: VALIDATION #1 칭찬 보강
- 상태: 반영됨 (v1.30)

### LB-06 · 등급 C (제거 제안)
- 요약: LB와 NAT를 직접 이을 이유가 없다. LB는 서버(대상)의 사설 IP로 요청을 보내고, NAT는 안에서 밖으로 나가는 용도다
- 근거: [ELB 동작 원리 - scheme](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html), [NAT 게이트웨이](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- 인용: "route requests to your targets using private IP addresses" / "Connections must always be initiated from within the VPC"
- 반례 구성: LB—NAT 연결. 1a: 조용히 통과
- 반영 규칙: SUGGESTION #7 불필요한 연결에 LB—NAT 추가
- 상태: 반영됨 (v1.30)

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
- 반영 규칙: VALIDATION #8 서버 경로
- 상태: 반영됨 (v1.30)

### IGW-03 · 등급 B
- 요약: 사용자(인터넷)가 EC2에 직접 닿으면 안 된다 (EC2는 공개 IP 없이 LB 뒤에 둔다)
- 근거: [Security Hub EC2.9](https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html), [ELB 동작 원리](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html)
- 인용: "Amazon EC2 instances should not have a public IPv4 address" (EC2.9, 심각도 High) / "your targets do not need public IP addresses to receive requests"
- 표현 방식: 사용자(PC·스마트폰·태블릿) — EC2 직접 연결 → 경고
- 반례 구성: PC—EC2. 1a: 조용히 통과하고 칭찬 1("서버는 인터넷에 직접 드러나지 않아요")·칭찬 2도 그대로 남음
- 반영 규칙: VALIDATION #9 서버 노출, 칭찬 1·2 보강
- 상태: 반영됨 (v1.30)

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
- 반영 규칙: VALIDATION #6 (모든 NAT가 퍼블릭), 칭찬 6 보강
- 상태: 반영됨 (v1.30)

### NAT-02 · 등급 C
- 요약: NAT를 AZ마다 하나씩 둔다. NAT 하나를 여러 AZ가 같이 쓰면 그 AZ가 멈출 때 다른 AZ도 인터넷이 끊긴다
- 근거: [NAT 게이트웨이 basics](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html)
- 인용: "create a NAT gateway in each Availability Zone" (같은 문장 앞에 "To improve resiliency")
- 표현 방식: 프라이빗 EC2가 있는 AZ마다 그 AZ 퍼블릭 서브넷에 NAT가 있는가
- 반례 구성: NAT가 AZ 하나뿐인데 칭찬 6("NAT를 퍼블릭 서브넷에 두었어요")이 그대로 나옴. 기본 정상 구성 자체가 NAT 1개
- 반영 규칙: SUGGESTION #12 NAT를 AZ마다
- 주의: 기본 정상 구성(tests/helpers.js buildValidArch)이 NAT 1개이므로 제안이 뜨게 됨 → 테스트 기대값 확인 필요
- 상태: 반영됨 (v1.30)

### NAT-03 · 등급 A
- 요약: 인터넷(사용자)이 NAT로 먼저 연결할 수 없다. 사용자—NAT 연결은 틀린 구성
- 근거: [NAT 게이트웨이](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- 인용: "Connections must always be initiated from within the VPC containing the NAT gateway."
- 표현 방식: 사용자(PC·스마트폰·태블릿)와 NAT가 직접 연결되면 오류
- 반례 구성: PC—NAT. 1a: 조용히 통과
- 반영 규칙: VALIDATION #10 NAT 방향
- 상태: 반영됨 (v1.30)

### NAT-04 · 등급 C
- 요약: 퍼블릭 NAT는 IGW로 나가는 경로가 있어야 인터넷에 닿는다 (NAT—IGW 연결이 없으면 제안)
- 근거: [NAT 게이트웨이](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- 인용: "You route traffic from the NAT gateway to the internet gateway for the VPC."
- 주의: 문장이 "must"가 아니라 설명이고, IGW 대신 TGW·VGW로 나가는 구성도 있다 → C로 둠
- 반영 규칙: (아직 없음) SUGGESTION 후보 (우선순위 낮음)
- 상태: 조사됨

## WAF (2c)

### WAF-01 · 등급 C (제거 제안)
- 요약: WAF는 CloudFront와 Application Load Balancer(ALB)에 붙인다. EC2·DB·NAT 같은 곳에는 붙일 수 없다
- 근거: [WAF - 리소스에 연결](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-associating-aws-resource.html)
- 인용: "Associate a global protection pack (web ACL) with a Amazon CloudFront distribution." / 지역 리소스 목록에 "Application Load Balancer" (EC2·NLB는 목록에 없음)
- 주의: 문서가 "안 된다"고 쓰지는 않고 연결 가능한 목록만 준다 → A가 아니라 C. 앱의 Load Balancer 박스는 ALB로 본다
- 반례 구성: WAF—EC2, WAF—RDS, WAF—NAT 등. 1a: WAF는 검증 대상이 아니라 전부 조용히 통과
- 반영 규칙: SUGGESTION #13 잘못된 WAF 연결
- 상태: 반영됨 (v1.31)

### WAF-02 · 등급 A (표현에 제약 있음)
- 요약: 리소스(CloudFront·ALB) 하나에는 WAF를 하나만 연결한다. 한 WAF를 CloudFront와 ALB에 함께 연결할 수도 없다
- 근거: [WAF - 리소스에 연결](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-associating-aws-resource.html)
- 인용: "each AWS resource with only one protection pack (web ACL)" / "associated with a CloudFront distribution with any other AWS resource type"
- 표현 방식: CloudFront·LB가 WAF 박스와 2개 이상 연결 → 오류 후보. 한 WAF가 CloudFront와 LB 둘 다에 연결 → 오류 후보
- 주의: WAF는 validated:false 서비스라 VALIDATION 규칙(판정)에는 들어오지 않는다. 판정에 쓰려면 validated를 켜야 하고(검증 대상 확대) 영향이 크므로 2d에서 정한다. 안 켜면 제안(제거)으로 낮춰 반영
- 반례 구성: WAF 2개를 같은 LB에 연결 / WAF 하나를 CloudFront와 LB에 연결. 1a: 조용히 통과
- 반영 규칙: SUGGESTION #13 (판정이 아니라 제안으로 — 사용자 결정 2026-10-27)
- 상태: 반영됨 (v1.31)

### WAF-03 · 등급 B
- 요약: 인터넷 입구(CloudFront·ALB)는 WAF에 연결해야 한다 (입구마다)
- 근거: [Security Hub CloudFront.6](https://docs.aws.amazon.com/securityhub/latest/userguide/cloudfront-controls.html), [Security Hub ELB.16](https://docs.aws.amazon.com/securityhub/latest/userguide/elb-controls.html) (둘 다 심각도 Medium)
- 인용: "CloudFront distributions should have WAF enabled" / "Application Load Balancers should be associated with an AWS WAF web ACL"
- 현재: 제안 9가 `fronts.some`(하나라도 WAF가 있으면 제안 없음). 근거대로면 입구마다 따져야 한다
- 선택지 (2d 전에 사용자 결정 필요): (가) 제안으로 두고 "입구마다"로만 고친다 / (나) 경고로 올린다 → 기본 정상 구성(WAF 없음)이 "경고"가 되어 테스트·화면이 크게 바뀐다
- 추천: (가). 근거 등급은 B지만 "정상"의 의미를 흔들지 않도록 제안으로 유지하고, 이유를 GUIDE.md에 적는다
- 반례 구성: LB는 WAF가 있고 CloudFront는 없음 / 입구가 둘인데 하나만 WAF. 1a: 제안 9가 사라짐 (조용)
- 반영 규칙: SUGGESTION #9 (입구마다, 제안 유지 — 사용자 결정 2026-10-27)
- 상태: 반영됨 (v1.31)

## CloudFront (2c)

### CF-01 · 등급 C (제거 제안, 칭찬 막기)
- 요약: CloudFront의 원본(오리진)은 S3·ALB·EC2(HTTP 서버)·Lambda 등이다. DB(RDS)를 원본으로 바로 연결하지 않는다
- 근거: [CloudFront 원본](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html)
- 인용: "an Application Load Balancer, or an AWS Lambda function URL" (원본 예시 목록에 DB 없음)
- 주의: 목록이 "For example"로 시작해 전부를 말하지는 않는다 → 오류가 아니라 제안. 현재는 CloudFront—RDS를 연결해도 칭찬 4("DB는 인터넷과 바로 이어지지 않아요")가 그대로 남으므로 칭찬은 막는다
- 반례 구성: CloudFront—RDS(·Standby·Replica). 1a: 조용히 통과 (칭찬 4 유지)
- 반영 규칙: SUGGESTION #7 불필요한 연결 + 칭찬 4 보강
- 상태: 반영됨 (v1.31)

### CF-02 · 등급 C
- 요약: CloudFront 원본으로 EC2를 쓸 때는 EC2에 바로 연결하지 말고 Load Balancer를 둔다
- 근거: [CloudFront 원본 - EC2](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html)
- 인용: "Use an Elastic Load Balancing load balancer to handle traffic across multiple Amazon EC2 instances"
- 주의: 프라이빗 서브넷의 EC2도 "VPC origin"으로 CloudFront와 이을 수 있다(문서에 있음). 그래서 CloudFront—EC2를 오류로 보면 안 된다. 앱은 "사용자—CloudFront—IGW—LB"를 기본으로 안내하므로 EC2 직접 연결은 제안으로만
- 반례 구성: CloudFront—EC2. 1a: 조용히 통과
- 반영 규칙: (아직 없음) SUGGESTION 후보 (우선순위 낮음)
- 상태: 보류 (VPC origin으로 가능, 우선순위 낮음)

### CF-03 · 등급 X
- 요약: S3 원본 접근 제어(OAC, CloudFront.13), HTTPS 강제(.3), 로그(.5), 원본 장애 조치(.4)는 설정값이거나 다이어그램에 안 그려지는 항목 → 제외
- 상태: 제외

## Route 53 (2c)

### R53-01 · 등급 C (이미 있는 제안 8의 근거 확인)
- 요약: 도메인은 Route 53 별칭(alias) 레코드로 Load Balancer(와 CloudFront)에 연결한다. 상태 확인을 켜면 정상인 곳으로만 보낸다
- 근거: [Route 53 - ELB](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-elb-load-balancer.html), [Route 53 상태 확인](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover.html)
- 인용: "use Amazon Route 53 to create an alias record that points to your load balancer" / "route domain traffic only to healthy instances"
- 반영 규칙: SUGGESTION #8 (이미 있음, 변경 없음)
- 상태: 반영됨

### R53-02 · 등급 C (제거 제안, 칭찬 막기)
- 요약: Route 53을 프라이빗 서버(EC2)·DB에 바로 연결하지 않는다. EC2에 직접 연결하려면 EC2가 공개 IP(또는 Elastic IP)를 가져야 하는데, 프라이빗 서브넷의 EC2는 공개 IP가 있어도 인터넷과 통신할 수 없다
- 근거: [Route 53 - EC2](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-ec2-instance.html), [IGW](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html)
- 인용: "Elastic IP address ensures that the IP address of your Amazon EC2 instance will never change" (EC2 연결은 IP 기준) / "can't communicate with the internet, even if they have public IP addresses" (IGW-02와 같은 문장)
- 주의: 문서는 Route 53→EC2 직접 연결을 허용한다(공개 IP가 있을 때). 그래서 오류는 아니고, 앱의 약속(EC2는 프라이빗)과 맞지 않아서 제안으로만
- 반례 구성: Route 53—EC2, Route 53—RDS. 1a: 조용히 통과 (칭찬 8 "도메인 연결"은 사용자 연결만 보므로 유지)
- 반영 규칙: SUGGESTION #7 불필요한 연결 (Route 53—EC2·DB)
- 상태: 반영됨 (v1.31)

## 2d에서 쓸 조사 요약 (반영 우선순위)

| 우선 | ID | 등급 | 바꿀 곳 |
|---|---|---|---|
| 1 | WAF-03 | B | 제안 9를 입구마다 따지도록 (제안 유지 여부는 사용자 결정) |
| 2 | CF-01, R53-02 | C | 제안 7에 CloudFront—DB, Route 53—EC2·DB 추가 + 칭찬 4 보강 |
| 3 | WAF-01 | C | WAF를 EC2·DB 등에 연결하면 제거 제안 |
| 4 | WAF-02 | A | 입구 하나에 WAF 둘 / 한 WAF가 CloudFront와 LB에 → 판정 vs 제안 결정 필요 |
| 5 | CF-02 | C | 우선순위 낮음 (보류 가능) |

## 2b에서 쓸 조사 요약 (반영 우선순위)

| 우선 | ID | 등급 | 바꿀 곳 |
|---|---|---|---|
| 1 | LB-02 | B | LB와 연결된 EC2가 2개 AZ 이상 (규칙 3·7) |
| 2 | LB-05 | X | 칭찬 1: 모든 공개 LB가 IGW와 이어졌을 때만 |
| 3 | IGW-02, IGW-03 | A, B | EC2의 인터넷 직접 연결 (규칙 4 방식 확장 + 칭찬 1·2 보강) |
| 4 | NAT-01, NAT-03 | A | 모든 NAT가 퍼블릭, 사용자—NAT 금지 (규칙 6) |
| 5 | LB-03, LB-06, NAT-02 | C | 제안 규칙 (SUGGESTION) |
