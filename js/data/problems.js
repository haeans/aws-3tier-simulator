// @ts-check
// js/data/problems.js — 면접식 설계 문제 (학습 패널 [문제] 탭, 43번)

/* ---------------------------------------------------------
   문제 데이터
   - 실제 면접처럼 상황과 요구 사항만 주고, 사용자가 기본 틀(VPC·AZ·서브넷)에서 직접 설계한다.
     힌트·채점 방법은 보여 주지 않고 [제출]할 때 한 번에 채점한다 (채점: js/rules/problems.js의 gradeProblem)
   - level: 'easy' | 'normal' | 'hard' (PROBLEM_LEVELS)
   - story: 상황 설명 / answer: 모범 답안 구성 (js/data/examples.js와 같은 형식: VPC 기준 상대 좌표)
   - answerNote: 모범 답안을 불러온 뒤 보여 줄 설계 이유 한 줄
   - reqs: 요구 사항. { text, roles: [{ name 역할, why 이유, has(ctx, s) 내 설계에 있는지 }] }
       모든 역할이 있으면 충족. 못 채우면 없는 역할을 "모범 답안에는 있어요 + 이유"로 보여 준다.
       역할은 서비스 이름이 아니라 하는 일로 판단한다 (예: 앱 서버는 EC2든 컨테이너든 같다. 정답이 여러 개일 수 있어서)
       has는 기존 판정·제안 규칙이 보는 조건과 같게 둔다. 판정과 어긋나는 요구는 만들지 않는다
   - 모든 문제에 기본 요구 "검증 결과가 정상"(PROBLEM_BASE_REQ)이 맨 앞에 붙는다
   - 확장 자리: 트래픽·응답 시간 같은 숫자 요구는 has(ctx, s)에서 simulateTraffic(rps, null, 0, s)를 불러 판단하면 된다
     (지금은 구성으로 판단하는 요구만. 2026-11-13 사용자 결정)
   --------------------------------------------------------- */
const PROBLEM_LEVELS = { easy: '쉬움', normal: '보통', hard: '어려움' };

// 역할 모음 (여러 문제가 함께 씀). has는 채점할 때(실행 시점)만 불린다. 조회 도구(problem…·mission…)는 js/rules/
const PROBLEM_ROLES = {
  entryUser: { name: '사용자 — IGW 연결', why: '인터넷의 요청은 IGW라는 문을 지나 VPC로 들어와요.',
    has: ctx => missionLinked(ctx, USER_TYPES, ['igw']) || problemViaCdn(ctx) },
  entryLb: { name: 'IGW — Load Balancer 연결', why: '인터넷 요청은 Load Balancer라는 한 입구로만 받고, 서버는 그 뒤에 숨겨요.',
    has: ctx => missionLinked(ctx, ['igw'], ['lb']) },
  appPrivate: { name: '프라이빗 서브넷의 앱 서버', why: '서버를 프라이빗 서브넷에 두면 인터넷에서 바로 들어올 수 없어요.',
    has: ctx => problemApps(ctx).length > 0 },
  dbSubnet: { name: 'DB 서브넷의 RDS', why: 'DB는 가장 안쪽(DB 서브넷)에 두고 앱 서버만 접속하게 해요.',
    has: ctx => ctx.ofType('rds').some(n => ctx.zoneOf(n) === 'db') },
  appDb: { name: '앱 서버 — RDS 연결', why: '데이터는 앱 서버가 DB에 읽고 써요. 사용자는 DB에 직접 닿지 않아요.',
    has: ctx => problemApps(ctx).some(e => ctx.neighborsOf(e, 'rds').length > 0) },
  appTwoAz: { name: '두 가용 영역의 앱 서버 (같은 Load Balancer 뒤)', why: '한 AZ가 멈추면 Load Balancer가 다른 AZ의 서버로만 요청을 보내 서비스가 이어져요.',
    has: ctx => ctx.ofType('lb').some(lb => missionAzCount(ctx, ctx.neighborsOf(lb, ...APP_TYPES).filter(e => ctx.zoneOf(e) === 'private')) >= 2) },
  dbStandby: { name: '다른 가용 영역의 RDS Standby (Multi-AZ)', why: 'RDS가 있는 AZ가 멈추면 다른 AZ의 예비 DB가 이어받아요.',
    has: ctx => missionStandbys(ctx).some(sb => ctx.neighborsOf(sb, 'rds').length > 0) },
  s3Files: { name: '앱 서버 — S3 연결', why: '사진 같은 파일은 서버 디스크가 아니라 S3에 두면 서버를 바꾸거나 늘려도 파일이 그대로 남아요.',
    has: ctx => problemApps(ctx).some(e => ctx.linkedNodes(e, 's3').length > 0) },
  cdn: { name: '사용자 — CloudFront 연결', why: 'CloudFront가 사용자와 가까운 곳에서 사진·정적 파일을 먼저 보내 줘 빠르고, 서버가 받는 요청도 줄어요.',
    has: ctx => !missionSug(ctx, 2) && ctx.ofType('cloudfront').length > 0 },
  cache: { name: '앱 서버 — ElastiCache 연결', why: '자주 읽는 데이터는 캐시에서 바로 꺼내 DB까지 가지 않아요. 빠르고 DB 부담도 줄어요.',
    has: ctx => !missionSug(ctx, 1) && ctx.ofType('elasticache').length > 0 },
  fargate: { name: '프라이빗 서브넷의 Fargate (ECS로 실행)', why: 'Fargate는 서버(EC2)를 직접 관리하지 않고 컨테이너만 실행해요. ECS가 몇 개를 어디에 띄울지 맡아요.',
    has: ctx => ctx.ofType('fargate').some(f => ctx.zoneOf(f) === 'private' && ctx.linkedNodes(f, 'ecs').length > 0) },
  ecrPrivate: { name: '컨테이너 — ECR 연결 + VPC Endpoints', why: '컨테이너 이미지는 ECR에서 받아요. VPC Endpoints를 거치면 NAT·인터넷 없이 받을 수 있어요.',
    has: ctx => problemApps(ctx).some(e => ctx.linkedNodes(e, 'ecr').length > 0) &&
      ctx.ofType('vpce').some(v => ctx.linkedNodes(v, 'ecr').length > 0) },
};

// 기본 요구: 검증 결과가 정상 (못 채우면 남은 오류·경고를 그대로 보여 준다. 채점은 js/rules/problems.js)
const PROBLEM_BASE_REQ = { base: true, text: '검증 결과가 "정상" (오류·경고 없음)' };

// 모범 답안 구성 (VPC 기준 상대 좌표. js/data/examples.js의 기본 3-Tier·컨테이너 예시를 바탕으로)
const PROBLEM_ANSWER_SHOP = {
  nodes: [
    ['pc', 'pc', 300, -150], ['cf', 'cloudfront', 500, -150], ['igw', 'igw', 500, 0], ['lb', 'lb', 500, 190], ['nat', 'nat', 120, 190],
    ['ec2a', 'ec2', 260, 350], ['ec2b', 'ec2', 740, 350],
    ['rds', 'rds', 180, 510], ['cache', 'elasticache', 360, 510], ['sb', 'rds-standby', 740, 510],
    ['vpce', 'vpce', 0, 270], ['s3', 's3', -180, 270],
  ],
  edges: [
    ['pc', 'cf'], ['cf', 'igw'], ['igw', 'lb'], ['lb', 'ec2a'], ['lb', 'ec2b'],
    ['ec2a', 'rds'], ['ec2b', 'rds'], ['rds', 'sb'], ['ec2a', 'cache'], ['ec2b', 'cache'],
    ['ec2a', 'nat'], ['ec2b', 'nat'], ['nat', 'igw'],
    ['ec2a', 's3'], ['ec2b', 's3'], ['vpce', 's3'],
  ],
};
const PROBLEM_ANSWER_PHOTO = {
  nodes: [...EXAMPLE_CONTAINER.nodes, ['s3', 's3', -180, 120]],
  edges: [...EXAMPLE_CONTAINER.edges, ['fga', 's3'], ['fgb', 's3'], ['vpce', 's3']],
};

const PROBLEMS = [
  {
    key: 'board', level: 'easy', title: '회사 게시판',
    story: '직원들이 공지와 글을 올리는 사내 게시판을 AWS에 올리려 해요. 글은 DB에 저장하고, 서버와 DB는 외부에서 함부로 들어올 수 없어야 해요.',
    reqs: [
      { text: '인터넷 요청은 한 입구로만 받아요', roles: [PROBLEM_ROLES.entryUser, PROBLEM_ROLES.entryLb] },
      { text: '서버와 DB는 인터넷에서 바로 보이지 않게 해요', roles: [PROBLEM_ROLES.appPrivate, PROBLEM_ROLES.dbSubnet] },
      { text: '올린 글은 DB에 저장해요', roles: [PROBLEM_ROLES.appDb] },
    ],
    answer: EXAMPLE_BASIC,
    answerNote: '기본 3-Tier예요. 입구(IGW → Load Balancer) · 앱 서버(프라이빗 서브넷) · DB(DB 서브넷) 세 계층을 나누고, 두 AZ에 서버와 예비 DB를 둬요.',
  },
  {
    key: 'shop', level: 'normal', title: '온라인 쇼핑몰',
    story: '상품 사진이 많은 쇼핑몰이에요. 세일 때는 같은 상품 페이지를 많은 사람이 동시에 봐요. 한 데이터센터(가용 영역)에 문제가 생겨도 주문은 계속 받아야 해요.',
    reqs: [
      { text: '한 가용 영역이 멈춰도 주문을 계속 받아요', roles: [PROBLEM_ROLES.appTwoAz, PROBLEM_ROLES.dbStandby] },
      { text: '상품 사진은 서버가 아닌 저장소에 두고, 사용자 가까이에서 빠르게 보여 줘요', roles: [PROBLEM_ROLES.s3Files, PROBLEM_ROLES.cdn] },
      { text: '자주 보는 상품 정보는 DB까지 가지 않고 빨리 꺼내요', roles: [PROBLEM_ROLES.cache] },
    ],
    answer: PROBLEM_ANSWER_SHOP,
    answerNote: '기본 3-Tier에 CloudFront(사진을 가까이에서), S3(사진 저장, VPC Endpoints로 NAT 없이), ElastiCache(자주 보는 상품 정보)를 더했어요.',
  },
  {
    key: 'photo', level: 'hard', title: '사진 공유 앱',
    story: '사용자가 사진을 올리고 나누는 앱이에요. 개발팀은 서버(EC2)를 직접 관리하지 않고 컨테이너로 운영하고 싶어 해요. 보안팀은 서버가 인터넷을 거치지 않기를 원해요.',
    reqs: [
      { text: '서버는 직접 관리하지 않는 컨테이너로 운영해요', roles: [PROBLEM_ROLES.fargate] },
      { text: '한 가용 영역이 멈춰도 서비스가 이어져요', roles: [PROBLEM_ROLES.appTwoAz, PROBLEM_ROLES.dbStandby] },
      { text: '올린 사진은 서버가 아닌 저장소에 둬요', roles: [PROBLEM_ROLES.s3Files] },
      { text: '컨테이너 이미지는 인터넷을 거치지 않고 받아요', roles: [PROBLEM_ROLES.ecrPrivate] },
    ],
    answer: PROBLEM_ANSWER_PHOTO,
    answerNote: '컨테이너 예시에 S3를 더했어요. ECS가 두 AZ에 Fargate 작업을 띄우고, 이미지(ECR)와 사진(S3)은 VPC Endpoints로 NAT 없이 오가요.',
  },
];
