// @ts-check
// js/data/performance.js — 성능 시뮬레이션 가정값과 근거

/* =========================================================
   성능 시뮬레이션 가정값
   - 처리량·지연 숫자는 학습용 가정값이다. 실제 AWS 성능 수치가 아니다.
   - 동작 방식(누가 자동으로 늘어나는지, 어디로 나눠 보내는지)은 AWS 공식 문서를 근거로 한다.
   ========================================================= */
const PERF_NOTE = '숫자는 학습용 가정값이에요. 실제 AWS 성능 수치가 아니에요.';

// capacity: 1초에 처리할 수 있는 요청 수 (null = 제한 없음. AWS가 알아서 늘리는 관리형으로 봄)
// latency:  한 번 거칠 때 걸리는 기본 시간(ms). 바쁠수록 대기 시간이 붙어 늘어난다.
const PERF = {
  cloudfront: { capacity: null, latency: 10 },
  igw:        { capacity: null, latency: 1 },    // 대역폭 제한 없음 (IGW 문서)
  lb:         { capacity: null, latency: 5 },    // 트래픽에 맞춰 자동 확장 (ELB 문서)
  ec2:        { capacity: 100,  latency: 30 },   // EC2 1대가 초당 100요청을 처리한다고 가정
  rds:        { capacity: 300,  latency: 10 },   // RDS 1대가 초당 300요청(쿼리)을 처리한다고 가정
  'rds-standby': { capacity: 300, latency: 10 }, // 장애 조치 후 본체가 되면 RDS와 같은 성능
};

// 요청을 다음 박스로 넘기는 방식: 앞에 적힌 종류부터 찾아, 연결된 그 종류의 박스들에 고르게 나눈다.
//   사용자: CloudFront가 있으면 CloudFront로, 없으면 IGW로
//   Load Balancer: 연결된 EC2에 고르게 (기본 라운드 로빈, ELB 문서)
//   EC2: 요청 하나마다 RDS에 한 번 조회
const PERF_ROUTES = {
  user:       ['cloudfront', 'igw'],
  cloudfront: ['igw'],
  igw:        ['lb'],
  lb:         ['ec2'],
  ec2:        ['rds'],
};

// 동작 근거 문서
const PERF_DOCS = {
  health:   'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html',
  failover: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html',
  lb:  'https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html',
  igw: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html',
};

// 사용률 단계: 80% 이상 바쁨(노랑), 100% 이상 넘침(빨강, 넘친 요청은 실패)
const PERF_BUSY = 0.8;
