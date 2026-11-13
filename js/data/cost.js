// @ts-check
// js/data/cost.js — 월 비용 가격표 (47번)

/* ---------------------------------------------------------
   서울(ap-northeast-2) 온디맨드 가격, 미국 달러. 근거: criteria/cost.md (C1~C12, 2026-11-13 확인)
   - hour: 시간 요금(달러/시간) → 월 = × COST_HOURS / month: 고정 월 요금
   - 저장 공간·데이터 전송·요청 수 같은 사용량 요금은 넣지 않는다 (화면에 "별도"로 적는다)
   - 크기별 값은 46번 박스 크기(small·medium·large)에 맞춘다
   --------------------------------------------------------- */
const COST_HOURS = 730;          // 한 달 = 730시간 (AWS 가격 계산에 흔히 쓰는 값)
const COST_CHECKED = '2026-11-13';
const COST_REGION = '서울';

const COST_PRICE = {
  ec2:  { hour: { small: 0.026, medium: 0.052, large: 0.104 }, label: { small: 't3.small', medium: 't3.medium', large: 't3.large' },
    doc: 'https://aws.amazon.com/ec2/pricing/on-demand/' },                                    // C1
  rds:  { hour: { small: 0.052, medium: 0.104, large: 0.208 }, label: { small: 'db.t3.small', medium: 'db.t3.medium', large: 'db.t3.large' },
    doc: 'https://aws.amazon.com/rds/mysql/pricing/' },                                         // C2 (Single-AZ. Multi-AZ는 2배)
  elasticache: { hour: 0.099, label: 'cache.t3.medium · Redis', doc: 'https://aws.amazon.com/elasticache/pricing/' },   // C3
  nat:  { hour: 0.059, label: '게이트웨이', doc: 'https://aws.amazon.com/vpc/pricing/' },                         // C4
  lb:   { hour: 0.0225, label: 'ALB', doc: 'https://aws.amazon.com/elasticloadbalancing/pricing/' },   // C5
  vpce: { hour: 0.013, label: '인터페이스', doc: 'https://aws.amazon.com/privatelink/pricing/' },   // C6
  clientvpn: { hour: 0.10, label: '서브넷 연결 1개', doc: 'https://aws.amazon.com/vpn/pricing/' },                   // C7
  // C8: Fargate vCPU·메모리 시간 요금. 작업 크기는 가정 (박스 1개 = 작업 1개)
  fargate: { vcpu: 0.04656, gb: 0.00511, size: { small: [0.25, 0.5], medium: [0.5, 1], large: [1, 2] },
    doc: 'https://aws.amazon.com/fargate/pricing/' },
  eks:  { hour: 0.10, label: '클러스터', doc: 'https://aws.amazon.com/eks/pricing/' },                               // C9
  waf:  { month: 6, label: '웹 ACL + 규칙 1개', doc: 'https://aws.amazon.com/waf/pricing/' },                    // C10 ($5 + $1)
  route53: { month: 0.5, label: '호스팅 영역', doc: 'https://aws.amazon.com/route53/pricing/' },                 // C11
};
const COST_VPCE_AZS = 2;                                           // 인터페이스 엔드포인트는 AZ마다 요금 (가정: 기본 틀의 AZ 2곳)
const COST_VPCE_IFACE = ['ecr', 'cloudwatch', 'sessionmanager'];   // 인터페이스형으로 잇는 서비스 (S3·DynamoDB는 게이트웨이형 = 무료)
// 금액을 넣지 않는 것 (C12)
const COST_FREE = ['igw', 'ecs'];
const COST_USAGE = ['cloudfront', 's3', 'dynamodb', 'cloudwatch', 'cloudtrail', 'ecr', 'sessionmanager',
  'codecommit', 'codebuild', 'codepipeline', 'codedeploy'];
const COST_EXTRA = '저장 공간(EBS·RDS)·데이터 전송·NAT와 Load Balancer의 처리량 요금·요청 수 요금은 넣지 않았어요.';
