# 컨테이너·CI/CD 묶음 — ECR · ECS · EKS · Fargate · CodeCommit · CodeBuild · CodePipeline · CodeDeploy

기준·양식: README.md. 인용은 영어 원문 15단어 이내. 등급 A 오류 / B 경고 / C 제안 / X 제외.
원칙(사용자 결정 2026-10-27): 현실과 벗어나는 판정을 하지 않는다 (문서보다 엄격해도, 느슨해도 안 된다).

## 컨테이너 (3k, 조사일 2026-10-27)

### CTR-01 · 등급 B ★ 고칠 곳 (현재 배치가 문서보다 엄격함)
- 요약: ECS(Fargate)·EKS는 퍼블릭 서브넷에도 둘 수 있다. 앱의 배치 규칙은 프라이빗 서브넷만 허용해 퍼블릭 서브넷 배치를 막고 있다. 다만 퍼블릭 IP를 자동으로 받아 인터넷에 드러나는 것은 Security Hub가 실패로 본다(ECS.2, High)
- 근거: [Fargate 작업 네트워킹](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html), [EKS VPC·서브넷 요구사항](https://docs.aws.amazon.com/eks/latest/userguide/network-reqs.html), [Security Hub ECS.2](https://docs.aws.amazon.com/securityhub/latest/userguide/ecs-controls.html)
- 인용: "When using a public subnet, you can assign a public IP address to the task ENI." / "The subnets can be public or private." / "ECS services should not have public IP addresses assigned to them automatically" (ECS.2)
- 표현 방식: ECS·EKS·Fargate 배치를 "퍼블릭 또는 프라이빗 서브넷"으로 넓힌다. 퍼블릭 서브넷에 두면 경고(서버 위치 규칙 11과 같은 방식). DB 서브넷·서브넷 밖은 위치가 성립하지 않아 막음(배치 거부) — 문서가 DB 서브넷을 금지하진 않지만 DB 계층이라 앱의 약속으로 둔다
- 반례 구성: Fargate를 퍼블릭 서브넷에 놓음. 지금은 배치가 거부됨
- 반영 규칙: PLACEMENT `appSubnet` 신설 + VALIDATION #17 컨테이너 위치(경고)
- 상태: 반영됨 (v1.37)

### CTR-02 · 등급 A(근거) → 화면 B 경고 ★ 새 규칙
- 요약: 컨테이너가 이미지를 받으려면(ECR) 인터넷으로 나가는 길이 있어야 한다. 프라이빗 서브넷에서는 NAT를 거치거나, ECR 인터페이스 VPC Endpoints(+ S3 게이트웨이 엔드포인트)를 써야 한다
- 근거: [Fargate 작업 네트워킹](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html), [ECR VPC 엔드포인트](https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html)
- 인용: "For a task on Fargate to pull a container image, the task must have a route to the internet." / "you must create a gateway endpoint for Amazon S3"
- 표현 방식: 프라이빗 서브넷의 ECS·EKS·Fargate가 ECR과 이어졌는데, (그 박스에 NAT 연결 없음) 그리고 (ECR에 VPC Endpoints 연결 없음)이면 경고
- 등급 이유: 문서상 필수지만 앱은 라우팅 테이블을 그리지 않아 연결선으로 추정 → 경고 (SSM-01과 같은 이유)
- 반영 규칙: VALIDATION #18 컨테이너 이미지 경로
- 상태: 반영됨 (v1.37)

### CTR-03 · 등급 A
- 요약: EKS 클러스터는 서로 다른 AZ의 서브넷 2개 이상이 필요하다
- 근거: [EKS VPC·서브넷 요구사항](https://docs.aws.amazon.com/eks/latest/userguide/network-reqs.html)
- 인용: "at least two subnets that are in different Availability Zones"
- 표현 방식: EKS가 있는 VPC의 서브넷이 AZ 2곳 미만이면 오류 (DB-01과 같은 방식)
- 반영 규칙: VALIDATION #19 EKS 서브넷 AZ
- 상태: 반영됨 (v1.37)

### CTR-04 · 등급 C
- 요약: Fargate는 컨테이너를 서버(EC2) 관리 없이 실행하는 방식이다. ECS(또는 EKS)와 함께 쓰므로 ECS·EKS와 이어지지 않은 Fargate는 구성이 덜 된 것이다
- 근거: [Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- 인용: "technology that you can use with Amazon ECS to run containers without having to manage servers"
- 표현 방식: ECS·EKS 어느 쪽과도 이어지지 않은 Fargate가 있으면 제안 (문서가 "금지"를 말하진 않아 오류·경고 아님)
- 반영 규칙: SUGGESTION #16 Fargate 짝
- 상태: 반영됨 (v1.37)

### CTR-05 · 등급 — 보류 (ROADMAP 13번으로)
- 요약: 컨테이너 앱(LB—ECS·EKS·Fargate—RDS)은 문서가 지원하는 구성이다(ALB·NLB가 Fargate 작업에 요청 분산). 그런데 앱의 기존 판정(규칙 2·3·5 등)은 앱 계층을 EC2로만 보아, EC2 없이 컨테이너만 있으면 "EC2가 없어요" 오류가 난다 — 문서보다 엄격
- 근거: [ECS 서비스 로드 밸런싱](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html)
- 인용: "Amazon ECS services hosted on AWS Fargate support the Application Load Balancers, Network Load Balancers"
- 표현 방식: "앱 서버 = EC2 또는 ECS·EKS·Fargate"로 판정 전체를 넓히는 큰 변경이라 이번 칸에서 하지 않는다. 13번(마이그레이션 설계: 옮기기 전후 비교)에서 컨테이너 구성을 정상으로 다룰 때 함께 설계한다
- 상태: 보류

### CTR-06 · 등급 X
- 요약: ECR은 이미지 저장소(리전 서비스)라 VPC 밖에 둔다(현재 배치 규칙 유지). ECR—ECS·EKS·Fargate(이미지 받기), ECR—CodeBuild(이미지 올리기)는 문서가 설명하는 정상 관계라 오류가 아니다. ECR의 필수 연결은 문서에 없다
- 근거: [ECR VPC 엔드포인트](https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html)
- 상태: 제외 (규칙 없음)

## CI/CD (3k)

### CICD-01 · 등급 X
- 요약: CodeCommit·CodeBuild·CodePipeline·CodeDeploy는 계정·리전 수준 서비스로 VPC 밖에 둔다(현재 배치 규칙 유지). 서비스끼리의 연결은 문서가 허용하는 조합이 많고(CodePipeline의 소스는 CodeCommit 외에도 S3·ECR·Bitbucket 등, CodeDeploy 대상은 EC2·온프레미스·Lambda·ECS), "필수/안 됨"으로 못 박은 문장을 다이어그램 연결로 옮길 수 있는 것이 없다
- 근거: [CodeDeploy](https://docs.aws.amazon.com/codedeploy/latest/userguide/welcome.html), [CodePipeline 실행 방식](https://docs.aws.amazon.com/codepipeline/latest/userguide/concepts-how-it-works.html)
- 인용: "automates application deployments to Amazon EC2 instances, on-premises instances, serverless Lambda functions, or Amazon ECS services"
- 표현 방식: 규칙을 만들지 않는다. 설정값(에이전트 설치·IAM 역할·승인 단계)이라 다이어그램 항목이 아님
- 상태: 제외

### CICD-02 · 등급 X (확인 못 함)
- 요약: CodeCommit이 신규 고객에게 닫혔다는 안내를 CodeCommit 소개 문서에서 찾지 못했다. 근거 문서를 찾지 못했으므로 서비스 이용 가능 여부는 규칙으로 다루지 않는다
- 상태: 제외

## 3l 반영 요약

| 변경 | 근거 |
|---|---|
| PLACEMENT `appSubnet` (ECS·EKS·Fargate: 퍼블릭·프라이빗 서브넷) | CTR-01 |
| VALIDATION #17 컨테이너 위치(경고), #18 컨테이너 이미지 경로(경고), #19 EKS 서브넷 AZ(오류) | CTR-01·02·03 |
| SUGGESTION #16 Fargate 짝 | CTR-04 |
