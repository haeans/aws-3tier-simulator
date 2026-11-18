# EC2 역할 근거 — 웹 서버·앱 서버·점프 서버(Bastion), 요청 흐름 (51번)

- 확인한 날: 2026-11-18
- 방법: docs.aws.amazon.com·aws.amazon.com 페이지를 WebFetch로 직접 열어 본문에서 문장을 확인했다 (하위 에이전트가 조사, 인용·주소를 그대로 옮김)
- 등급: criteria/README.md의 A 오류 / B 경고 / C 제안 / X 제외
- 주의: "웹 계층은 프라이빗 서브넷에 둔다"를 못 박은 AWS 참조 아키텍처는 찾지 못했다. 3-Tier 백서 주소는 지금 블로그·안내 페이지로 넘어간다

---

### RL-01 · 등급 B/C (계층 배치)
- 요약: 계층(웹·앱·DB)은 서브넷으로 나눈다. 인터넷에 직접 닿을 필요가 없는 인스턴스는 프라이빗 서브넷에 둔다. LB 뒤의 대상은 공개 IP가 필요 없다
- 근거: https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/application.html
- 인용: "Use subnets to isolate the tiers of your application (for example, web, application, and database) within a single VPC."
- 인용 2: "Instances that do not require direct internet access MUST be placed in private subnets."
- 근거 2 (https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html): "Therefore, your targets do not need public IP addresses to receive requests from an internal or an internet-facing load balancer."
- 문서끼리 다름 (https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html): "Each Availability Zone has a public subnet for web servers and a private subnet for database servers." → 웹 서버를 퍼블릭에 두는 예시도 있다
- 표현 방식: 앱 서버가 퍼블릭 서브넷 → 경고(B, 지금 판정 11). 웹 서버가 퍼블릭 서브넷 → 문서끼리 달라서 오류로 막지 않는다 (등급은 사용자 결정)

### RL-02 · 등급 C (내부 Load Balancer)
- 요약: 계층이 여럿이면 인터넷용 LB → 웹 서버 → 내부 LB → 앱 서버로 만들 수 있다
- 근거: https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html
- 인용: "If your application has multiple tiers, you can design an architecture that uses both internal and internet-facing load balancers. For example, this is true if your application uses web servers that must be connected to the internet, and application servers that are only connected to the web servers."
- 인용 2: "Create an internal load balancer and register the application servers with it. The web servers receive requests from the internet-facing load balancer and send requests for the application servers to the internal load balancer."
- 표현 방식: "you can design"이라 필수가 아니다. 웹 → 앱을 바로 이어도 오류가 아니고, 내부 LB는 제안

### RL-03 · 등급 A (내부 Load Balancer는 인터넷에서 닿지 않음)
- 요약: 내부 LB의 노드는 사설 IP만 가져서, VPC에 닿을 수 있는 곳에서 오는 요청만 받는다
- 근거: 위와 같은 페이지
- 인용: "The nodes of an internal load balancer have only private IP addresses."
- 인용 2: "Therefore, internal load balancers can only route requests from clients with access to the VPC for the load balancer."
- 표현 방식: (내부 LB를 넣는다면) IGW·CloudFront·사용자가 내부 LB로 바로 들어오면 오류
- 반영 (51-2, v1.71): 판정 27. 내부 LB는 연결로 짐작(인터넷 쪽과 잇지 않고 웹 서버 뒤)하고 설명 패널 "종류" 칸에서 바꾼다. 제안 26(RL-02)은 웹 서버가 앱 서버 2대 이상과 바로 이어졌을 때만

### RL-04 · 등급 A/C (점프 서버, Bastion)
- 요약: 프라이빗 서브넷의 인스턴스에 원격 접속하려고 퍼블릭 서브넷에 점프 서버를 둔다. 지금은 Session Manager를 권장한다
- 근거: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/vpc-bastion-host.html
- 인용: "To create a bastion host, you launch an Amazon EC2 instance in your public subnet that will act as the bastion host."
- 근거 2 (https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-startup-security-baseline/wkld-06.html): "Use Session Manager instead of running Amazon EC2 instances in public subnets or running bastion hosts."
- 근거 3 (SRA, RL-01 주소): "Remote instance access SHOULD use Systems Manager Session Manager. Inbound SSH/RDP ports SHOULD NOT be open to the internet."
- 표현 방식: 점프 서버가 프라이빗 서브넷 → 밖에서 닿지 않아 역할을 못 함(오류). 점프 서버를 Session Manager로 바꾸라는 것은 제안(지금 제안 6)

### RL-05 · 등급 B/C (보안 그룹)
- 요약: 계층마다 앞 계층의 보안 그룹에서 오는 것만 허용한다. Security Hub는 EC2의 공개 IPv4(EC2.9), 22번 포트 전체 공개(EC2.13·53)를 알린다
- 근거: https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
- 인용: "Add rules to the security group for the web servers to allow HTTP and HTTPS traffic only from the load balancer. The source is the security group for the load balancer."
- 근거 2 (https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html): "[EC2.9] Amazon EC2 instances should not have a public IPv4 address", "[EC2.13] Security groups should not allow ingress from 0.0.0.0/0 or ::/0 to port 22"
- 표현 방식: 45번 보안 그룹 표시 — 웹 ← LB, 앱 ← 웹(또는 내부 LB), 점프 서버 ← 관리자 IP(22번), 앱 서버 ← 점프 서버(22번). 판정 규칙은 만들지 않음

### RL-06 · 등급 X (거꾸로 가는 요청)
- 요약: 앱 계층에서 웹 계층으로 요청이 되돌아가면 안 된다는 문서는 찾지 못했다 (ELB 문서는 앞 방향만 설명)
- 표현 방식: 문서 근거가 아닌 학습용 설계 규칙. 되돌아가는 선은 흐름 점을 그리지 않고, 알림 수준은 사용자 결정 (GUIDE.md 4장에 이유)
