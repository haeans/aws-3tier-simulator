// @ts-check
// js/data/performance.js — 성능 시뮬레이션 가정값과 근거

/* =========================================================
   성능 시뮬레이션 가정값
   - 처리량·지연 숫자는 학습용 가정값이다. 실제 AWS 성능 수치가 아니다.
   - 동작 방식(누가 자동으로 늘어나는지, 어디로 나눠 보내는지)은 AWS 공식 문서를 근거로 한다.
   ========================================================= */
const PERF_NOTE = '숫자는 학습용 가정값이에요. 실제 AWS 성능 수치가 아니에요.';

// 캐시·복제본·공격 가정값 (동작은 문서 근거, 비율은 학습용 가정)
const PERF_CDN_HIT = 0.5;     // CloudFront: 들어온 요청의 50%(이미지 등 정적 파일)를 엣지 캐시가 바로 응답
const PERF_CACHE_HIT = 0.8;   // ElastiCache: EC2의 DB 조회 중 80%는 캐시에 있음 (lazy loading)
const PERF_READ_SHARE = 0.7;  // DB 조회 중 70%는 읽기 → Read Replica가 있으면 Replica로, 쓰기는 본체로
const PERF_ATTACK = 3;        // 공격 시나리오: 기본 트래픽의 3배만큼 봇 요청

// capacity: 1초에 처리할 수 있는 요청 수 (null = 제한 없음. AWS가 알아서 늘리는 관리형으로 봄)
// latency:  한 번 거칠 때 걸리는 기본 시간(ms). 바쁠수록 대기 시간이 붙어 늘어난다.
// edgeHit:  들어온 요청 중 이 박스가 바로 응답하는 비율 (나머지만 다음 박스로. R6)
const PERF = {
  cloudfront: { capacity: null, latency: 10, edgeHit: PERF_CDN_HIT },
  igw:        { capacity: null, latency: 1 },    // 대역폭 제한 없음 (IGW 문서)
  lb:         { capacity: null, latency: 5 },    // 트래픽에 맞춰 자동 확장 (ELB 문서)
  ec2:        { capacity: 100,  latency: 30 },   // EC2 1대가 초당 100요청을 처리한다고 가정
  // 컨테이너 박스 1개(작업·Pod 묶음)도 EC2 1대와 같은 양을 처리한다고 가정 (36번, CTR-05)
  ecs:        { capacity: 100,  latency: 30 },
  eks:        { capacity: 100,  latency: 30 },
  fargate:    { capacity: 100,  latency: 30 },
  rds:        { capacity: 300,  latency: 10 },   // RDS 1대가 초당 300요청(쿼리)을 처리한다고 가정
  'rds-standby': { capacity: 300, latency: 10 }, // 장애 조치 후 본체가 되면 RDS와 같은 성능
  'rds-replica': { capacity: 300, latency: 10 }, // 읽기 전용 복사본 (RDS와 같은 성능)
  elasticache: { capacity: 2000, latency: 1 },   // 메모리 캐시: DB보다 훨씬 많이·빨리 응답한다고 가정
};

// ----- 46번: 간단한 설정값 (가정) -----
// 박스 크기: 처리량(capacity)에 곱하는 배수. 박스에 size가 없으면 'medium'(보통) = 지금까지의 값
// examples: 실제 느낌을 주는 예시 이름 (가정. 실제 성능 비율과 같지 않다)
const SIZE_KEYS = ['small', 'medium', 'large'];
const SIZE_NAMES = { small: '작게', medium: '보통', large: '크게' };
const SIZE_FACTOR = { small: 0.5, medium: 1, large: 2 };
const SIZE_SETTINGS = {
  app: { label: '서버 크기', unit: '요청/초', types: APP_TYPES, examples: { small: 't3.small', medium: 't3.medium', large: 't3.large' } },
  db:  { label: 'DB 크기', unit: '쿼리/초', types: RDS_TYPES, examples: { small: 'db.t3.small', medium: 'db.t3.medium', large: 'db.t3.large' } },
};
// Auto Scaling 그룹 설정 범위. 그룹에 asgMin·asgMax·asgTarget이 없으면 기본(최소 = 박스 수, 최대 = 3배, 목표 50%)
const ASG_LIMITS = { min: 20, max: 30, targetLow: 30, targetHigh: 90 };

// 요청을 다음 박스로 넘기는 방식: 앞에 적힌 종류부터 찾아, 연결된 그 종류의 박스들에 고르게 나눈다.
//   한 칸이 배열이면 그 종류들을 한 묶음으로 본다 (36번: 앱 서버 = EC2·ECS·EKS·Fargate를 함께 고르게)
//   사용자: CloudFront가 있으면 CloudFront로, 없으면 IGW로
//   Load Balancer: 연결된 앱 서버(EC2·컨테이너)에 고르게 (기본 라운드 로빈, ELB 문서)
//   앱 서버: 요청 하나마다 RDS에 한 번 조회
const PERF_ROUTES = {
  user:       ['cloudfront', 'igw'],
  cloudfront: ['igw'],
  igw:        ['lb'],
  lb:         [APP_TYPES],
  ec2:        ['rds'],
  ecs:        ['rds'],
  eks:        ['rds'],
  fargate:    ['rds'],
};

// 옆길 (R6): 본 대상(키 종류)으로 갈 요청 중 일부를, 함께 연결된 다른 종류가 대신 받는다 (적힌 순서대로)
//   share: 나눌 비율. of: 'all' = 전체의 비율, 'rest' = 앞 옆길이 가져가고 남은 요청의 비율
//   skipDown: 멈춘 박스는 빼고 남은 박스가 몫을 이어받음 (모두 멈췄으면 그 몫은 본 대상으로)
//   rds: ElastiCache가 캐시에 있는 조회를 응답(lazy loading, 24번 멈춤 반영), Read Replica가 남은 조회 중 읽기를 받음
const PERF_SIDE_ROUTES = {
  rds: [
    { type: 'elasticache', share: PERF_CACHE_HIT, of: 'all', skipDown: true },
    { type: 'rds-replica', share: PERF_READ_SHARE, of: 'rest', skipDown: false },
  ],
};

// 공격을 막는 박스 (R6): 요청 경로의 이 종류 박스에 붙어 있으면 공격(봇) 요청을 그 앞에서 막는다
const PERF_GUARDS = { waf: ['cloudfront', 'lb'] };

// 요청이 지나가는 길이 아닌 박스 (R6): 주소 알려 주기(Route 53)·검사 규칙(WAF)은 요청을 넘기지 않는다
const PERF_OFF_PATH = ['route53', 'waf'];

// 동작 근거 문서
const PERF_DOCS = {
  health:   'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html',
  failover: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html',
  asg:      'https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html',
  cdn:      'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-hit-ratio.html',
  cache:    'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html',
  replica:  'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html',
  waf:      'https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based.html',
  lb:  'https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html',
  igw: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html',
};

// 사용률 단계: 80% 이상 바쁨(노랑), 100% 이상 넘침(빨강, 넘친 요청은 실패)
const PERF_BUSY = 0.8;
