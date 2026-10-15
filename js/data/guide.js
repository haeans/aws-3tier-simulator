// @ts-check
// js/data/guide.js — 서비스 설명 패널 내용 (무엇과 연결되는지, 어떤 요청이 오가는지)

/* =========================================================
   서비스 연결 안내
   - links: 보통 연결하는 상대 [{ to: [종류...], text: 오가는 요청 설명 }]
   - avoid: 연결하면 안 되는 상대 [{ to: [종류...], text: 이유와 대신 할 일 }]
   - note:  연결선 없이 쓰는 서비스의 안내 한 줄
   이 파일은 rules보다 먼저 불러오므로 USER_TYPES 같은 이름 대신 종류를 직접 적는다.
   ========================================================= */
const GUIDE_USERS = ['smartphone', 'tablet', 'pc'];
const GUIDE_DBS = ['rds', 'rds-replica', 'rds-standby'];

const USER_GUIDE = {
  links: [
    { to: ['route53'], text: '먼저 Route 53에 도메인 이름(example.com)의 주소를 물어봐요. 받은 주소로 CloudFront나 Load Balancer에 접속해요.' },
    { to: ['cloudfront'], text: '가까운 엣지 로케이션의 CloudFront가 먼저 응답해요. 캐시에 없는 요청은 CloudFront가 원본으로 보내요.' },
    { to: ['igw'], text: '웹 요청은 인터넷 게이트웨이(IGW)를 지나 퍼블릭 서브넷의 Load Balancer로 들어가요.' },
  ],
  avoid: [
    { to: ['ec2', 'elasticache', ...GUIDE_DBS], text: '서버와 DB는 인터넷에서 직접 닿지 않게 숨겨요. IGW → Load Balancer를 거치게 하세요.' },
  ],
};

const SERVICE_GUIDE = {
  smartphone: USER_GUIDE,
  tablet: USER_GUIDE,
  pc: USER_GUIDE,
  dbadmin: {
    links: [
      { to: ['clientvpn'], text: 'Client VPN으로 암호화된 연결을 만들어 VPC 안에 들어온 뒤 DB를 관리해요.' },
      { to: ['sessionmanager'], text: '서버(EC2) 접속은 Session Manager로 해요. 인바운드 포트를 열거나 SSH 키를 관리하지 않아도 돼요.' },
    ],
    avoid: [
      { to: GUIDE_DBS, text: 'DB를 인터넷에 공개하면 누구나 접속을 시도할 수 있어요. 공개하지 말고 Client VPN 같은 비공개 연결로 접속하세요.' },
    ],
  },
  route53: {
    links: [
      { to: GUIDE_USERS, text: '사용자가 도메인 이름으로 접속하면, Route 53이 그 이름에 맞는 주소를 알려 줘요.' },
      { to: ['cloudfront', 'lb'], text: '도메인 이름을 CloudFront나 Load Balancer로 이어 줘요. 상태 확인을 켜면 정상인 곳으로만 안내해요.' },
    ],
    avoid: [
      { to: ['ec2', ...GUIDE_DBS], text: '서버와 DB 주소를 인터넷에 알리지 마세요. 도메인은 CloudFront나 Load Balancer로 연결해요.' },
    ],
  },
  cloudfront: {
    links: [
      { to: GUIDE_USERS, text: '사용자 요청을 가장 가까운 엣지 로케이션에서 받아, 캐시에 있으면 바로 응답해요.' },
      { to: ['s3'], text: 'S3를 원본(오리진)으로 삼아 이미지·정적 파일을 가져오고, 엣지에 캐시해 둬요.' },
      { to: ['waf'], text: 'CloudFront에 WAF를 붙이면, 엣지에서 위험한 요청을 먼저 걸러내요.' },
      { to: ['igw'], text: '캐시에 없거나 매번 달라지는 요청(로그인·주문 등)은 원본인 Load Balancer로 보내요. 이 도구에서는 IGW → Load Balancer로 이어요.' },
    ],
    avoid: [
      { to: GUIDE_DBS, text: 'CloudFront의 원본은 S3나 웹 서버(Load Balancer)예요. DB는 앱 서버(EC2)가 조회해요.' },
    ],
  },
  igw: {
    links: [
      { to: [...GUIDE_USERS, 'cloudfront'], text: '인터넷과 VPC 사이의 통신이 이 문을 지나요.' },
      { to: ['lb'], text: '들어온 요청이 퍼블릭 서브넷의 Load Balancer로 가요.' },
      { to: ['nat'], text: '프라이빗 서버가 밖으로 보내는 요청은 NAT를 거쳐 이 문으로 나가요.' },
    ],
    avoid: [
      { to: GUIDE_DBS, text: 'DB를 인터넷 입구에 바로 연결하면 인터넷에서 DB에 닿을 수 있어요.' },
      { to: ['ec2'], text: '앱 서버를 바로 연결하면 Load Balancer 없이 인터넷에 노출돼요. LB를 거치세요.' },
    ],
  },
  nat: {
    links: [
      { to: ['ec2'], text: '프라이빗 서브넷의 EC2가 업데이트 등으로 밖에 연결할 때 거쳐요. 밖에서 먼저 연결을 시작할 수는 없어요.' },
      { to: ['igw'], text: '퍼블릭 NAT는 퍼블릭 서브넷에 두고, 나가는 요청을 IGW로 보내 인터넷에 내보내요.' },
    ],
    avoid: [],
  },
  lb: {
    links: [
      { to: ['igw'], text: 'IGW를 지나 들어온 인터넷 요청을 받는 입구예요.' },
      { to: ['waf'], text: 'Load Balancer(ALB)에 WAF를 붙이면, EC2로 보내기 전에 위험한 요청을 걸러내요.' },
      { to: ['ec2'], text: '여러 AZ의 EC2에 요청을 나눠요. 상태 확인으로 정상인 EC2에만 보내서, 한 곳이 멈춰도 버텨요.' },
    ],
    avoid: [
      { to: GUIDE_DBS, text: 'Load Balancer는 앱 서버 앞에 둬요. DB에는 EC2가 접속해요.' },
    ],
  },
  vpce: {
    links: [
      { to: ['ec2'], text: 'EC2가 IGW나 NAT 없이 S3·DynamoDB에 가는 통로(게이트웨이 엔드포인트)예요.' },
      { to: ['s3', 'dynamodb'], text: 'VPC에서 S3·DynamoDB로 바로 이어 줘요. 게이트웨이 엔드포인트는 추가 요금이 없어서 NAT 데이터 처리 요금을 줄여요.' },
      { to: ['ecr', 'cloudwatch', 'sessionmanager'], text: '인터페이스 엔드포인트는 프라이빗 서브넷 안에 만들어져요. NAT 없이 ECR·CloudWatch 같은 AWS 서비스에 비공개로 접속해요. 두 AZ 이상에 두는 것을 권장해요.' },
    ],
    avoid: [],
  },
  clientvpn: {
    links: [
      { to: ['dbadmin'], text: '관리자 PC에서 VPN 클라이언트로 암호화된 연결을 만들어 VPC에 들어오게 해요.' },
      { to: GUIDE_DBS, text: '관리자는 VPN을 거쳐 DB에 접속해요. DB는 인터넷에 공개하지 않아요.' },
    ],
    avoid: [],
  },
  ec2: {
    links: [
      { to: ['lb'], text: '사용자 요청은 Load Balancer를 거쳐 받아요.' },
      { to: GUIDE_DBS, text: '앱이 DB(RDS)에 데이터를 읽고 써요.' },
      { to: ['elasticache'], text: '자주 읽는 데이터는 캐시에서 먼저 찾고, 없으면 DB에서 읽어 캐시에 넣어요.' },
      { to: ['nat'], text: '업데이트 등 밖으로 나가는 요청은 NAT를 거쳐요.' },
      { to: ['s3', 'vpce'], text: '파일은 S3에 저장해요. 게이트웨이 엔드포인트(VPC Endpoints)를 거치면 NAT 없이 S3에 가요.' },
    ],
    avoid: [
      { to: GUIDE_USERS, text: '사용자에게 바로 노출하지 마세요. IGW → Load Balancer를 거치게 하세요.' },
    ],
  },
  rds: {
    links: [
      { to: ['ec2'], text: '앱 서버(EC2)가 DB에 접속해 데이터를 읽고 써요. 보안 그룹으로 EC2에서 오는 접속만 허용해요.' },
      { to: ['rds-standby'], text: '다른 AZ의 예비본에 데이터를 동기식으로 복제해요(Multi-AZ). 장애가 나면 예비본으로 넘어가요.' },
      { to: ['rds-replica'], text: '변경 내용을 읽기 복제본에 비동기식으로 복사해요. 조회(읽기) 요청을 복제본으로 나눠 부담을 줄여요.' },
      { to: ['clientvpn'], text: '관리자는 VPN을 거쳐 접속해요.' },
    ],
    avoid: [
      { to: [...GUIDE_USERS, 'igw', 'cloudfront', 'dbadmin'], text: 'DB가 인터넷에서 직접 닿으면 안 돼요. EC2나 Client VPN을 거치게 하세요.' },
      { to: ['elasticache'], text: '캐시와 DB는 서로 직접 잇지 않아요. EC2가 캐시와 DB에 각각 접속해요.' },
    ],
  },
  'rds-replica': {
    links: [
      { to: ['rds'], text: '원본 DB의 변경 내용을 비동기식으로 받아요.' },
      { to: ['ec2'], text: '앱의 조회(읽기) 요청만 받아요. 쓰기는 원본 DB로 보내요.' },
    ],
    avoid: [
      { to: [...GUIDE_USERS, 'igw'], text: '복제본도 DB예요. 인터넷에서 직접 닿으면 안 돼요.' },
    ],
  },
  'rds-standby': {
    links: [
      { to: ['rds'], text: '원본과 같은 데이터를 다른 AZ에 동기식으로 유지해요. 대기만 하고 읽기 요청도 받지 않아요.' },
    ],
    avoid: [
      { to: [...GUIDE_USERS, 'igw'], text: '예비본도 DB예요. 인터넷에서 직접 닿으면 안 돼요.' },
    ],
  },
  elasticache: {
    links: [
      { to: ['ec2'], text: '앱이 캐시를 먼저 확인하고, 없으면 DB에서 읽어 캐시에 넣어요. 다음 요청은 캐시에서 빠르게 꺼내요.' },
    ],
    avoid: [
      { to: GUIDE_DBS, text: '캐시가 DB에 직접 붙어 대신 읽어 오지 않아요. 앱(EC2)이 캐시와 DB에 각각 접속해요.' },
    ],
  },
  s3: {
    links: [
      { to: ['cloudfront'], text: 'CloudFront의 원본(오리진)이 되어, 정적 파일을 사용자 가까이에서 전달하게 해요.' },
      { to: ['ec2', 'vpce'], text: '앱이 파일을 저장하고 꺼내요. 게이트웨이 엔드포인트를 거치면 NAT 없이 접속해요.' },
    ],
    avoid: [
      { to: GUIDE_USERS, text: '사용자가 S3에서 직접 받으면 먼 곳에서는 느려요. CloudFront를 거치게 하세요.' },
    ],
  },
  dynamodb: {
    links: [
      { to: ['ec2', 'vpce'], text: '앱이 키로 데이터를 빠르게 읽고 써요. 게이트웨이 엔드포인트를 거치면 NAT 없이 접속해요.' },
    ],
    avoid: [],
  },
  ecr: {
    links: [
      { to: ['ecs', 'eks', 'fargate'], text: '컨테이너 이미지를 내려받아(pull) 실행해요.' },
      { to: ['codebuild'], text: '빌드한 이미지를 여기에 올려(push) 저장해요.' },
    ],
    avoid: [],
  },
  ecs: {
    links: [
      { to: ['ecr'], text: '실행할 컨테이너 이미지를 가져와요.' },
      { to: ['lb'], text: 'Load Balancer가 서비스의 작업(task)들에 요청을 나눠 줘요.' },
      { to: ['fargate'], text: '서버를 관리하지 않고 컨테이너를 실행하려면 Fargate를 함께 써요.' },
      { to: GUIDE_DBS, text: '컨테이너의 앱이 DB에 접속해요.' },
    ],
    avoid: [],
  },
  eks: {
    links: [
      { to: ['ecr'], text: '실행할 컨테이너 이미지를 가져와요.' },
      { to: ['lb'], text: 'Load Balancer로부터 요청을 받아 Pod에 전달해요.' },
      { to: ['fargate'], text: 'Pod를 서버(노드) 관리 없이 실행하려면 Fargate를 함께 써요.' },
      { to: GUIDE_DBS, text: '컨테이너의 앱이 DB에 접속해요.' },
    ],
    avoid: [],
  },
  fargate: {
    links: [
      { to: ['ecs', 'eks'], text: 'ECS 작업이나 EKS Pod를 EC2를 관리하지 않고 실행해 줘요.' },
      { to: ['ecr'], text: '실행할 컨테이너 이미지를 가져와요.' },
    ],
    avoid: [],
  },
  codecommit: {
    links: [
      { to: ['codepipeline'], text: '코드가 바뀌면 파이프라인이 시작돼요.' },
      { to: ['codebuild'], text: '빌드 단계에 소스 코드를 넘겨요.' },
    ],
    avoid: [],
  },
  codebuild: {
    links: [
      { to: ['codecommit'], text: '소스 코드를 가져와 컴파일하고 테스트해요.' },
      { to: ['ecr'], text: '만든 컨테이너 이미지를 ECR에 저장해요.' },
      { to: ['codepipeline'], text: '파이프라인의 빌드·테스트 단계를 맡아요.' },
    ],
    avoid: [],
  },
  codepipeline: {
    links: [
      { to: ['codecommit', 'codebuild', 'codedeploy'], text: '소스 → 빌드 → 배포 단계를 정해 두면, 코드가 바뀔 때마다 차례로 자동 실행해요.' },
    ],
    avoid: [],
  },
  codedeploy: {
    links: [
      { to: ['ec2'], text: '만든 앱을 EC2에 자동으로 배포해요. 문제가 생기면 멈추고 되돌릴 수 있어요.' },
      { to: ['codepipeline'], text: '파이프라인의 배포 단계를 맡아요.' },
    ],
    avoid: [],
  },
  sessionmanager: {
    links: [
      { to: ['ec2'], text: '인바운드 포트를 열지 않고, 브라우저나 CLI로 서버에 접속해요.' },
      { to: ['dbadmin'], text: '관리자가 서버에 접속할 때 써요. 누가 접속할 수 있는지는 IAM 정책으로 정해요.' },
    ],
    avoid: [],
  },
  waf: {
    links: [
      { to: ['cloudfront', 'lb'], text: 'CloudFront나 Load Balancer(ALB)에 붙여 써요. 들어오는 요청을 규칙(IP, 요청 내용 등)으로 검사해서 허용하거나 막아요.' },
    ],
    avoid: [
      { to: ['ec2', ...GUIDE_DBS], text: 'WAF는 서버나 DB에 직접 붙이지 않아요. 앞단의 CloudFront나 Load Balancer에 붙이세요.' },
    ],
  },
  cloudwatch: {
    links: [
      { to: ['ec2', 'lb', ...GUIDE_DBS], text: '서버·Load Balancer·DB의 지표를 모아 지켜보고, 정해 둔 기준을 넘으면 경보로 알려 줘요.' },
    ],
    avoid: [],
  },
  cloudtrail: { links: [], avoid: [], note: '연결선 없이 계정 안의 작업(API 호출)을 기록해요. 최근 90일 기록은 기본으로 볼 수 있어요. VPC 밖에 두기만 하면 돼요.' },
  iam: { links: [], avoid: [], note: '연결선 없이 누가 어떤 AWS 리소스를 쓸 수 있는지 권한을 관리해요. VPC 밖에 두기만 하면 돼요.' },
  cloudformation: { links: [], avoid: [], note: '연결선 없이 템플릿으로 전체 리소스를 한 번에 만들고(스택), 한 번에 지울 수도 있어요. VPC 밖에 두기만 하면 돼요.' },
};
