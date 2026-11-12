// @ts-check
// js/data/flow-steps.js — 흐름 단계 해설 문구 (40번). 검증 후 흐름 점이 박스에 닿을 때 결과 패널에 한 줄로 보여 준다.

/* =========================================================
   FLOW_STEP_TEXT[박스 종류][구간의 성격] = { text, net, ref }
   구간의 성격:
     request  사용자 요청이 이 박스에 닿았을 때 ([사용자 요청] 보기)
     server   서버가 시작한 통신이 이 박스에 닿았을 때 ([서버 통신] 보기. 없으면 request를 씀)
     response 응답이 이 박스로 돌아왔을 때 (없으면 기본 문구)
     lookup   들렀다 오는 곳 (Route 53: 주소 묻기)
     inspect  그 자리에서 검사하는 곳 (WAF)
   text: 박스가 하는 일 한 줄 (쉬운 말)
   net:  네트워크 한 줄 (라우팅 테이블·보안 그룹). 앱은 이 설정을 그리지 않으므로 "실제 AWS에서는 이렇게 이어진다"는 설명만 한다
   ref:  근거가 된 AWS 공식 문서
   문서에서 확인한 내용만 쓴다. 근거 문장과 주의할 점은 criteria/flow.md (주석의 F번호가 그 문서의 ID)
   여기에 없는 종류는 기본 문구(FLOW_STEP_TEXT_DEFAULT)로 보여 준다.
   ========================================================= */
const FLOW_DOCS = 'https://docs.aws.amazon.com/';

// 앱 서버(EC2·컨테이너)에 요청이 닿았을 때: 종류와 상관없이 같은 설명
const FLOW_STEP_APP = {
  request: {   // 근거: F10
    text: '앱 서버가 요청을 받아 처리해요. 필요한 데이터는 캐시나 DB에 물어봐요.',
    net: '서버의 보안 그룹은 Load Balancer에서 온 요청만 받도록 해 두는 것이 좋아요.',
    ref: FLOW_DOCS + 'elasticloadbalancing/latest/application/load-balancer-update-security-groups.html',
  },
};
// 사용자에게 응답이 돌아왔을 때
const FLOW_STEP_USER = {
  response: { text: '응답이 사용자에게 도착했어요. 요청 하나의 왕복이 끝났어요.' },
};

const FLOW_STEP_TEXT = {
  route53: {
    lookup: {   // 근거: F1
      text: '사용자가 먼저 도메인 이름의 주소를 물어보고, IP 주소를 답으로 받아 와요.',
      ref: FLOW_DOCS + 'Route53/latest/DeveloperGuide/welcome-dns-service.html',
    },
  },
  waf: {
    inspect: {   // 근거: F3
      text: '붙어 있는 박스(CloudFront·Load Balancer)로 온 요청을 규칙으로 검사해서, 통과시키거나 막아요.',
      ref: FLOW_DOCS + 'waf/latest/developerguide/what-is-aws-waf.html',
    },
  },
  cloudfront: {
    request: {   // 근거: F2
      text: '찾는 콘텐츠가 엣지 캐시에 있으면 여기서 바로 응답하고, 없으면 원본(뒤쪽)으로 요청을 넘겨요.',
      ref: FLOW_DOCS + 'AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html',
    },
    response: {   // 근거: F2 (원본에서 받은 것은 다음 요청을 위해 캐시에 넣음)
      text: '원본에서 받은 응답을 엣지 캐시에 넣어 두고 사용자에게 돌려줘요. 다음 요청은 여기서 바로 응답해요.',
      ref: FLOW_DOCS + 'AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html',
    },
  },
  igw: {
    request: {   // 근거: F4, F5
      text: 'VPC와 인터넷을 이어 주는 문이에요. 인터넷에서 온 요청이 여기로 VPC에 들어와요.',
      net: '서브넷의 라우팅 테이블에 IGW로 가는 경로가 있으면 퍼블릭 서브넷이에요.',
      ref: FLOW_DOCS + 'vpc/latest/userguide/VPC_Internet_Gateway.html',
    },
    server: {   // 근거: F16
      text: 'NAT가 넘긴 요청이 여기를 지나 인터넷으로 나가요.',
      net: 'NAT가 있는 퍼블릭 서브넷의 라우팅 테이블이 NAT에서 나온 트래픽을 IGW로 보내요.',
      ref: FLOW_DOCS + 'vpc/latest/userguide/vpc-nat-gateway.html',
    },
  },
  lb: {
    request: {   // 근거: F7, F8
      text: '상태 확인을 통과한 정상 서버만 골라, 여러 가용 영역의 서버에 요청을 나눠 보내요.',
      ref: FLOW_DOCS + 'elasticloadbalancing/latest/application/introduction.html',
    },
  },
  ec2: FLOW_STEP_APP,
  ecs: FLOW_STEP_APP,
  eks: FLOW_STEP_APP,
  fargate: FLOW_STEP_APP,
  elasticache: {
    request: {   // 근거: F11 (캐시에 넣는 것은 앱)
      text: '서버가 캐시를 먼저 봐요. 있으면 바로 받고, 없으면 DB에서 읽은 뒤 서버가 캐시에 넣어 둬요.',
      ref: FLOW_DOCS + 'AmazonElastiCache/latest/dg/Strategies.html',
    },
  },
  rds: {
    request: {   // 근거: F12, F6 (local 경로는 길만 뜻함. 허용은 보안 그룹이 따로 함)
      text: '서버가 DB의 주소(엔드포인트)로 접속해 데이터를 읽고 써요.',
      net: '모든 라우팅 테이블에는 VPC 안에서 통신하는 기본 경로(local)가 있어서, 서버 서브넷에서 DB 서브넷으로 가는 길은 이미 있어요.',
      ref: FLOW_DOCS + 'vpc/latest/userguide/subnet-route-tables.html',
    },
  },
  'rds-replica': {
    request: {   // 근거: F13
      text: '읽기만 하는 요청을 대신 받아서 원본 DB의 부담을 덜어 줘요.',
      ref: FLOW_DOCS + 'AmazonRDS/latest/UserGuide/USER_ReadRepl.html',
    },
  },
  nat: {
    server: {   // 근거: F14, F15, F16
      text: '프라이빗 서브넷의 서버가 밖으로 나가는 문이에요. 서버의 주소를 NAT의 주소로 바꿔서 내보내요.',
      net: '프라이빗 서브넷의 라우팅 테이블이 밖으로 가는 트래픽을 NAT로 보내요.',
      ref: FLOW_DOCS + 'vpc/latest/userguide/vpc-nat-gateway.html',
    },
    response: {   // 근거: F14, F15 (응답은 원래 출발지 주소로 되돌림)
      text: '응답의 주소를 원래 서버 주소로 되돌려 서버에 넘겨요. 밖에서 먼저 시작한 연결은 들어올 수 없어요.',
      ref: FLOW_DOCS + 'vpc/latest/userguide/vpc-nat-gateway.html',
    },
  },
  vpce: {
    server: {   // 근거: F17, F18
      text: 'IGW나 NAT 없이 AWS 서비스로 바로 가는 비공개 통로예요.',
      net: 'S3·DynamoDB용(게이트웨이)은 라우팅 테이블의 경로로, 그 밖의 서비스용(인터페이스)은 서브넷 안의 프라이빗 IP로 이어져요.',
      ref: FLOW_DOCS + 'vpc/latest/privatelink/gateway-endpoints.html',
    },
  },
  sessionmanager: {
    server: {   // 근거: F19 (인바운드 포트 불필요·아웃바운드 443 필요까지만 확인됨)
      text: '들어오는 포트를 열지 않아도 관리자가 서버에 접속할 수 있어요. 서버에서 밖으로(HTTPS) 나가는 길만 있으면 돼요.',
      ref: FLOW_DOCS + 'systems-manager/latest/userguide/session-manager.html',
    },
  },
  ecr: {
    server: {   // 근거: F20 (Fargate만 문장으로 확인됨)
      text: '컨테이너 이미지를 여기서 가져와요. Fargate 작업은 이미지를 가져오려면 밖으로 나가는 길이 있어야 해요.',
      ref: FLOW_DOCS + 'AmazonECS/latest/developerguide/fargate-task-networking.html',
    },
  },
  cloudwatch: {
    server: {   // 근거: F22
      text: '서버 안의 CloudWatch 에이전트가 모은 지표와 로그를 받아요.',
      ref: FLOW_DOCS + 'AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html',
    },
  },
  smartphone: FLOW_STEP_USER,
  tablet: FLOW_STEP_USER,
  pc: FLOW_STEP_USER,
  dbadmin: FLOW_STEP_USER,
};

// 문구가 없는 박스 종류의 기본 문구
const FLOW_STEP_TEXT_DEFAULT = {
  request:  { text: '요청이 이 박스에 도착했어요.' },
  response: { text: '응답이 왔던 길로 되돌아가요.' },
};

// 박스 종류와 상관없는 네트워크 한 줄
const FLOW_STEP_NET = {
  // 응답이 출발하는 첫 단계에 붙인다. 근거: F9
  stateful: {
    text: '',
    net: '보안 그룹은 들어오도록 허용한 요청을 기억해서, 그 응답은 따로 허용하지 않아도 나갈 수 있어요.',
    ref: FLOW_DOCS + 'vpc/latest/userguide/vpc-security-groups.html',
  },
};
