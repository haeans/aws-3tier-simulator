// @ts-check
// js/rules/cost.js — 월 비용 계산 (47번). 화면에 기대지 않고 구성 s를 받는다
// 가격표는 js/data/cost.js (근거 criteria/cost.md). 결과는 "대략"이다: 사용량 요금은 넣지 않는다

// 박스 1개(서버 1대)의 월 비용과 이름. 시간·월 요금이 없는 박스면 null
// s: 박스가 든 구성 (VPC Endpoints는 이어진 서비스를 본다)
function nodeMonthlyCost(n, s = state) {
  const size = nodeSize(n);
  const P = COST_PRICE;
  const h = v => v * COST_HOURS;
  switch (n.type) {
    case 'ec2': return { name: `EC2 ${P.ec2.label[size]}`, monthly: h(P.ec2.hour[size]), doc: P.ec2.doc };
    case 'rds': return { name: `RDS ${P.rds.label[size]}`, monthly: h(P.rds.hour[size]), doc: P.rds.doc };
    case 'rds-replica': return { name: `RDS Read Replica ${P.rds.label[size]}`, monthly: h(P.rds.hour[size]), doc: P.rds.doc };
    // Multi-AZ는 Single-AZ의 2배 → 늘어난 몫(같은 크기 1대 값)을 Standby 박스에 붙인다 (C2)
    case 'rds-standby': return { name: `RDS Standby (Multi-AZ 예비본) ${P.rds.label[size]}`, monthly: h(P.rds.hour[size]), doc: P.rds.doc };
    case 'fargate': {
      const [cpu, gb] = P.fargate.size[size];
      return { name: `Fargate 작업 ${cpu} vCPU·${gb} GB`, monthly: h(cpu * P.fargate.vcpu + gb * P.fargate.gb), doc: P.fargate.doc };
    }
    case 'vpce': {   // 이어진 인터페이스형 서비스마다 AZ 수만큼 (C6). S3·DynamoDB(게이트웨이형)는 무료
      const iface = [...new Set(linkedNodesOf(s, n, ...COST_VPCE_IFACE).map(x => x.type))].length;
      if (!iface) return null;
      return { name: `VPC Endpoints (인터페이스 ${iface}개 × AZ ${COST_VPCE_AZS}곳)`, monthly: h(P.vpce.hour * iface * COST_VPCE_AZS), doc: P.vpce.doc };
    }
    default: {
      const p = P[n.type];
      if (!p) return null;
      const name = `${SVC_MAP[n.type].name} ${p.label}`;
      if (p.month !== undefined) return { name, monthly: p.month, doc: p.doc };
      if (typeof p.hour === 'number') return { name, monthly: h(p.hour), doc: p.doc };
      return null;
    }
  }
}

// 구성의 월 비용. 돌려주는 값:
// { rows: [{ name, count, unit(1개 월), monthly(합), doc, note }], total, usage: [서비스 이름], free: [서비스 이름], onprem: [회사 비용 박스 이름] }
// Auto Scaling 그룹 안 EC2는 최소 대수 기준 (늘어나면 그만큼 더)
function costOf(s = state) {
  const counts = new Map();   // 박스 id → 대수
  s.nodes.forEach(n => counts.set(n.id, 1));
  const asgIds = new Set();
  s.containers.filter(c => c.type === 'asg').forEach(area => {
    const members = asgMembersOf(area, s.nodes);
    if (!members.length) return;
    asgStartCounts(members, asgSettings(area, members.length).min).forEach((c, id) => { counts.set(id, c); asgIds.add(id); });
  });
  const rows = new Map();
  s.nodes.forEach(n => {
    const c = nodeMonthlyCost(n, s);
    if (!c) return;
    const key = c.name + (asgIds.has(n.id) ? ' asg' : '');
    const row = rows.get(key) || { name: c.name, count: 0, unit: c.monthly, monthly: 0, doc: c.doc,
      note: asgIds.has(n.id) ? 'Auto Scaling 최소 대수 기준 (늘어나면 그만큼 더)' : '' };
    row.count += counts.get(n.id);
    row.monthly += c.monthly * counts.get(n.id);
    rows.set(key, row);
  });
  // 48번: IDC ↔ VPC 연결 (고객 게이트웨이—VGW 선 하나마다 VPN 연결 또는 Direct Connect 포트)
  s.edges.forEach(ed => {
    const a = findNode(ed.from, s), b = findNode(ed.to, s);
    if (!a || !b || [a.type, b.type].sort().join() !== 'cgw,vgw') return;
    const kind = edgeInfo(a.type, b.type, ed.kind || null).kind;
    const p = COST_PRICE[kind];
    if (!p) return;
    const row = rows.get(kind) || { name: p.label, count: 0, unit: p.hour * COST_HOURS, monthly: 0, doc: p.doc, note: 'VGW 포함, 데이터 전송 요금 별도' };
    row.count += 1;
    row.monthly += p.hour * COST_HOURS;
    rows.set(kind, row);
  });
  const names = types => [...new Set(s.nodes.filter(n => types.includes(n.type)).map(n => SVC_MAP[n.type].name))];
  const order = t => { const i = SERVICES.findIndex(sv => t.startsWith(sv.name)); return i < 0 ? SERVICES.length : i; };   // 팔레트 순서로 (연결 요금은 맨 뒤)
  const list = [...rows.values()].sort((a, b) => order(a.name) - order(b.name));
  return {
    rows: list,
    total: list.reduce((sum, r) => sum + r.monthly, 0),
    usage: names(COST_USAGE),
    free: names(COST_FREE),
    onprem: names(COST_ONPREM),   // 48번
  };
}
