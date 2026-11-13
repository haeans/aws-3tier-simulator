// @ts-check
// js/rules/network.js — 네트워크 ② 라우팅 테이블·보안 그룹 계산 (45번). 화면에 기대지 않고 구성 s를 받는다
// 사용자가 값을 입력하지 않는다. 캔버스에 그린 서브넷·박스·연결선을 보고 "실제 AWS라면 이렇게 설정한다"를 만든다.
// 48번: IDC와 이은 VGW → 라우팅 테이블에 온프레미스 경로(HY-04), 보안 그룹에 온프레미스에서 오는 규칙(HY-05). 근거 criteria/hybrid.md
// 근거: criteria/flow.md F5(퍼블릭 = IGW 경로)·F6(local 경로)·F9(상태 저장)·F10(출발지 = 다른 보안 그룹)·
//       F16(프라이빗 → NAT)·F18(게이트웨이 엔드포인트는 경로, 인터페이스는 서브넷 안 IP)·F19(Session Manager는 인바운드 불필요)
// 주소·포트 숫자는 예시(가정)다. 54번(직접 설정)에서 사용자가 바꿀 값의 자리

const NET_VPC_CIDR = '10.0.0.0/16';   // 예시 (가정)
const NET_ANY = '0.0.0.0/0';
const NET_ONPREM_CIDR = '192.168.0.0/16';   // 48번: IDC 주소 예시 (가정). VPC와 겹치지 않게 둔다 (HY-10)
const NET_PORT = {                     // 예시 (가정): 엔진·앱에 따라 다르다
  https: 'HTTPS 443',
  app: 'HTTP (예: 80)',
  db: 'DB 포트 (예: MySQL 3306)',
  cache: 'Redis (예: 6379)',
};
const NET_GATEWAY_EP = ['s3', 'dynamodb'];                         // 게이트웨이 엔드포인트: 라우팅 테이블에 경로가 생김 (F18)
const NET_SG_APPS = ['ec2', 'eks', 'fargate'];                      // 요청을 받는 앱 서버 (ECS 박스는 실행 방식을 나타내는 설정 관계)
const NET_SG_NOTES = [
  '응답은 보안 그룹이 기억해서(상태 저장) 따로 열지 않아도 나가요.',
  '나가는 규칙은 기본값(모두 허용)이에요.',
];

// 영역 안에 있는 박스 (그 영역 안의 다른 영역에 든 것도 포함)
function netNodesIn(area, s = state) {
  return s.nodes.filter(n => {
    let c = findContainer(n.parentContainer, s);
    while (c) {
      if (c.id === area.id) return true;
      c = findContainer(c.parentContainer, s);
    }
    return false;
  });
}

// 서브넷의 라우팅 테이블. 서브넷이 아니면 null
// 돌려주는 값: { rows: [{ dest, cidr, target, note }], notes: [] }. target이 null이면 그 경로가 없음 (note가 이유)
function networkRouteTable(area, s = state) {
  if (!area || !SUBNET_TYPES.includes(area.type)) return null;
  const ctx = buildContext(true, s);
  const az = findContainer(area.parentContainer, s);
  const azName = c => (c ? c.label : '');
  const rows = [{ dest: 'VPC 안', cidr: NET_VPC_CIDR, target: 'local', note: '' }];   // F6
  const notes = [];
  const inside = netNodesIn(area, s);
  const apps = inside.filter(n => APP_TYPES.includes(n.type) && n.type !== 'ecs');

  // HY-04: 서브넷 안의 박스가 VGW(고객 게이트웨이와 이어진)와 연결돼 있으면 온프레미스로 가는 경로가 있다 (경로 전파로 자동)
  const vgws = [...new Set(inside.flatMap(n => ctx.neighborsOf(n, 'vgw')))].filter(v => ctx.neighborsOf(v, 'cgw').length);
  const onpremRow = vgws.length ? { dest: '온프레미스 (IDC)', cidr: NET_ONPREM_CIDR, target: 'VGW (경로 전파)', note: '' } : null;
  if (area.type === 'public') {   // F5
    const igw = ctx.ofType('igw').length > 0;
    rows.push({ dest: '인터넷 전체', cidr: NET_ANY, target: igw ? 'IGW' : null,
      note: igw ? '' : 'IGW가 없어서 인터넷과 오갈 수 없어요. 이대로면 퍼블릭 서브넷 역할을 못 해요.' });
    notes.push('IGW로 가는 경로가 있어서 퍼블릭 서브넷이에요. Load Balancer·NAT처럼 인터넷과 닿아야 하는 것을 둬요.');
  } else if (area.type === 'private') {
    if (apps.length) {   // F16: 서버가 먼저 밖으로 나가는 길
      const nats = [...new Set(apps.flatMap(e => ctx.neighborsOf(e, 'nat')))].filter(n => ctx.zoneOf(n) === 'public');
      const same = nats.find(n => az && ctx.azOf(n) && ctx.azOf(n).id === az.id);
      const nat = same || nats[0];
      rows.push({ dest: '인터넷 전체', cidr: NET_ANY, target: nat ? `NAT (${azName(ctx.azOf(nat))})` : null,
        note: !nat ? '서버가 밖으로 나가는 길이 없어요. 밖의 서비스가 필요하면 NAT나 VPC Endpoints로 이어 주세요.'
          : same ? '' : '다른 가용 영역의 NAT를 써요. 그 AZ가 멈추면 이 서브넷도 밖으로 못 나가요.' });
      // F18: 게이트웨이 엔드포인트(S3·DynamoDB)는 경로, 인터페이스 엔드포인트는 서브넷 안의 IP
      const svcs = [...new Set(apps.flatMap(e => ctx.neighborsOf(e, ...NET_GATEWAY_EP)))]
        .filter(sv => ctx.neighborsOf(sv, 'vpce').length);
      [...new Set(svcs.map(sv => sv.type))].forEach(t => rows.push({
        dest: `${SVC_MAP[t].name} (접두사 목록 pl-…)`, cidr: '', target: 'VPC Endpoints (게이트웨이)', note: '' }));
      const iface = [...new Set(apps.flatMap(e => ctx.linkedNodes(e, 'ecr', 'cloudwatch', 'sessionmanager'))
        .filter(sv => ctx.linkedNodes(sv, 'vpce').length).map(sv => SVC_MAP[sv.type].name))];
      if (iface.length) notes.push(`${eunNeun(iface.join('·'))} 인터페이스 엔드포인트라 경로 없이 이 서브넷 안의 IP로 이어져요.`);
    } else notes.push('앱 서버를 두면 밖으로 나가는 경로(NAT)가 여기에 생겨요.');
    notes.push('IGW로 가는 경로가 없어서 인터넷에서 바로 들어올 수 없어요.');
  } else {
    notes.push(onpremRow ? 'DB는 인터넷으로 나갈 일이 없어 IGW·NAT 경로가 없어요. 앱 서버의 요청은 local 경로로 들어와요.' : 'DB는 밖으로 나갈 일이 없어 local 경로만 있어요. 앱 서버의 요청은 local 경로로 들어와요.');
  }
  if (onpremRow) {
    rows.splice(1, 0, onpremRow);
    notes.push('VGW에서 경로 전파를 켜 두면 IDC로 가는 경로가 자동으로 들어와요. 주소 범위는 VPC와 겹치지 않게 해요.');
  }
  return { rows, notes };
}

// 박스의 보안 그룹 (들어오는 규칙). 보안 그룹이 없는 박스면 null
// 돌려주는 값: { rules: [{ port, source, warn }], notes: [] }. 출발지는 연결선으로 이어진 박스에서 정한다
function networkSecurityGroup(node, s = state) {
  if (!node) return null;
  const ctx = buildContext(true, s);
  const names = list => [...new Set(list.map(n => SVC_MAP[n.type].name))].join('·');
  const outside = [...USER_TYPES, 'igw'];
  const rules = [], notes = [];
  const fromInternet = (port, warn) => rules.push({ port, source: `인터넷 전체 (${NET_ANY})`, warn });
  const fromSg = (port, list) => { if (list.length) rules.push({ port, source: `${names(list)}의 보안 그룹`, warn: '' }); };   // F10

  // HY-05: VGW(고객 게이트웨이와 이은)와 연결된 서버·DB는 IDC에서 오는 연결을 허용해야 한다
  const fromIdc = port => {
    if (ctx.neighborsOf(node, 'vgw').some(v => ctx.neighborsOf(v, 'cgw').length)) rules.push({ port, source: `온프레미스 (${NET_ONPREM_CIDR}, VGW 거쳐)`, warn: '' });
  };
  if (node.type === 'lb') {
    if (ctx.neighborsOf(node, ...outside, 'cloudfront').length) fromInternet(NET_PORT.https, '');
    else notes.push('Load Balancer로 들어오는 연결이 아직 없어요. IGW와 이으면 인터넷에서 오는 HTTPS 규칙이 생겨요.');
  } else if (NET_SG_APPS.includes(node.type)) {
    fromSg(NET_PORT.app, ctx.neighborsOf(node, 'lb'));
    fromIdc(NET_PORT.app);
    if (ctx.neighborsOf(node, ...outside).length) fromInternet(NET_PORT.app, '인터넷에서 서버로 바로 들어오는 규칙이 생겨요. Load Balancer를 거치게 하세요.');
    if (!rules.length) notes.push('이 서버로 들어오는 연결이 아직 없어요.');
    if (ctx.linkedNodes(node, 'sessionmanager').length) notes.push('Session Manager로 접속해서 SSH(22) 규칙이 필요 없어요.');   // F19
  } else if (node.type === 'rds' || node.type === 'rds-replica') {
    fromSg(NET_PORT.db, ctx.neighborsOf(node, ...APP_TYPES).filter(n => n.type !== 'ecs'));
    fromIdc(NET_PORT.db);
    if (ctx.neighborsOf(node, ...outside).length) fromInternet(NET_PORT.db, 'DB가 인터넷에 열려요. 앱 서버에서만 접속하게 하세요.');
    if (!rules.length) notes.push('이 DB로 들어오는 연결이 아직 없어요. 앱 서버와 이으면 그 서버의 보안 그룹에서 오는 규칙이 생겨요.');
  } else if (node.type === 'rds-standby') {
    notes.push('Multi-AZ의 Standby는 같은 DB의 예비본이라 본체와 같은 보안 그룹을 써요. 앱은 Standby에 직접 접속하지 않아요.');
  } else if (node.type === 'elasticache') {
    fromSg(NET_PORT.cache, ctx.neighborsOf(node, ...APP_TYPES).filter(n => n.type !== 'ecs'));
    if (!rules.length) notes.push('이 캐시로 들어오는 연결이 아직 없어요.');
  } else return null;
  return { rules, notes: rules.length ? [...notes, ...NET_SG_NOTES] : notes };
}
