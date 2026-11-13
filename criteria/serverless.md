# 서버리스 근거 — API Gateway + Lambda (50번)

- 확인한 날: 2026-11-13
- 방법: docs.aws.amazon.com 페이지를 WebFetch로 직접 열어 본문에서 문장을 확인했다 (하위 에이전트가 조사, 인용·주소를 그대로 옮김)
- 등급: criteria/README.md의 A 오류 / B 경고 / C 제안 / X 제외

---

### SV-01 · 등급 A
- 요약: Lambda는 기본으로 Lambda가 관리하는 VPC(인터넷 가능)에서 돈다. 내 VPC의 리소스(RDS 등)에 닿으려면 함수에 VPC 설정(서브넷·보안 그룹)을 더한다. 사설 리소스에는 프라이빗 서브넷으로 연결
- 근거: https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html
- 인용: "By default, Lambda functions run in a Lambda-managed VPC that has internet access. To access resources in a VPC in your account, you can add a VPC configuration to a function."
- 인용 2 (https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html): "To access private resources, connect your function to private subnets."
- 표현 방식: Lambda 박스는 VPC 밖(기본) 또는 프라이빗 서브넷(VPC 연결). VPC 밖 Lambda가 RDS·RDS Proxy와 이어지면 오류

### SV-02 · 등급 A
- 요약: VPC에 연결한 함수는 그 VPC 안의 리소스에만 닿는다. 인터넷은 NAT(퍼블릭 서브넷)로, AWS 서비스는 VPC 엔드포인트로. 퍼블릭 서브넷에 연결해도 인터넷이 되지 않는다
- 근거: https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html
- 인용: "When you attach your function to a VPC, it can only access resources available within that VPC."
- 인용 2 (configuration-vpc-internet.html): "Connecting a function to a public subnet doesn't give it internet access."
- 근거 3 (https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-ddb.html): "With a gateway endpoint, you can access DynamoDB from your VPC, without requiring an internet gateway or NAT device for your VPC"
- 표현 방식: VPC에 연결한 Lambda가 DynamoDB·S3와 이어졌는데 그 서비스에 VPC Endpoints도, Lambda에 NAT도 없으면 오류. Lambda는 프라이빗 서브넷에만 놓는다 (퍼블릭은 인터넷이 안 되므로 배치에서 막음)

### SV-03 · 등급 C
- 요약: Lambda를 VPC에 연결하면 고가용성을 위해 여러 AZ의 서브넷을 지정한다
- 근거: https://docs.aws.amazon.com/lambda/latest/dg/security-resilience.html
- 인용: "If you configure your function to connect to a virtual private cloud (VPC) in your account, specify subnets in multiple Availability Zones to ensure high availability."
- 표현 방식: VPC에 연결한 Lambda 박스가 한 AZ에만 있으면 제안 (다른 AZ의 프라이빗 서브넷에도)

### SV-04 · 등급 A (연결 방식 설명)
- 요약: Lambda 프록시 통합으로 API Gateway가 받은 요청이 Lambda 함수 하나를 호출한다. 프라이빗 API만 VPC 안(인터페이스 엔드포인트)에서 닿고, REST API 기본 엔드포인트는 엣지 최적화, HTTP API는 리전 엔드포인트만
- 근거: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
- 인용: "The Lambda proxy integration allows the client to call a single Lambda function in the backend."
- 근거 2 (https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-endpoint-types.html): "A private API endpoint is an API endpoint that can only be accessed from your Amazon Virtual Private Cloud (VPC) using an interface VPC endpoint"
- 주의: "엣지 최적화·리전 엔드포인트는 공개"라는 문장 자체는 없다 (프라이빗 정의에서 추론)
- 표현 방식: API Gateway는 VPC 밖. 사용자(또는 CloudFront) → API Gateway → Lambda. API Gateway가 이어진 Lambda가 없으면 오류

### SV-05 · 등급 X (설명만)
- 요약: API Gateway가 Lambda를 호출하려면 리소스 기반 권한(lambda:InvokeFunction)이 필요하다. 콘솔은 이것을 자동으로 더한다
- 근거: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integration-using-cli.html
- 인용: "Instead of supplying an IAM role for credentials, you can use the add-permission command to add resource-based permissions. This is what the API Gateway console does."
- 표현 방식: 권한은 그리지 않으므로 설명 문구에만

### SV-06 · 등급 A (성능 설명)
- 요약: Lambda는 자동으로 늘어나고, 계정의 기본 동시 실행 한도는 리전마다 1,000. 초당 요청 한도는 동시 실행의 10배(기본 10,000)
- 근거: https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html
- 인용: "By default, Lambda provides your account with a total concurrency limit of 1,000 concurrent executions across all Event Functions in an AWS Region."
- 표현 방식: 성능 시뮬레이션 — Lambda 처리량 한도 초당 10,000요청(계정 기본값, 문서 숫자)

### SV-07 · 등급 C
- 요약: 짧은 DB 연결을 자주 열고 닫는 Lambda에는 RDS Proxy를 권장한다 (DB 연결 고갈 방지). 함수는 DB와 같은 VPC에 있어야 한다
- 근거: https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html
- 인용: "We recommend using Amazon RDS Proxy for Lambda Event Functions that make frequent short database connections, or open and close large numbers of database connections."
- 표현 방식: Lambda가 RDS에 바로 이어져 있으면 제안 (Lambda — RDS Proxy — RDS)

### SV-08 · 등급 A (설명)
- 요약: DynamoDB는 서버리스·완전관리형 NoSQL이고 사용자 이름·비밀번호 없이 IAM으로 접근한다
- 근거: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html
- 인용: "Amazon DynamoDB is a serverless, fully managed, distributed NoSQL database with single-digit millisecond performance at any scale."
- 표현 방식: 완전 서버리스 구성의 DB. 판정 5는 Lambda — DynamoDB도 앱—DB 연결로 본다

### SV-09 · 등급 A (성능 설명)
- 요약: API Gateway는 계정·리전마다 기본 초당 10,000요청, 버스트 5,000 (일부 리전은 더 낮음). 넘으면 429
- 근거: https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html
- 인용: "10,000 requests per second (RPS) with an additional burst capacity provided by the token bucket algorithm, using a maximum bucket capacity of 5,000 requests."
- 표현 방식: 성능 시뮬레이션 — API Gateway 처리량 한도 초당 10,000요청 (서울은 낮은 리전 목록에 없음)

### SV-10 · 등급 C
- 요약: AWS WAF로 API Gateway REST API를 보호할 수 있다. HTTP API는 WAF를 지원하지 않는다
- 근거: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-aws-waf.html
- 인용: "You can use AWS WAF to protect your API Gateway REST API from common web exploits, such as SQL injection and cross-site scripting (XSS) attacks."
- 근거 2 (https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html): "Choose REST APIs if you need features such as API keys, per-client throttling, request validation, AWS WAF integration, or private API endpoints."
- 표현 방식: WAF — API Gateway 연결 허용(REST API 기준). 웹 방화벽 제안(제안 9)이 API Gateway 입구도 본다

### SV-11 · 등급 X (설명)
- 요약: 콘솔 자동 설정에서 DB의 보안 그룹은 Lambda(또는 프록시)의 보안 그룹을 출발지로 하는 인바운드 규칙을 갖는다
- 근거: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/lambda-rds-connect.html
- 인용: "This security group has an inbound rule with the VPC security group of the Lambda function or proxy as the source."
- 주의: 일반적인 "must" 문장은 찾지 못했다
- 표현 방식: 45번 보안 그룹 — RDS에 "DB 포트 ← Lambda(또는 RDS Proxy)의 보안 그룹". 판정 규칙은 만들지 않음
