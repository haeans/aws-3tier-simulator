// @ts-check
// js/data/examples.js — 예시 구성 ([불러오기 ▾] 메뉴)

/* ---------------------------------------------------------
   예시 구성 데이터
   - 좌표: 기본 틀 VPC 왼쪽 위 기준 상대 좌표 (박스 중심). VPC 0~1000 × 0~660
     AZ A: x 40~480 (서브넷 60~460), AZ B: x 520~960 (서브넷 540~940)
     퍼블릭 y 120~260, 프라이빗 280~420, DB 440~580. VPC 밖은 음수나 1000 넘는 값
   - nodes: [키, 종류, x, y] / edges: [키, 키, 선 종류(없으면 자동)] / asg: Auto Scaling 그룹 영역 { x, y, width, height } (상대 좌표)
   - areas: 더할 영역 [종류, x, y, 너비, 높이] (48번: IDC) / noVpc: true면 기본 틀(VPC) 없이 그 영역만 (옮기기 전 구성)
   - 판정·제안 결과는 tests/validation.spec.js의 예시 테스트가 지킨다 (기본·컨테이너: 정상, 고가용성: 정상·제안 0개)
   --------------------------------------------------------- */

// 기본 3-Tier: 판정 "정상"이 나오는 최소 구성 (제안은 여러 개 남음 → 고가용성과 비교해 보기)
const EXAMPLE_BASIC = {
  nodes: [
    // LB는 두 AZ의 퍼블릭 서브넷 사이(서브넷 밖), IGW·사용자는 그 바로 위 → 선이 겹치지 않고 곧게 이어짐
    ['pc', 'pc', 500, -150], ['igw', 'igw', 500, 0], ['lb', 'lb', 500, 190], ['nat', 'nat', 120, 190],
    ['ec2a', 'ec2', 260, 350], ['ec2b', 'ec2', 740, 350], ['rds', 'rds', 260, 510], ['sb', 'rds-standby', 740, 510],
  ],
  edges: [
    ['pc', 'igw'], ['igw', 'lb'], ['lb', 'ec2a'], ['lb', 'ec2b'], ['ec2a', 'rds'], ['ec2b', 'rds'], ['rds', 'sb'],
    ['ec2a', 'nat'], ['ec2b', 'nat'], ['nat', 'igw'],   // 서버가 밖으로 나가는 길: EC2 → NAT → IGW (실제 AWS는 라우팅 테이블로 연결)
  ],
};

// 고가용성: 판정 "정상", 제안 0개인 모범 구성 (Auto Scaling, AZ마다 NAT, CloudFront·WAF, AZ마다 캐시, 운영 도구)
const EXAMPLE_HA = {
  nodes: [
    ['pc', 'pc', -180, -130], ['r53', 'route53', -180, 40],
    ['cf', 'cloudfront', 500, -130], ['waf', 'waf', 700, -130], ['igw', 'igw', 500, 0],
    ['waf2', 'waf', 700, -40],
    ['lb', 'lb', 500, 190], ['nat', 'nat', 120, 190], ['natb', 'nat', 880, 190],
    ['ec2a', 'ec2', 260, 350], ['ec2b', 'ec2', 740, 350],
    ['rds', 'rds', 180, 510], ['cache', 'elasticache', 360, 510], ['sb', 'rds-standby', 740, 510], ['cacheb', 'elasticache', 900, 510],
    ['ssm', 'sessionmanager', 1180, 350], ['cw', 'cloudwatch', 1180, 510], ['trail', 'cloudtrail', 1180, 640],
  ],
  edges: [
    ['pc', 'r53'], ['pc', 'cf'], ['waf', 'cf'], ['cf', 'igw'], ['igw', 'lb'], ['waf2', 'lb'],
    ['lb', 'ec2a'], ['lb', 'ec2b'], ['ec2a', 'nat'], ['ec2b', 'natb'], ['nat', 'igw'], ['natb', 'igw'],
    ['ec2a', 'rds'], ['ec2b', 'rds'], ['rds', 'sb'], ['ec2a', 'cache'], ['ec2b', 'cache'], ['ec2a', 'cacheb'], ['ec2b', 'cacheb'],   // 캐시는 두 AZ에 (한 AZ 장애 때 다른 쪽이 이어받음, 제안 18)
    ['ec2a', 'ssm'], ['ec2b', 'ssm'], ['trail', 'cw'],
  ],
  asg: { x: 40, y: 280, width: 900, height: 140 },
};

// 컨테이너 (ECS + Fargate): 기본 3-Tier의 EC2 자리에 Fargate, NAT 자리에 VPC Endpoints → ECR (41번)
// 판정 "정상", 제안은 기본 3-Tier와 같은 것이 남는다. 근거: criteria/container.md CTR-01·02·04·05
const EXAMPLE_CONTAINER = {
  nodes: [
    ['pc', 'pc', 500, -150], ['igw', 'igw', 500, 0], ['lb', 'lb', 500, 190],
    // ECS(서비스)는 하나, 실제로 요청을 처리하는 Fargate 작업은 두 AZ에 (CTR-04: Fargate는 ECS와 함께 쓴다)
    ['ecs', 'ecs', 140, 350], ['fga', 'fargate', 320, 350], ['fgb', 'fargate', 740, 350],
    ['rds', 'rds', 260, 510], ['sb', 'rds-standby', 740, 510],
    // 이미지 받는 길: NAT 없이 VPC Endpoints로 (CTR-02). VPC Endpoints는 VPC 왼쪽 경계, ECR은 VPC 밖
    // y 270 = 퍼블릭과 프라이빗 서브넷 사이 → Fargate에서 오는 초록 선이 서브넷 이름표를 가리지 않음
    ['vpce', 'vpce', 0, 270], ['ecr', 'ecr', -180, 270],
  ],
  edges: [
    ['pc', 'igw'], ['igw', 'lb'], ['lb', 'fga'], ['lb', 'fgb'], ['fga', 'rds'], ['fgb', 'rds'], ['rds', 'sb'],
    ['ecs', 'fga'], ['ecs', 'fgb'],                       // 실행 방식 (설정 관계 선)
    ['fga', 'ecr'], ['fgb', 'ecr'], ['vpce', 'ecr'],      // 이미지 받기: Fargate → ECR, 그 길은 VPC Endpoints
  ],
};

// 옮기기 전: 온프레미스 3-Tier (48번). VPC 없이 IDC 안에 서버·DB. 판정은 "옮기기 전 구성"(사용자 → 서버 → DB 흐름)
const EXAMPLE_ONPREM = {
  noVpc: true,
  areas: [['idc', 300, 80, 400, 420]],
  nodes: [['pc', 'pc', 500, -100], ['srv', 'onprem-server', 500, 200], ['db', 'onprem-db', 500, 390]],
  edges: [['pc', 'srv'], ['srv', 'db']],
};
// 하이브리드: AWS 서버 + IDC DB (48번). 서버는 AWS로 옮기고 DB는 아직 IDC에. Direct Connect(주 회선) + VPN(백업)으로 이중화
// 근거: criteria/hybrid.md HY-01·02(고객 게이트웨이 — VGW), HY-07·09(이중화)
const EXAMPLE_HYBRID = {
  areas: [['idc', 1160, 160, 420, 340]],
  nodes: [
    ...EXAMPLE_BASIC.nodes.filter(([k]) => !['rds', 'sb'].includes(String(k))),
    ['vgw', 'vgw', 1000, 330], ['cgw', 'cgw', 1240, 330], ['idb', 'onprem-db', 1460, 330],
  ],
  edges: [
    ...EXAMPLE_BASIC.edges.filter(([a, b]) => ![a, b].some(k => ['rds', 'sb'].includes(String(k)))),
    ['ec2a', 'vgw'], ['ec2b', 'vgw'], ['vgw', 'cgw', 'dx'], ['vgw', 'cgw', 'vpn'], ['cgw', 'idb'],
  ],
};

// 예시 key → 구성 데이터 ("고쳐 보세요"는 기본 3-Tier에 실수를 더해 쓴다)
const EXAMPLE_SPECS = { basic: EXAMPLE_BASIC, ha: EXAMPLE_HA, container: EXAMPLE_CONTAINER, fix: EXAMPLE_BASIC, onprem: EXAMPLE_ONPREM, hybrid: EXAMPLE_HYBRID };

// "고쳐 보세요": 기본 3-Tier에 흔한 실수 2개를 랜덤으로 넣는다.
// rule: 그 실수를 잡는 판정 근거(criteria ID). 테스트는 실수마다 판정 문제(오류·경고)가 새로 생기는지 확인한다
// edges: 더할 연결 / move: 박스를 옮길 자리
const EXAMPLE_MISTAKES = [
  { key: 'igw-ec2',     rule: 'IGW-02', edges: [['igw', 'ec2a']] },              // 서버가 인터넷에 바로 노출 (오류)
  { key: 'ec2-standby', rule: 'DB-02',  edges: [['ec2b', 'sb']] },               // 앱이 예비 DB에 접속 (오류)
  { key: 'user-ec2',    rule: 'IGW-03', edges: [['pc', 'ec2a']] },               // 사용자가 서버에 바로 접속 (경고)
  { key: 'db-public',   rule: 'DB-05',  move: { rds: [820, 190] } },             // DB를 퍼블릭 서브넷에 (경고)
  { key: 'ec2-public',  rule: 'SRV-08', move: { ec2b: [740, 190] } },            // 서버를 퍼블릭 서브넷에 (경고)
];
const EXAMPLE_MISTAKE_COUNT = 2;

// 메뉴 순서대로. template은 빈 기본 틀
const EXAMPLES = [
  { key: 'template', name: '기본 틀', desc: '빈 VPC·가용 영역·서브넷만 만들어요' },
  { key: 'basic', name: '예시: 기본 3-Tier', desc: '"정상"이 나오는 가장 단순한 구성이에요',
    toast: '예시 "기본 3-Tier"를 불러왔어요. [검증하기]를 눌러 결과와 제안을 확인해 보세요.' },
  { key: 'ha', name: '예시: 고가용성', desc: '제안이 하나도 없는 모범 구성이에요',
    toast: '예시 "고가용성"을 불러왔어요. [성능 시뮬레이션]에서 장애를 넣어 버티는지 확인해 보세요.' },
  { key: 'container', name: '예시: 컨테이너 (ECS + Fargate)', desc: 'EC2 대신 컨테이너로 만든 3-Tier예요',
    toast: '예시 "컨테이너"를 불러왔어요. [검증하기] 뒤 [서버 통신] 보기에서 이미지를 받는 길을 확인해 보세요.' },
  { key: 'onprem', name: '예시: 옮기기 전 (온프레미스)', desc: 'AWS로 옮기기 전, 회사 데이터센터(IDC)의 3-Tier예요',
    toast: '예시 "옮기기 전 (온프레미스)"를 불러왔어요. [비교] 탭에 담아 두고 AWS 구성과 비교해 보세요.' },
  { key: 'hybrid', name: '예시: 하이브리드 (AWS 서버 + IDC DB)', desc: '서버는 AWS로 옮기고 DB는 아직 IDC에 있어요',
    toast: '예시 "하이브리드"를 불러왔어요. 고객 게이트웨이—VGW 선 두 줄(Direct Connect + VPN 백업)을 눌러 보세요.' },
  { key: 'fix', name: '예시: 고쳐 보세요', desc: '흔한 실수 2개가 숨어 있어요 (매번 달라져요)',
    toast: '문제 2개가 숨어 있어요. [검증하기]로 찾아서 고쳐 보세요.' },
];
