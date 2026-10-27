// @ts-check
// js/rules/context.js — 판정·제안·시뮬레이션이 함께 쓰는 조회 도구 (연결 상대, AZ, Auto Scaling 그룹 등)

// 박스가 속한 AZ 영역 (서브넷이면 그 부모 AZ, 없으면 null)
function azOf(n) {
  let c = findContainer(n.parentContainer);
  while (c && c.type !== 'az') c = findContainer(c.parentContainer);
  return c || null;
}

// Auto Scaling 그룹 영역 안의 EC2 (EC2 박스 중심이 영역 안에 있으면 그룹에 속함)
function asgMembersOf(area, nodes = state.nodes) {
  return nodes.filter(n => n.type === 'ec2' && inRect(rectOf(area), centerOf(n)));
}

// 연결선으로 이어진 박스 중 해당 종류 (검증 대상이 아닌 서비스도 찾는다)
function linkedNodes(n, ...types) {
  return state.edges
    .map(e => findNode(e.from === n.id ? e.to : e.to === n.id ? e.from : ''))
    .filter(m => m && types.includes(m.type));
}

// 규칙에서 쓰는 조회 도구 모음
// includeAll: true면 검증 대상이 아닌 서비스도 포함 (개선·제거 제안용)
function buildContext(includeAll = false) {
  const nodes = includeAll ? state.nodes : state.nodes.filter(n => SVC_MAP[n.type].validated);
  const ids = new Set(nodes.map(n => n.id));
  const adj = new Map(nodes.map(n => [n.id, new Set()]));
  state.edges.forEach(ed => {
    if (!ids.has(ed.from) || !ids.has(ed.to)) return;
    adj.get(ed.from).add(ed.to);
    adj.get(ed.to).add(ed.from);
  });
  return {
    // 해당 종류의 박스 목록
    ofType: (...types) => nodes.filter(n => types.includes(n.type)),
    // n과 직접 연결된 박스 중 해당 종류
    neighborsOf: (n, ...types) => [...adj.get(n.id)].map(findNode).filter(m => types.includes(m.type)),
    zoneOf,
    azOf,
    nameOf: n => SVC_MAP[n.type].name,
    // Auto Scaling 그룹 영역과 그 안의 EC2
    asgGroups: () => state.containers.filter(c => c.type === 'asg').map(area => ({
      area,
      members: asgMembersOf(area, nodes),
    })),
  };
}

// 컨테이너 박스 (ECS·EKS·Fargate는 검증 대상이 아니라 ctx에 없어 직접 찾는다)
function containerNodes() {
  return state.nodes.filter(n => ['ecs', 'eks', 'fargate'].includes(n.type));
}

// EC2가 Session Manager와 이어졌는지
function ec2HasSessionManager(e) {
  return linkedNodes(e, 'sessionmanager').length > 0;
}

// 프라이빗 서브넷에 EC2가 있는 AZ 목록과, 그중 같은 AZ의 퍼블릭 서브넷에 NAT가 있는 AZ 목록
function natCoverage(ctx) {
  const azs = [...new Set(ctx.ofType(...APP_TYPES).filter(e => ctx.zoneOf(e) === 'private').map(ctx.azOf).filter(Boolean))];
  const covered = azs.filter(a => ctx.ofType('nat').some(n => ctx.zoneOf(n) === 'public' && ctx.azOf(n) === a));
  return { azs, covered };
}

// 사용자에서 출발해 요청이 닿는 박스 id 집합 (Route 53·WAF는 길이 아니므로 거치지 않음)
function requestReach(ctx) {
  const PASS = SERVICES.map(s => s.type).filter(t => t !== 'waf' && t !== 'route53');
  const reached = new Set(ctx.ofType(...USER_TYPES).map(u => u.id));
  const queue = [...reached];
  for (let i = 0; i < queue.length; i++) {
    ctx.neighborsOf(findNode(queue[i]), ...PASS).forEach(m => {
      if (!reached.has(m.id)) { reached.add(m.id); queue.push(m.id); }
    });
  }
  return reached;
}
