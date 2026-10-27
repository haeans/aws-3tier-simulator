// @ts-check
// js/data/services.js — 서비스·영역 데이터 (카테고리, 서비스 목록, 영역 목록, 설명 문구)

/* =========================================================
   서비스 데이터 정의
   ========================================================= */
const GRID = 20;          // 격자 간격(px)
const NODE_W = 100;       // 서비스 박스 너비
const NODE_H = 60;        // 서비스 박스 높이

// 카테고리: 테두리색(color) / 배경색(bg) / 글자색(fg)
const CATEGORIES = [
  { key: 'user',      label: '사용자',          color: '#5a6b7d', bg: '#f1f4f7', fg: '#2f3b48' },
  { key: 'network',   label: '네트워크',        color: '#8c4fff', bg: '#f4eeff', fg: '#5a2db5' },
  { key: 'compute',   label: '컴퓨팅',          color: '#ed7100', bg: '#fff3e6', fg: '#a34e00' },
  { key: 'container', label: '컨테이너/도커',   color: '#c98a00', bg: '#fff8e1', fg: '#7a5300' },
  { key: 'data',      label: '데이터',          color: '#2e73b8', bg: '#eaf2fb', fg: '#1d4f82' },
  { key: 'cicd',      label: 'CI/CD',           color: '#2e9e47', bg: '#ebf7ee', fg: '#1d6b30' },
  { key: 'ops',       label: '접근/운영',       color: '#d13212', bg: '#fdecea', fg: '#9b2410' },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

// 서비스 목록 (여기에 항목을 추가하면 팔레트에 자동 반영)
// allowedZone: 'outside' | 'vpcEdge' | 'endpoint' | 'private' | 'db' | 'any'
// validated: true = 검증 대상 / false = 배치·연결만 가능
const SERVICES = [
  // 사용자
  { type: 'smartphone',     name: '스마트폰',         category: 'user',      allowedZone: 'outside', validated: true  },
  { type: 'tablet',         name: '태블릿',           category: 'user',      allowedZone: 'outside', validated: true  },
  { type: 'pc',             name: 'PC',               category: 'user',      allowedZone: 'outside', validated: true  },
  { type: 'dbadmin',        name: 'DB 관리자',        category: 'user',      allowedZone: 'outside', validated: true  },
  // 네트워크
  { type: 'route53',        name: 'Route 53',         category: 'network',   allowedZone: 'outside', validated: false },
  { type: 'cloudfront',     name: 'CloudFront',       category: 'network',   allowedZone: 'outside', validated: true  },
  { type: 'igw',            name: 'IGW',              category: 'network',   allowedZone: 'any',     validated: true  },
  { type: 'nat',            name: 'NAT',              category: 'network',   allowedZone: 'any',     validated: true  },
  { type: 'lb',             name: 'Load Balancer',    category: 'network',   allowedZone: 'any',     validated: true  },
  { type: 'vpce',           name: 'VPC Endpoints',    category: 'network',   allowedZone: 'endpoint', validated: false },
  { type: 'clientvpn',      name: 'Client VPN',       category: 'network',   allowedZone: 'vpcEdge', validated: true  },
  // 컴퓨팅
  { type: 'ec2',            name: 'EC2',              category: 'compute',   allowedZone: 'any',     validated: true  },
  // 컨테이너/도커
  { type: 'ecr',            name: 'ECR',              category: 'container', allowedZone: 'outside', validated: false },
  { type: 'ecs',            name: 'ECS',              category: 'container', allowedZone: 'private', validated: false },
  { type: 'eks',            name: 'EKS',              category: 'container', allowedZone: 'private', validated: false },
  { type: 'fargate',        name: 'Fargate',          category: 'container', allowedZone: 'private', validated: false },
  // 데이터
  { type: 's3',             name: 'S3',               category: 'data',      allowedZone: 'outside', validated: false },
  { type: 'dynamodb',       name: 'DynamoDB',         category: 'data',      allowedZone: 'outside', validated: false },
  { type: 'rds',            name: 'RDS',              category: 'data',      allowedZone: 'any',     validated: true  },
  { type: 'rds-replica',    name: 'RDS Read Replica', category: 'data',      allowedZone: 'any',     validated: true  },
  { type: 'rds-standby',    name: 'RDS Standby',      category: 'data',      allowedZone: 'any',     validated: true  },
  { type: 'elasticache',    name: 'ElastiCache',      category: 'data',      allowedZone: 'dataSubnet', validated: false },
  // CI/CD
  { type: 'codecommit',     name: 'CodeCommit',       category: 'cicd',      allowedZone: 'outside', validated: false },
  { type: 'codebuild',      name: 'CodeBuild',        category: 'cicd',      allowedZone: 'outside', validated: false },
  { type: 'codepipeline',   name: 'CodePipeline',     category: 'cicd',      allowedZone: 'outside', validated: false },
  { type: 'codedeploy',     name: 'CodeDeploy',       category: 'cicd',      allowedZone: 'outside', validated: false },
  // 접근/운영
  { type: 'waf',            name: 'WAF',              category: 'ops',       allowedZone: 'outside', validated: false },
  { type: 'sessionmanager', name: 'Session Manager',  category: 'ops',       allowedZone: 'outside', validated: false },
  { type: 'cloudtrail',     name: 'CloudTrail',       category: 'ops',       allowedZone: 'outside', validated: false },
  { type: 'iam',            name: 'IAM',              category: 'ops',       allowedZone: 'outside', validated: false },
  { type: 'cloudwatch',     name: 'CloudWatch',       category: 'ops',       allowedZone: 'outside', validated: false },
  { type: 'cloudformation', name: 'CloudFormation',   category: 'ops',       allowedZone: 'outside', validated: false },
];
// 서비스별 색상은 카테고리 색을 그대로 사용
SERVICES.forEach(s => { s.color = CAT_MAP[s.category].color; });

// 서비스 설명 (툴팁에 표시)
const SERVICE_DESC = {
  smartphone:     '서비스를 이용하는 사용자예요. 인터넷을 통해 들어와요.',
  tablet:         '서비스를 이용하는 사용자예요. 인터넷을 통해 들어와요.',
  pc:             '서비스를 이용하는 사용자예요. 인터넷을 통해 들어와요.',
  dbadmin:        'DB를 관리하는 사람이에요. DB를 인터넷에 공개하지 않고, Client VPN 같은 비공개 연결로 접속해요.',
  route53:        '도메인 이름(example.com)을 서버 주소로 바꿔 사용자를 웹 서비스로 안내하는 DNS 서비스예요. 상태 확인으로 정상인 곳으로만 보낼 수 있어요.',
  cloudfront:     '콘텐츠를 사용자와 가까운 엣지 로케이션에서 전달하는 CDN이에요. 캐시에 없으면 원본(S3, 웹 서버 등)에서 가져와요.',
  igw:            'VPC와 인터넷 사이의 통신을 가능하게 하는 출입문이에요. IGW로 가는 경로가 있는 서브넷이 퍼블릭 서브넷이에요.',
  nat:            '프라이빗 서브넷의 서버가 VPC 밖으로 연결할 수 있게 해줘요. 밖에서 먼저 연결을 시작할 수는 없어요.',
  lb:             '들어온 요청을 여러 AZ의 대상(EC2 등)에 나눠줘요. 상태 확인을 해서 정상인 대상에만 보내요.',
  vpce:           'IGW나 NAT 없이 VPC에서 AWS 서비스에 비공개로 접속하게 해줘요. S3·DynamoDB는 게이트웨이 엔드포인트(VPC 경계), 그 밖의 서비스는 인터페이스 엔드포인트(프라이빗 서브넷 안)를 써요.',
  clientvpn:      '관리형 VPN 서비스예요. 관리자 PC에서 암호화된 연결로 VPC 안의 리소스에 접속하게 해줘요.',
  ec2:            'AWS 클라우드의 가상 서버예요. 필요한 만큼 늘리고 줄일 수 있고, 3-Tier에서 앱(로직) 계층을 맡아요.',
  ecr:            '컨테이너 이미지(Docker 등)를 보관하고 관리하는 AWS 관리형 저장소(레지스트리)예요.',
  ecs:            '컨테이너 앱을 배포하고 실행·확장하는 AWS 완전관리형 서비스예요.',
  eks:            'Kubernetes로 컨테이너를 실행하는 관리형 서비스예요. Kubernetes의 컨트롤 플레인은 AWS가 관리해요.',
  fargate:        '서버(EC2)를 직접 준비하거나 관리하지 않고 컨테이너를 실행하는 서버리스 방식이에요. ECS·EKS에서 써요.',
  s3:             '파일을 객체로 버킷에 저장하는 저장소예요. 원하는 만큼 저장할 수 있고, 기본은 비공개예요.',
  dynamodb:       '서버 관리가 필요 없는 완전관리형 NoSQL 데이터베이스예요. 키-값과 문서 형태로 데이터를 빠르게 읽고 써요.',
  rds:            '관계형 데이터베이스(MySQL, PostgreSQL 등)를 쉽게 운영하게 해주는 관리형 서비스예요. 백업·패치를 AWS가 맡아요.',
  'rds-replica':  'RDS의 읽기 전용 복사본이에요. 원본의 변경을 비동기식으로 받아, 조회가 많을 때 부담을 나눠 가져요.',
  'rds-standby':  'Multi-AZ에서 다른 AZ에 두는 RDS 예비본이에요. 동기식으로 복제되고, 장애가 나면 예비본으로 넘어가요. 읽기 요청은 받지 않아요.',
  elasticache:    '자주 쓰는 데이터를 메모리에 두고 빠르게 꺼내 쓰는 캐시예요. Valkey, Memcached, Redis OSS를 지원해요.',
  codecommit:     '비공개 Git 저장소를 제공하는 관리형 소스 코드 저장소예요.',
  codebuild:      '소스 코드를 컴파일하고 테스트를 실행해서, 배포할 결과물을 만들어 줘요. 빌드 서버를 직접 관리하지 않아도 돼요.',
  codepipeline:   '소프트웨어를 내보내는 단계(소스→빌드→배포)를 정해 두고 자동으로 이어 실행해줘요.',
  codedeploy:     '앱을 EC2, 온프레미스 서버, Lambda, ECS에 자동으로 배포해요.',
  waf:            '웹 방화벽이에요. CloudFront나 Load Balancer(ALB)로 들어오는 HTTP(S) 요청을 규칙에 따라 검사해서, 위험한 요청은 막아요.',
  sessionmanager: '인바운드 포트를 열거나 Bastion 서버·SSH 키를 관리하지 않고, 브라우저나 CLI로 서버에 접속하게 해줘요.',
  cloudtrail:     '사용자·역할·AWS 서비스가 한 작업을 이벤트로 기록해요. 누가 언제 무엇을 했는지 확인할 수 있어요.',
  iam:            '누가 로그인할 수 있고(인증) 어떤 AWS 리소스를 쓸 수 있는지(권한) 관리해요.',
  cloudwatch:     'AWS 리소스와 앱의 지표·로그를 모아 지켜보고, 기준을 넘으면 경보로 알려줘요.',
  cloudformation: '템플릿에 필요한 AWS 리소스를 적으면, 그대로 만들고 설정해줘요. 스택 단위로 한 번에 관리해요.',
};
SERVICES.forEach(s => { s.desc = SERVICE_DESC[s.type] || ''; });

// 위치 제한 없는(any) 서비스 중 검증 규칙상 권장 위치
const RECOMMENDED_ZONE = {
  igw: 'VPC 경계선', nat: '퍼블릭 서브넷', lb: '퍼블릭 서브넷', ec2: '프라이빗 서브넷',
  rds: 'DB 서브넷', 'rds-replica': 'DB 서브넷', 'rds-standby': 'DB 서브넷', elasticache: 'DB 서브넷',
};
// allowedZone을 쉬운 말로
const ZONE_TEXT = {
  outside: 'VPC 밖',
  vpcEdge: 'VPC 안팎 모두 가능 (서브넷 안은 불가)',
  endpoint: 'VPC 경계·VPC 안, 또는 프라이빗 서브넷 안',
  private: '프라이빗 서브넷만',
  db:      'DB 서브넷만',
  dataSubnet: 'DB 서브넷 또는 프라이빗 서브넷',
  any:     '위치 제한 없음',
};
const SVC_MAP = Object.fromEntries(SERVICES.map(s => [s.type, s]));

// 영역 목록: 기본 크기(w,h) / 최소 크기(minW,minH) / 중첩 깊이(rank: 0=VPC, 1=AZ, 2=서브넷, 3=그룹)
// overlay: 덧씌우는 영역. AZ 경계를 가로질러 놓을 수 있고, 다른 항목의 소속(parentContainer)에는 끼지 않는다.
const AREAS = [
  { type: 'vpc',     name: 'VPC',             w: 560, h: 400, minW: 200, minH: 140, rank: 0 },
  { type: 'az',      name: 'AZ (가용 영역)',  w: 260, h: 340, minW: 160, minH: 120, rank: 1 },
  { type: 'public',  name: '퍼블릭 서브넷',   w: 220, h: 120, minW: 120, minH: 80,  rank: 2 },
  { type: 'private', name: '프라이빗 서브넷', w: 220, h: 120, minW: 120, minH: 80,  rank: 2 },
  { type: 'db',      name: 'DB 서브넷',       w: 220, h: 120, minW: 120, minH: 80,  rank: 2 },
  { type: 'asg',     name: 'Auto Scaling 그룹', w: 480, h: 160, minW: 160, minH: 100, rank: 3, overlay: true },
];
const AREA_MAP = Object.fromEntries(AREAS.map(a => [a.type, a]));

// 영역 설명과 놓는 곳 (툴팁에 표시)
const AREA_DESC = {
  vpc:     { desc: 'AWS 안에 직접 만드는, 논리적으로 격리된 가상 네트워크예요.', zone: '다른 영역 바깥' },
  az:      { desc: '리전 안에서 서로 떨어진 독립된 위치(가용 영역)예요. 여러 AZ에 나눠 두면 한 AZ에 장애가 나도 버틸 수 있어요. 서브넷은 한 AZ 안에만 만들어요.', zone: 'VPC 안' },
  public:  { desc: 'IGW로 가는 경로가 있는 서브넷이에요. 인터넷과 통신할 수 있어서 Load Balancer와 NAT를 둬요.', zone: 'AZ 안' },
  private: { desc: 'IGW로 가는 경로가 없는 서브넷이에요. 인터넷에서 직접 들어올 수 없어서 앱 서버(EC2)를 둬요.', zone: 'AZ 안' },
  db:      { desc: '데이터베이스를 두는 프라이빗 서브넷이에요. 앱 서버와 다른 서브넷으로 나눠 보호해요. RDS는 두 AZ 이상의 서브넷이 필요해요.', zone: 'AZ 안' },
  asg:     { desc: 'EC2를 한 그룹으로 묶어 정한 수를 유지하고, 사용량에 따라 자동으로 늘리고 줄여요. 문제가 생긴 EC2는 새 EC2로 바꿔요. 두 AZ의 프라이빗 서브넷에 걸쳐 놓고 그 안에 EC2를 두세요.',
             zone: 'VPC 안 (AZ 경계를 넘어 걸쳐 놓을 수 있어요)' },
};
const SUBNET_TYPES = ['public', 'private', 'db'];

