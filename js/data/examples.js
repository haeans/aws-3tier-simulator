// @ts-check
// js/data/examples.js — 예시 구성 ([불러오기 ▾] 메뉴)

/* ---------------------------------------------------------
   예시 구성 데이터
   - 좌표: 기본 틀 VPC 왼쪽 위 기준 상대 좌표 (박스 중심). VPC 0~1000 × 0~660
     AZ A: x 40~480 (서브넷 60~460), AZ B: x 520~960 (서브넷 540~940)
     퍼블릭 y 120~260, 프라이빗 280~420, DB 440~580. VPC 밖은 음수나 1000 넘는 값
   - nodes: [키, 종류, x, y] / edges: [키, 키] / asg: Auto Scaling 그룹 영역 { x, y, width, height } (상대 좌표)
   - 판정·제안 결과는 tests/validation.spec.js의 예시 테스트가 지킨다 (기본: 정상, 고가용성: 정상·제안 0개)
   --------------------------------------------------------- */

// 기본 3-Tier: 판정 "정상"이 나오는 최소 구성 (제안은 여러 개 남음 → 고가용성과 비교해 보기)
const EXAMPLE_BASIC = {
  nodes: [
    // IGW는 VPC 위쪽 테두리(LB·NAT 사이 위), 사용자는 그 바로 위 → 선이 겹치지 않고 곧게 이어짐
    ['pc', 'pc', 260, -150], ['igw', 'igw', 260, 0], ['lb', 'lb', 140, 190], ['nat', 'nat', 380, 190],
    ['ec2a', 'ec2', 140, 350], ['ec2b', 'ec2', 600, 350], ['rds', 'rds', 140, 510], ['sb', 'rds-standby', 600, 510],
  ],
  edges: [
    ['pc', 'igw'], ['igw', 'lb'], ['lb', 'ec2a'], ['lb', 'ec2b'], ['ec2a', 'rds'], ['ec2b', 'rds'], ['rds', 'sb'],
    ['ec2a', 'nat'], ['ec2b', 'nat'], ['nat', 'igw'],   // 서버가 밖으로 나가는 길: EC2 → NAT → IGW (실제 AWS는 라우팅 테이블로 연결)
  ],
};

// 고가용성: 판정 "정상", 제안 0개인 모범 구성 (Auto Scaling, AZ마다 NAT, CloudFront·WAF, 캐시, 운영 도구)
const EXAMPLE_HA = {
  nodes: [
    ['pc', 'pc', -180, -130], ['r53', 'route53', -180, 40],
    ['cf', 'cloudfront', 260, -130], ['waf', 'waf', 460, -130], ['igw', 'igw', 260, 0],
    ['waf2', 'waf', -180, 190],
    ['lb', 'lb', 140, 190], ['nat', 'nat', 380, 190], ['natb', 'nat', 760, 190],
    ['ec2a', 'ec2', 140, 350], ['ec2b', 'ec2', 760, 350],
    ['rds', 'rds', 140, 510], ['cache', 'elasticache', 380, 510], ['sb', 'rds-standby', 760, 510],
    ['ssm', 'sessionmanager', 1180, 350], ['cw', 'cloudwatch', 1180, 510], ['trail', 'cloudtrail', 1180, 640],
  ],
  edges: [
    ['pc', 'r53'], ['pc', 'cf'], ['waf', 'cf'], ['cf', 'igw'], ['igw', 'lb'], ['waf2', 'lb'],
    ['lb', 'ec2a'], ['lb', 'ec2b'], ['ec2a', 'nat'], ['ec2b', 'natb'], ['nat', 'igw'], ['natb', 'igw'],
    ['ec2a', 'rds'], ['ec2b', 'rds'], ['rds', 'sb'], ['ec2a', 'cache'], ['ec2b', 'cache'],
    ['ec2a', 'ssm'], ['ec2b', 'ssm'], ['trail', 'cw'],
  ],
  asg: { x: 40, y: 280, width: 900, height: 140 },
};

// "고쳐 보세요": 기본 3-Tier에 흔한 실수 2개를 랜덤으로 넣는다.
// rule: 그 실수를 잡는 판정 근거(criteria ID). 테스트는 실수마다 판정 문제(오류·경고)가 새로 생기는지 확인한다
// edges: 더할 연결 / move: 박스를 옮길 자리
const EXAMPLE_MISTAKES = [
  { key: 'igw-ec2',     rule: 'IGW-02', edges: [['igw', 'ec2a']] },              // 서버가 인터넷에 바로 노출 (오류)
  { key: 'ec2-standby', rule: 'DB-02',  edges: [['ec2b', 'sb']] },               // 앱이 예비 DB에 접속 (오류)
  { key: 'user-ec2',    rule: 'IGW-03', edges: [['pc', 'ec2a']] },               // 사용자가 서버에 바로 접속 (경고)
  { key: 'db-public',   rule: 'DB-05',  move: { rds: [820, 190] } },             // DB를 퍼블릭 서브넷에 (경고)
  { key: 'ec2-public',  rule: 'SRV-08', move: { ec2b: [600, 190] } },            // 서버를 퍼블릭 서브넷에 (경고)
];
const EXAMPLE_MISTAKE_COUNT = 2;

// 메뉴 순서대로. template은 빈 기본 틀
const EXAMPLES = [
  { key: 'template', name: '기본 틀', desc: '빈 VPC·가용 영역·서브넷만 만들어요' },
  { key: 'basic', name: '예시: 기본 3-Tier', desc: '"정상"이 나오는 가장 단순한 구성이에요',
    toast: '예시 "기본 3-Tier"를 불러왔어요. [검증하기]를 눌러 결과와 제안을 확인해 보세요.' },
  { key: 'ha', name: '예시: 고가용성', desc: '제안이 하나도 없는 모범 구성이에요',
    toast: '예시 "고가용성"을 불러왔어요. [성능 시뮬레이션]에서 장애를 넣어 버티는지 확인해 보세요.' },
  { key: 'fix', name: '예시: 고쳐 보세요', desc: '흔한 실수 2개가 숨어 있어요 (매번 달라져요)',
    toast: '문제 2개가 숨어 있어요. [검증하기]로 찾아서 고쳐 보세요.' },
];
