// @ts-check
// js/rules/context.js — 판정·제안·시뮬레이션이 함께 쓰는 조회 도구 (연결 상대, AZ, Auto Scaling 그룹 등)
// R3: 구성 s를 인자로 받는다 (없으면 캔버스 구성 state). 규칙 본문은 전역 대신 ctx의 도구를 쓴다

// 박스가 속한 AZ 영역 (서브넷이면 그 부모 AZ, 없으면 null)
function azOf(n, s = state) {
  let c = findContainer(n.parentContainer, s);
  while (c && c.type !== 'az') c = findContainer(c.parentContainer, s);
  return c || null;
}

// AZ 영역 안의 서브넷 (types를 주면 그 종류만)
function subnetsIn(az, ...types) {
  return subnetsInOf(state, az, ...types);
}
function subnetsInOf(s, az, ...types) {
  const want = types.length ? types : SUBNET_TYPES;
  return s.containers.filter(c => c.parentContainer === az.id && want.includes(c.type));
}

// Load Balancer가 쓰는 AZ 목록 = 연결된 앱 서버(EC2 등)가 있는 AZ (22번: LB는 서브넷 밖에 두므로 박스 위치로 정하지 않는다)
function lbAzsOf(ctx, lb) {   // (ctx의 구성을 씀)
  return [...new Set(lbTargetsOf(ctx, lb).map(ctx.azOf).filter(Boolean))];
}
// Load Balancer가 요청을 나눠 주는 대상 (51-2: 내부 LB 앞의 웹 서버는 대상이 아니라 요청을 보내는 쪽)
function lbTargetsOf(ctx, lb) {
  const all = ctx.neighborsOf(lb, ...APP_TYPES);
  return ctx.isInternalLb(lb) ? all.filter(m => ctx.roleOf(m) !== 'web') : all;
}

// Auto Scaling 그룹 영역 안의 EC2 (EC2 박스 중심이 영역 안에 있으면 그룹에 속함)
function asgMembersOf(area, nodes = state.nodes) {
  return nodes.filter(n => n.type === 'ec2' && inRect(rectOf(area), centerOf(n)));
}

// 연결선으로 이어진 박스 중 해당 종류 (검증 대상이 아닌 서비스도 찾는다)
function linkedNodes(n, ...types) {
  return linkedNodesOf(state, n, ...types);
}
function linkedNodesOf(s, n, ...types) {
  return s.edges
    .map(e => edgeOtherEnd(e, n.id, s))
    .filter(m => m && types.includes(m.type));
}

/* ----- 51번: EC2 역할 (근거 criteria/roles.md) -----
   박스에 role이 있으면 그 값, 없으면 자리·연결로 짐작한다
   - 점프 서버: Load Balancer·CloudFront·API Gateway와 이어지지 않았고 DB와도 이어지지 않았는데,
     DB 관리자와 이어졌거나 퍼블릭 서브넷에 있는 EC2 (제안 6이 쓰던 짐작과 같음)
   - 웹 서버: 요청이 들어오는 앞단(LB·IGW·사용자 등)과 이어졌고, 뒤에 다른 앱 서버(점프 서버 아님)가 이어진 EC2
   - 앱 서버: 나머지 */
const ROLE_DB_TYPES = [...RDS_TYPES, 'elasticache', 'rdsproxy', 'dynamodb', 'vgw'];
function serverRoleOf(n, s = state) {
  if (!n || !ROLE_TYPES.includes(n.type)) return null;
  if (n.role && SERVER_ROLES[n.role]) return n.role;
  return guessServerRole(n, s);
}
// 자동 짐작 (설명 패널에 "자동: …"으로 보여 줄 때도 씀)
function guessServerRole(n, s = state) {
  const linked = (...types) => linkedNodesOf(s, n, ...types);
  if (!linked('lb', 'cloudfront', 'apigw').length && !linked(...ROLE_DB_TYPES).length &&
      (linked('dbadmin').length || zoneOf(n, s) === 'public')) return 'bastion';
  const others = linked(...APP_TYPES).filter(m => m.id !== n.id && !(ROLE_TYPES.includes(m.type) && isBastionGuess(m, s)));
  // 51-2: 내부 LB는 앞단이 아니라 뒤쪽 (웹 서버 → 내부 LB → 앱 서버). 내부 LB 뒤의 앱 서버는 웹 서버가 아니다
  const inner = linked('lb').filter(lb => lbSchemeOf(lb, s) === 'internal');
  const entries = linked(...ROLE_ENTRY_TYPES).filter(m => !inner.includes(m));
  if ((others.length || inner.length) && entries.length) return 'web';
  return 'app';
}
// 다른 박스의 짐작을 볼 때 무한히 돌지 않게 점프 서버 여부만 본다
function isBastionGuess(m, s) {
  if (m.role) return m.role === 'bastion';
  const linked = (...types) => linkedNodesOf(s, m, ...types);
  return !linked('lb', 'cloudfront', 'apigw').length && !linked(...ROLE_DB_TYPES).length &&
    (linked('dbadmin').length > 0 || zoneOf(m, s) === 'public');
}
/* 51-2: Load Balancer 종류 (근거 criteria/roles.md RL-02·03). 박스에 scheme이 있으면 그 값, 없으면 연결로 짐작
   - 내부용: 인터넷 쪽(IGW·CloudFront·사용자)과 이어지지 않았고, 이어진 서버 중 다른 앞단(LB·IGW 등)에서도 요청을 받는 서버가 있음
     (= 웹 서버 뒤에 놓인 LB. 역할 짐작을 부르지 않아 서로 무한히 돌지 않는다)
   - 인터넷용: 나머지 (지금까지의 LB) */
function lbSchemeOf(n, s = state) {
  if (!n || n.type !== 'lb') return null;
  if (n.scheme && LB_SCHEMES[n.scheme]) return n.scheme;
  return guessLbScheme(n, s);
}
function guessLbScheme(n, s = state) {
  if (linkedNodesOf(s, n, ...LB_INTERNET_TYPES).length) return 'internet';
  const fronts = linkedNodesOf(s, n, ...APP_TYPES).filter(m => !(ROLE_TYPES.includes(m.type) && isBastionGuess(m, s)) &&
    linkedNodesOf(s, m, ...ROLE_ENTRY_TYPES).some(e => e.id !== n.id && !(e.type === 'lb' && e.scheme === 'internal')));
  return fronts.length ? 'internal' : 'internet';
}
const isInternalLb = (n, s = state) => lbSchemeOf(n, s) === 'internal';
const isBastion = (n, s = state) => serverRoleOf(n, s) === 'bastion';
// 요청 계층 순서: 웹(1) → 앱(2). 역할이 없는 박스는 0 (순서를 따지지 않음). 요청은 높은 쪽에서 낮은 쪽으로 가지 않는다 (RL-06)
//   51-2: 내부 LB는 웹과 앱 사이(1.5) — 앱 서버 → 내부 LB, 내부 LB → 웹 서버로는 가지 않음
function roleRank(n, s = state) {
  if (n.type === 'lb') return isInternalLb(n, s) ? 1.5 : 0;
  const r = serverRoleOf(n, s);
  return r === 'web' ? 1 : r === 'app' ? 2 : 0;
}
// 요청이 x에서 y로 갈 수 있는지: 앱 서버(2)에서 웹 서버(1)로는 가지 않는다 (RL-06, 학습용 설계 규칙)
function requestCanGo(x, y, s = state) {
  const rx = roleRank(x, s), ry = roleRank(y, s);
  return !(rx && ry && rx > ry);
}
// 점프 서버와 이어진 선 중 관리 접속으로 보는 상대 (관리자·사용자·IGW 쪽, 접속해 들어가는 서버·DB 쪽)
const ADMIN_LINK_TYPES = ['dbadmin', 'igw', ...USER_TYPES, ...APP_TYPES, ...RDS_TYPES, 'onprem-server'];
// 연결선 종류·방향 (역할 반영). 점프 서버 선은 관리 접속: 관리자 쪽 → 점프 서버 → 서버 쪽
function edgeInfoIn(ed, s = state) {
  const a = findNode(ed.from, s), b = findNode(ed.to, s);
  const base = edgeInfo(a.type, b.type, ed.kind || null);
  if (base.kind !== 'request') return base;
  const ba = isBastion(a, s), bb = isBastion(b, s);
  if (!ba && !bb) return base;
  const [other, sign] = ba ? [b, 1] : [a, -1];   // sign: 점프 서버가 A면 1
  if (ba && bb) return { kind: 'admin', dir: 0 };
  if (!ADMIN_LINK_TYPES.includes(other.type)) return base;
  const inbound = ['dbadmin', 'igw', ...USER_TYPES].includes(other.type);   // 관리자 → 점프 서버
  return { kind: 'admin', dir: inbound ? -sign : sign };
}

// 규칙에서 쓰는 조회 도구 모음
// includeAll: true면 검증 대상이 아닌 서비스도 포함 (개선·제거 제안용)
function buildContext(includeAll = false, s = state) {
  const nodes = includeAll ? s.nodes : s.nodes.filter(n => SVC_MAP[n.type].validated);
  const ids = new Set(nodes.map(n => n.id));
  const adj = new Map(nodes.map(n => [n.id, new Set()]));
  s.edges.forEach(ed => {
    if (!ids.has(ed.from) || !ids.has(ed.to)) return;
    adj.get(ed.from).add(ed.to);
    adj.get(ed.to).add(ed.from);
  });
  // 51번: 점프 서버(EC2)는 앱 서버가 아니다 → 종류로 찾을 때 빼고, bastions()로 따로 찾는다
  const bastionIds = new Set(nodes.filter(n => isBastion(n, s)).map(n => n.id));
  const pick = types => n => types.includes(n.type) && !bastionIds.has(n.id);
  return {
    // 해당 종류의 박스 목록 (점프 서버 빼고)
    ofType: (...types) => nodes.filter(pick(types)),
    // n과 직접 연결된 박스 중 해당 종류 (점프 서버 빼고)
    neighborsOf: (n, ...types) => [...adj.get(n.id)].map(id => findNode(id, s)).filter(pick(types)),
    // 51번: 역할
    bastions: () => nodes.filter(n => bastionIds.has(n.id)),
    roleOf: n => serverRoleOf(n, s),
    // 51-2: Load Balancer 종류
    isInternalLb: n => isInternalLb(n, s),
    internetLbs: () => nodes.filter(n => n.type === 'lb' && !isInternalLb(n, s)),
    zoneOf: n => zoneOf(n, s),
    azOf: n => azOf(n, s),
    nameOf: n => SVC_MAP[n.type].name,
    // 이 구성 전체 (검증 대상이 아닌 서비스도 포함)
    s,
    findNode: id => findNode(id, s),
    findContainer: id => findContainer(id, s),
    // 연결선으로 이어진 박스 중 해당 종류 (검증 대상이 아닌 서비스도 찾는다)
    linkedNodes: (n, ...types) => linkedNodesOf(s, n, ...types),
    subnetsIn: (az, ...types) => subnetsInOf(s, az, ...types),
    containerNodes: () => containerNodes(s),
    // Auto Scaling 그룹 영역과 그 안의 EC2
    asgGroups: () => s.containers.filter(c => c.type === 'asg').map(area => ({
      area,
      members: asgMembersOf(area, nodes),
    })),
  };
}

// 컨테이너 박스 (ECS·EKS·Fargate)
function containerNodes(s = state) {
  return s.nodes.filter(n => ['ecs', 'eks', 'fargate'].includes(n.type));
}

// EC2가 Session Manager와 이어졌는지
function ec2HasSessionManager(e, s = state) {
  return linkedNodesOf(s, e, 'sessionmanager').length > 0;
}

// 프라이빗 서브넷에 EC2가 있는 AZ 목록과, 그중 같은 AZ의 퍼블릭 서브넷에 NAT가 있는 AZ 목록
function natCoverage(ctx) {
  const azs = [...new Set(ctx.ofType(...APP_TYPES).filter(e => ctx.zoneOf(e) === 'private').map(ctx.azOf).filter(Boolean))];
  const covered = azs.filter(a => ctx.ofType('nat').some(n => ctx.zoneOf(n) === 'public' && ctx.azOf(n) === a));
  return { azs, covered };
}

// 사용자에서 출발해 요청이 닿는 박스 id 집합 (Route 53·WAF는 길이 아니므로 거치지 않음)
// R4: 시뮬레이션의 perfDistances와 같은 탐색이라 그 결과를 쓴다. 모든 서비스를 보는 탐색이므로
// 제안용 ctx(buildContext(true))에서만 쓴다 (검증 대상만 보는 ctx와는 닿는 범위가 다르다)
function requestReach(ctx) {
  return new Set(perfDistances(ctx.s).dist.keys());
}
