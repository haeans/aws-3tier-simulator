# 월 비용 근거 (AWS 공식 가격 확인 결과, 47번)

- 확인한 날: 2026-11-13
- 지역: 아시아 태평양(서울) ap-northeast-2, 온디맨드, 미국 달러(USD)
- 방법: AWS 공식 가격 데이터를 직접 받아 숫자를 확인했다. 기억으로 채운 숫자는 없다.
  - AWS Price List Bulk API (서울 지역 파일): `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<서비스 코드>/current/ap-northeast-2/index.json`
    (Route 53은 전 세계 공통 파일 `.../AmazonRoute53/current/index.json`)
  - EC2·RDS 인스턴스는 가격 페이지가 쓰는 공식 데이터 `https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/...`에서도 같은 값을 확인했다
  - 각 항목의 "데이터 발행일"은 그 파일에 적힌 날짜다
- 앱 계산: 시간 요금 × 730시간(한 달) = 월 요금. 결과는 "대략"이며 실제 청구와 다를 수 있다 (저장 공간·데이터 전송·요청 수 요금은 넣지 않음)
- 사람이 읽는 가격 페이지 주소도 함께 적었다 (같은 숫자를 보여 주는 공식 페이지)

---

## C1. EC2 (Linux, 온디맨드) — t3.small / t3.medium / t3.large
- 값: $0.026 / $0.052 / $0.104 per hour
- 데이터: meteredUnitMaps ec2-ondemand-without-sec-sel, Asia Pacific (Seoul), Linux (발행 2026-11-10)
- 페이지: https://aws.amazon.com/ec2/pricing/on-demand/
- 앱: 서버 크기 작게 / 보통 / 크게 (46번)
- 별도: EBS 디스크, 데이터 전송

## C2. RDS for MySQL (온디맨드) — db.t3.small / db.t3.medium / db.t3.large
- 값 Single-AZ: $0.052 / $0.104 / $0.208 per hour
- 값 Multi-AZ: $0.104 / $0.208 / $0.416 per hour (Single-AZ의 정확히 2배)
- 데이터: meteredUnitMaps rds-mysql-ondemand, "Database Instance MySQL No license required db t3.* General purpose Single-AZ / Multi-AZ" (발행 2026-11-12)
- 페이지: https://aws.amazon.com/rds/mysql/pricing/
- 앱: RDS·Read Replica는 Single-AZ 값. RDS Standby 박스는 Multi-AZ로 늘어난 몫(= 같은 크기 Single-AZ 1대 값)으로 계산
- 별도: 저장 공간, 백업 저장 공간, 데이터 전송

## C3. ElastiCache (Redis OSS, 온디맨드) — cache.t3.medium
- 값: $0.099 per node-hour (참고: 같은 크기 Valkey $0.0792)
- 데이터: Price List AmazonElastiCache ap-northeast-2, "APN2-NodeUsage:cache.t3.medium ... running Redis"
- 페이지: https://aws.amazon.com/elasticache/pricing/
- 앱: 박스 1개 = 노드 1개 (크기 설정 없음). 보안 그룹 포트를 Redis로 보여 주므로(45번) Redis 값을 쓴다

## C4. NAT 게이트웨이
- 값: $0.059 per NAT Gateway Hour
- 데이터: Price List AmazonEC2 ap-northeast-2, productFamily "NAT Gateway", usagetype APN2-NatGateway-Hours
- 페이지: https://aws.amazon.com/vpc/pricing/
- 별도: 처리한 데이터 GB당 요금 (APN2-NatGateway-Bytes)

## C5. Application Load Balancer
- 값: $0.0225 per Application LoadBalancer-hour
- 데이터: Price List AWSELB ap-northeast-2, APN2-LoadBalancerUsage (발행 2026-11-11)
- 페이지: https://aws.amazon.com/elasticloadbalancing/pricing/
- 별도: LCU(사용량) $0.008 per LCU-hour

## C6. VPC 엔드포인트 (인터페이스)
- 값: $0.013 per VPC Endpoint Hour
- 데이터: Price List AmazonVPC ap-northeast-2, APN2-VpcEndpoint-Hours
- 페이지: https://aws.amazon.com/privatelink/pricing/
- 앱: VPC Endpoints 박스와 이어진 인터페이스형 서비스(ECR·CloudWatch·Session Manager)마다 1개 × 2개 AZ로 계산 (가정: 엔드포인트는 AZ마다 요금). 게이트웨이형(S3·DynamoDB)은 무료
- 별도: 처리한 데이터 GB당 요금

## C7. Client VPN
- 값: $0.10 per Client VPN Endpoint Association Hour
- 데이터: Price List AmazonVPC ap-northeast-2, APN2-ClientVPN-EndpointHours
- 페이지: https://aws.amazon.com/vpn/pricing/
- 앱: 서브넷 연결 1개로 계산 (가정)
- 별도: 접속 시간 요금

## C8. Fargate (Linux, x86)
- 값: vCPU $0.04656 per hour, 메모리 $0.00511 per GB-hour
- 데이터: Price List AmazonECS ap-northeast-2, APN2-Fargate-vCPU-Hours:perCPU / APN2-Fargate-GB-Hours
- 페이지: https://aws.amazon.com/fargate/pricing/
- 앱 (가정): 작업 크기 작게 0.25 vCPU·0.5 GB / 보통 0.5 vCPU·1 GB / 크게 1 vCPU·2 GB, 박스 1개 = 작업 1개

## C9. EKS 클러스터
- 값: $0.10 per cluster per hour
- 데이터: Price List AmazonEKS ap-northeast-2, APN2-AmazonEKS-Hours:perCluster (표준 지원)
- 페이지: https://aws.amazon.com/eks/pricing/
- 별도: 노드(EC2·Fargate) 요금

## C10. AWS WAF
- 값: 웹 ACL $5.00 per month, 규칙 $1.00 per month
- 데이터: Price List awswaf ap-northeast-2, APN2-WebACL / APN2-Rule
- 페이지: https://aws.amazon.com/waf/pricing/
- 앱: WAF 박스 1개 = 웹 ACL 1개 + 규칙 1개 (가정)
- 별도: 요청 100만 건당 요금

## C11. Route 53 호스팅 영역
- 값: $0.50 per Hosted Zone per month (처음 25개)
- 데이터: Price List AmazonRoute53 (전 세계 공통), "HostedZone" (발행 2026-11-04)
- 페이지: https://aws.amazon.com/route53/pricing/
- 별도: DNS 조회 요청 수 요금

## C13. Site-to-Site VPN 연결 (48번)
- 값: $0.05 per VPN Connection-Hour
- 데이터: Price List AmazonVPC ap-northeast-2, APN2-VPN-Usage-Hours:ipsec.1 (CreateVpnConnection)
- 페이지: https://aws.amazon.com/vpn/pricing/
- 앱: 고객 게이트웨이—VGW 선(VPN) 하나 = 연결 1개
- 별도: 데이터 전송(밖으로 나가는 데이터) 요금

## C14. Direct Connect 1Gbps 전용(Dedicated) 포트 (48번)
- 값: $0.30 per connected 1G port-hour (서울의 Direct Connect 위치들: KINX 가산, LG U+ 평촌, Digital Realty ICN10)
- 참고: 호스티드 연결(Hosted) 1G는 $0.33 per port-hour
- 데이터: Price List AWSDirectConnect ap-northeast-2, APN2-*-PortUsage:1G (발행 2026-11-08)
- 페이지: https://aws.amazon.com/directconnect/pricing/
- 앱: 고객 게이트웨이—VGW 선(Direct Connect) 하나 = 1Gbps 전용 포트 1개 (가정: 포트 속도 1Gbps)
- 별도: 데이터 전송 요금, Direct Connect 위치까지의 회선(통신사) 비용

## C15. DMS 복제 인스턴스 (49번)
- 값: dms.t3.small $0.056 / dms.t3.medium $0.112 / dms.t3.large $0.224 per hour (Single-AZ), Multi-AZ는 2배
- 데이터: Price List AWSDatabaseMigrationSvc ap-northeast-2, APN2-InstanceUsg:dms.t3.* / APN2-Multi-AZUsg:dms.t3.*
- 페이지: https://aws.amazon.com/dms/pricing/
- 앱: 박스 1개 = dms.t3.medium Single-AZ 1개 (크기 설정 없음, 가정)

## C16. MGN 복제 (49번)
- 값: $0.042 per Replication-hour (Paid_replication). 같은 파일에 Free_replication $0 항목이 있다 (서버마다 무료 복제 시간)
- 데이터: Price List AWSApplicationMigrationSvc ap-northeast-2, APN2-MGN-Replication (발행 2026-09-11)
- 페이지: https://aws.amazon.com/application-migration-service/pricing/
- 앱: MGN 박스와 이은 원본 서버 1대마다 복제 시간 요금. 무료 시간은 빼지 않고 "처음 일정 기간 무료"라고만 적는다 (무료 시간 길이는 이번에 확인하지 않음)
- 별도: 스테이징의 복제 서버(EC2)·디스크(EBS) 요금

## C12. 금액을 넣지 않는 것
- 무료: 인터넷 게이트웨이·VPC·서브넷·라우팅 테이블·보안 그룹, 게이트웨이 VPC 엔드포인트(S3·DynamoDB), ECS 자체(실행 방식. 요금은 작업을 돌리는 EC2·Fargate에)
  - 페이지: https://aws.amazon.com/vpc/pricing/ , https://aws.amazon.com/ecs/pricing/
- 회사 비용(AWS 요금이 아님): 온프레미스 서버·DB·고객 게이트웨이 장치 (48번)
- 연결 요금에 함께 계산: VGW (고객 게이트웨이—VGW 선의 VPN·Direct Connect 요금으로만 계산하고 VGW 자체 금액은 따로 넣지 않음)
- 사용량에 따라 요금이 붙거나 이번에 금액을 조사하지 않은 것: CloudFront·S3·DynamoDB·CloudWatch·CloudTrail·ECR·Session Manager·CodeCommit·CodeBuild·CodePipeline·CodeDeploy
  - 앱은 "사용량에 따라 요금"으로만 표시한다 (요청 수·데이터 양을 입력받지 않으므로)
