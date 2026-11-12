# 요청 흐름 해설 근거 (AWS 공식 문서 확인 결과)

- 확인한 날: 2026-11-12
- 방법: docs.aws.amazon.com 페이지를 WebFetch로 직접 열어 본문에서 문장을 확인했다. 기억으로 채운 문장은 없다.
- 근거 문장은 본문에서 필요한 부분만 잘라 적었다(문장 일부일 수 있음). 잘라 낸 곳은 `...`로 표시했다.

---

## F1. Route 53은 도메인 이름을 IP 주소로 바꿔 알려 준다
- 판정: 확인됨
- 근거 문장: "A DNS service such as Amazon Route 53 makes the connection between domain names and IP addresses."
- URL: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/welcome-dns-service.html
- 참고: 같은 페이지 6번 단계에 Route 53 네임 서버가 레코드 값(IP 주소)을 찾아 DNS 리졸버에 돌려준다는 설명이 있다.

## F2. CloudFront는 캐시에 있으면 바로 응답, 없으면 원본에서 가져온다
- 판정: 확인됨
- 근거 문장: "If the object is in the cache, CloudFront returns it to the user."
- 근거 문장 2 (캐시에 없을 때): "...forwards the request to your origin server for the corresponding object..."
- URL: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html
- 참고: 원본에서 받은 객체는 다음 요청을 위해 캐시에 넣는다는 설명도 같은 단계에 있다.

## F3. AWS WAF는 CloudFront·ALB로 가는 웹 요청을 규칙으로 검사해 허용/차단한다
- 판정: 확인됨
- 근거 문장: "Rules that can allow, block, or count web requests that meet the specified criteria."
- URL: https://docs.aws.amazon.com/waf/latest/developerguide/what-is-aws-waf.html
- 참고: 같은 페이지의 보호 대상 목록에 "Amazon CloudFront distribution", "Application Load Balancer"가 있다. WAF는 보호 대상으로 전달되는 HTTP/HTTPS 요청을 모니터링한다고 설명한다.

## F4. 인터넷 게이트웨이는 VPC와 인터넷 사이의 통신을 가능하게 한다
- 판정: 확인됨
- 근거 문장: "...VPC component that allows communication between your VPC and the internet."
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html

## F5. 라우팅 테이블에 IGW로 가는 경로가 있으면 퍼블릭 서브넷이다
- 판정: 확인됨
- 근거 문장: "If a subnet is associated with a route table that has a route to an internet gateway, it's known as a public subnet."
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
- 참고: https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html 의 "Subnet types"에도 같은 정의가 있다(퍼블릭 = IGW로 직접 가는 경로 있음, 프라이빗 = 없음).

## F6. 모든 라우팅 테이블에는 VPC 안 통신용 local 경로가 있다
- 판정: 확인됨
- 근거 문장: "Every route table contains a local route for communication within the VPC."
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html
- 참고: 바로 다음 문장이 이 경로는 모든 라우팅 테이블에 기본으로 추가된다는 내용이다. "서브넷끼리 통신 가능"은 경로(라우팅) 기준이다. 실제 통신은 보안 그룹·네트워크 ACL이 허용해야 한다(이 부분은 이 페이지에 없음).

## F7. Load Balancer는 트래픽을 여러 가용 영역의 대상에 나눠 보낸다
- 판정: 확인됨
- 근거 문장: "The load balancer distributes incoming application traffic across multiple targets, such as EC2 instances, in multiple Availability Zones."
- URL: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html

## F8. Load Balancer는 상태 확인을 해서 정상인 대상에게만 보낸다
- 판정: 확인됨
- 근거 문장: "It monitors the health of its registered targets, and routes traffic only to the healthy targets."
- URL: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html

## F9. 보안 그룹은 상태 저장(stateful)이다
- 판정: 확인됨
- 근거 문장: "Responses to allowed inbound traffic are allowed to leave the instance, regardless of the outbound rules."
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html
- 참고: 바로 앞에 "Security groups are stateful."이 있다.

## F10. 규칙의 출발지로 다른 보안 그룹 지정 가능 / ALB 뒤 인스턴스는 로드 밸런서 트래픽만 허용
- 판정: 확인됨 (두 부분 모두)
- 근거 문장 (출발지로 보안 그룹): "The source is the security group for the load balancer."
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
  - 같은 페이지 "Components of a security group rule"의 Source or destination 목록에 "The ID of a security group"이 있고, 예시가 "웹 서버 보안 그룹은 로드 밸런서에서 오는 HTTP/HTTPS만 허용"이다.
- 근거 문장 (권장): "...restrict the security groups associated with your targets to accept traffic solely from the load balancer."
- URL: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-update-security-groups.html

## F11. ElastiCache 지연 로딩: 캐시 먼저, 없으면 DB에서 읽어 캐시에 넣는다
- 판정: 확인됨
- 근거 문장: "Whenever your application requests data, it first makes the request to the ElastiCache cache."
- 근거 문장 2: "Your application next writes the data received from the store to the cache."
- URL: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html
- 참고: 캐시에 없거나 만료됐으면 앱이 데이터 저장소(DB)에 요청한다는 문장이 두 문장 사이에 있다. 캐시에 쓰는 주체는 ElastiCache가 아니라 **앱**이다.

## F12. 앱은 RDS DB 인스턴스의 엔드포인트와 포트로 접속한다
- 판정: 확인됨
- 근거 문장: "...specify the DNS address from the DB instance endpoint as the host parameter."
- URL: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_CommonTasks.Connect.html
- 참고: 다음 문장이 포트 번호도 엔드포인트의 것을 port 매개변수로 지정하라는 내용이다.

## F13. 읽기 전용 복제본은 읽기 쿼리를 받아 원본 DB 부하를 줄인다
- 판정: 확인됨
- 근거 문장: "You can reduce the load on your primary DB instance by routing queries from your applications to the read replica."
- URL: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html
- 참고: 같은 페이지에서 read replica는 DB 인스턴스의 읽기 전용 사본이고, 원본의 변경은 **비동기**로 복제된다고 설명한다(복제본 데이터가 조금 늦을 수 있음).

## F14. NAT 게이트웨이: 안에서 밖으로는 연결, 밖에서 안으로는 연결 시작 불가
- 판정: 확인됨
- 근거 문장: "...instances in a private subnet can connect to services outside your VPC but external services can't initiate a connection with those instances."
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html

## F15. NAT 게이트웨이는 인스턴스의 출발지 IP를 NAT 게이트웨이의 주소로 바꾼다
- 판정: 확인됨 (세부 차이 있음, 아래 참고)
- 근거 문장: "...NAT gateways map the source private IPv4 address of the instances to the private IPv4 address of the NAT gateway."
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
- 참고: 문서의 설명은 2단계다. (1) NAT 게이트웨이가 인스턴스의 프라이빗 IP를 NAT 게이트웨이의 **프라이빗 IP**로 바꾸고, (2) 퍼블릭 NAT 게이트웨이면 **인터넷 게이트웨이**가 그 프라이빗 IP를 NAT 게이트웨이의 **Elastic IP**로 바꾼다. 응답이 돌아올 때는 NAT 게이트웨이가 원래 출발지 주소로 되돌린다. 한 줄 해설에서 "NAT 게이트웨이의 주소로 바뀐다"는 맞지만, "NAT가 직접 공인 IP로 바꾼다"고 쓰면 문서와 다르다.

## F16. 프라이빗 서브넷 라우팅 테이블에 0.0.0.0/0 → NAT 경로 필요 / 퍼블릭 NAT는 퍼블릭 서브넷에 두고 IGW로 나간다
- 판정: 확인됨 (두 부분 모두)
- 근거 문장 (프라이빗 서브넷 경로): "The second entry sends all other subnet traffic to the NAT gateway."
  - 해당 라우팅 테이블 표: Destination `0.0.0.0/0` → Target `nat-gateway-id`
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-scenarios.html
- 근거 문장 (퍼블릭 NAT 위치): "You create a public NAT gateway in a public subnet..."
- 근거 문장 (IGW로): "You route traffic from the NAT gateway to the internet gateway for the VPC."
- URL: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
- 참고: 퍼블릭 NAT 게이트웨이는 만들 때 Elastic IP를 연결해야 한다는 내용도 같은 문단에 있다.

## F17. VPC 엔드포인트를 쓰면 IGW·NAT 없이 AWS 서비스에 비공개로 연결
- 판정: 확인됨
- 근거 문장: "You do not need to use an internet gateway, NAT device, public IP address, ..."
- URL: https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html
- 참고: 이 문장은 AWS PrivateLink(인터페이스 엔드포인트) 설명이다. 게이트웨이 엔드포인트(S3·DynamoDB)는 PrivateLink를 쓰지 않지만 같은 취지의 문장이 따로 있다: "...without requiring an internet gateway or a NAT device for your VPC." (https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)

## F18. 게이트웨이 엔드포인트는 라우팅 테이블 경로로, 인터페이스 엔드포인트는 서브넷 안의 네트워크 인터페이스(프라이빗 IP)로 동작
- 판정: 확인됨 (두 부분 모두)
- 근거 문장 (게이트웨이): "The destination is a prefix list for the service owned by AWS and the target is the gateway endpoint."
- URL: https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html
  - 같은 페이지 첫 문장에서 게이트웨이 엔드포인트의 대상이 Amazon S3와 DynamoDB라고 밝힌다.
- 근거 문장 (인터페이스): "We create an endpoint network interface for the VPC endpoint in your subnet."
- URL: https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html
  - 같은 페이지에서 AWS 서비스로 가는 트래픽은 DNS로 엔드포인트 네트워크 인터페이스의 프라이빗 IP 주소로 풀이된다고 설명한다.

## F19. Session Manager는 인바운드 포트를 열지 않아도 된다 (SSM Agent가 밖으로 연결)
- 판정: 일부만 확인됨
  - 확인된 부분: 인바운드 포트를 열 필요가 없다 / 관리 대상 노드는 아웃바운드 HTTPS(443)를 허용해야 한다
  - 못 찾은 부분: "SSM Agent가 연결을 **시작한다**(initiates)"고 직접 말하는 문장. 연 3개 페이지(session-manager, session-manager-prerequisites, ssm-agent-technical-details)에는 없었다.
- 근거 문장 (인바운드 불필요): "...secure node management without the need to open inbound ports, maintain bastion hosts, or manage SSH keys."
- URL: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
- 근거 문장 (아웃바운드 필요): "The managed nodes you connect to must also allow HTTPS (port 443) outbound traffic to the following endpoints"
  - 엔드포인트: ec2messages, ssm, ssmmessages
- URL: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html
- 해설 문구 제안: "인스턴스가 밖으로(443) 나가는 길만 있으면 된다"까지는 근거가 있다. "에이전트가 먼저 연결을 건다"는 표현은 근거 문장을 못 찾았으므로 피하거나 추가 확인이 필요하다.

## F20. ECS(Fargate 포함) 작업이 ECR에서 이미지를 가져오려면 NAT 또는 VPC 엔드포인트가 필요하다
- 판정: 일부만 확인됨
  - 확인된 부분: **Fargate** 작업은 이미지를 가져오려면 인터넷으로 가는 경로가 있어야 하고, 방법은 (1) 퍼블릭 서브넷 + 퍼블릭 IP, (2) 프라이빗 서브넷 + NAT 게이트웨이, (3) ECR 인터페이스 VPC 엔드포인트 세 가지다.
  - 다른 부분 1: NAT·엔드포인트만이 아니라 "퍼블릭 서브넷에서 퍼블릭 IP를 받는 방법"도 문서에 있다.
  - 다른 부분 2: **EC2 실행 유형**에 대해 "인터넷 경로가 필요하다"고 직접 말하는 문장은 못 찾았다. 엔드포인트로 가져올 때 필요한 엔드포인트 목록만 확인했다.
- 근거 문장 (Fargate): "For a task on Fargate to pull a container image, the task must have a route to the internet."
- URL: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html
- 근거 문장 (엔드포인트 구성): "Amazon ECS tasks hosted on Amazon EC2 instances require both Amazon ECR endpoints and the Amazon S3 gateway endpoint."
- URL: https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html
- 참고: 엔드포인트로 가져올 때는 ECR 엔드포인트(ecr.dkr, ecr.api)만으로는 부족하고 **S3 게이트웨이 엔드포인트**도 필요하다(ECR이 이미지 레이어를 S3에 저장하기 때문). Fargate 플랫폼 버전 1.4.0 이상도 같다. awslogs 로그 드라이버를 쓰면 CloudWatch Logs 엔드포인트도 필요하다.

## F21. 엔드포인트가 없으면 S3·DynamoDB 요청은 퍼블릭 서비스 엔드포인트로 간다
- 판정: 확인됨
- 근거 문장: "Instances in subnets that aren't associated with these route tables use the public service endpoint, not the gateway endpoint."
- URL: https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html
- 참고: 같은 페이지 "Access through an internet gateway"에서 경로를 설명한다. 퍼블릭 서브넷의 인스턴스는 IGW를 거쳐 서비스로 가고, 프라이빗 서브넷의 인스턴스는 IGW 경로가 없어서 NAT 장치를 두어야 보낼 수 있다. 이때 트래픽은 IGW를 지나지만 AWS 네트워크를 벗어나지 않는다고 적혀 있다. S3·DynamoDB 외의 AWS 서비스 일반에 대한 같은 설명은 https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html 의 "Access through public service endpoints"에 있다.

## F22. CloudWatch 에이전트는 인스턴스에서 지표·로그를 수집해 CloudWatch로 보낸다
- 판정: 확인됨
- 근거 문장: "...a software component that collects metrics, logs, and traces from your Amazon EC2 instances, on-premises servers, and containerized applications."
- URL: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html
- 참고: 보내는 곳은 같은 페이지에 따로 적혀 있다. 지표는 CloudWatch(또는 Amazon Managed Service for Prometheus)로 보내고, 로그는 CloudWatch Logs에 저장된다.

---

## 요약

22개 가운데 **확인됨 20개**(F1~F18, F21, F22), **일부만 확인됨 2개**(F19, F20), **못 찾음 0개**다. F19는 "인바운드 포트 불필요"와 "아웃바운드 443 필요"는 확인했지만 "SSM Agent가 연결을 시작한다"는 문장은 못 찾았다. F20은 Fargate만 문장으로 확인됐고(방법도 퍼블릭 IP·NAT·엔드포인트 세 가지), EC2 실행 유형은 필요한 엔드포인트 목록만 확인했다. 확인됨 중에서도 해설 문구를 쓸 때 주의할 점이 있다: F15(NAT는 프라이빗 IP로 바꾸고 Elastic IP로 바꾸는 것은 IGW), F11(캐시에 쓰는 주체는 앱), F13(복제는 비동기), F6(경로 기준이며 보안 그룹·NACL은 별개), F20(ECR 엔드포인트에는 S3 게이트웨이 엔드포인트도 필요).
