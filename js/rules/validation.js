// js/rules/validation.js — 검증 규칙 7개 (정상/경고/오류) + 검증 실행

/* =========================================================
   검증 규칙
   - validated: true 인 서비스만 검증에 사용
   - "연결" = 두 박스 사이의 직접 연결선, 방향 구분 없음
   - check(ctx)는 문제 목록 [{ message, nodeIds }]을 돌려준다 (빈 배열 = 통과)
   ========================================================= */
const USER_TYPES = ['smartphone', 'tablet', 'pc'];
const RDS_TYPES  = ['rds', 'rds-replica', 'rds-standby'];

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
    // 박스가 속한 AZ (서브넷이면 그 부모 AZ)
    azOf: n => {
      let c = findContainer(n.parentContainer);
      while (c && c.type !== 'az') c = findContainer(c.parentContainer);
      return c || null;
    },
    nameOf: n => SVC_MAP[n.type].name,
  };
}

const VALIDATION_RULES = [
  {
    id: 1, level: 'error', message: '진입 경로',
    check(ctx) {
      const users = ctx.ofType(...USER_TYPES), igws = ctx.ofType('igw'), lbs = ctx.ofType('lb');
      const missing = [];
      if (!users.length) missing.push('사용자(스마트폰/태블릿/PC)');
      if (!igws.length)  missing.push('IGW');
      if (!lbs.length)   missing.push('Load Balancer');
      if (missing.length) {
        return [{ message: `${missing.join(', ')}가 없어요. 사용자 → IGW → Load Balancer로 들어오는 길이 필요해요.` }];
      }
      // Load Balancer와 연결된 IGW
      const gates = igws.filter(i => ctx.neighborsOf(i, 'lb').length);
      if (!gates.length) {
        return [{ message: 'IGW와 Load Balancer가 연결되어 있지 않아요. 인터넷 요청이 Load Balancer로 가도록 둘을 연결해주세요.' }];
      }
      // 사용자 — IGW 또는 사용자 — CloudFront — IGW
      const reached = gates.some(i =>
        ctx.neighborsOf(i, ...USER_TYPES).length ||
        ctx.neighborsOf(i, 'cloudfront').some(cf => ctx.neighborsOf(cf, ...USER_TYPES).length));
      if (!reached) {
        return [{ message: '사용자가 IGW까지 닿지 않아요. 사용자를 IGW에 직접 연결하거나, CloudFront를 거쳐 IGW에 연결해주세요.' }];
      }
      return [];
    },
  },
  {
    id: 2, level: 'error', message: '계층 배치',
    check(ctx) {
      const issues = [];
      ctx.ofType('igw').forEach(n => {
        if (SUBNET_TYPES.includes(ctx.zoneOf(n))) issues.push({ nodeIds: [n.id],
          message: 'IGW는 서브넷 안에 두지 않아요. VPC 경계(서브넷 바깥)에 놓아주세요.' });
      });
      ctx.ofType('lb').forEach(n => {
        if (ctx.zoneOf(n) !== 'public') issues.push({ nodeIds: [n.id],
          message: 'Load Balancer는 퍼블릭 서브넷에 있어야 인터넷에서 오는 요청을 받을 수 있어요.' });
      });
      ctx.ofType('ec2').forEach(n => {
        if (ctx.zoneOf(n) !== 'private') issues.push({ nodeIds: [n.id],
          message: 'EC2 앱 서버는 프라이빗 서브넷에 두어야 외부에서 직접 접근할 수 없어요.' });
      });
      return issues;
    },
  },
  {
    id: 3, level: 'error', message: '흐름 연결',
    check(ctx) {
      const lbs = ctx.ofType('lb'), ec2s = ctx.ofType('ec2');
      if (!lbs.length && !ec2s.length) return [{ message: 'Load Balancer와 EC2가 없어요.' }];
      if (!lbs.length)  return [{ message: 'Load Balancer가 없어요. 요청을 EC2로 나눠줄 Load Balancer가 필요해요.' }];
      if (!ec2s.length) return [{ message: 'EC2(앱 서버)가 없어요. 요청을 처리할 EC2가 필요해요.' }];
      if (!lbs.some(lb => ctx.neighborsOf(lb, 'ec2').length)) {
        return [{ message: 'Load Balancer와 EC2가 연결되어 있지 않아요. Load Balancer가 받은 요청을 EC2로 넘기도록 연결해주세요.' }];
      }
      return [];
    },
  },
  {
    id: 4, level: 'error', message: 'DB 보호',
    check(ctx) {
      const issues = [];
      ctx.ofType(...RDS_TYPES).forEach(db => {
        const name = ctx.nameOf(db);
        if (ctx.zoneOf(db) !== 'db') issues.push({ nodeIds: [db.id],
          message: `${eunNeun(name)} DB 서브넷에 있어야 해요. 데이터는 가장 안쪽에 두어 보호해요.` });
        ctx.neighborsOf(db, ...USER_TYPES, 'igw').forEach(other => issues.push({ nodeIds: [db.id, other.id],
          message: `DB가 인터넷에 직접 노출돼 있어요. ${name} — ${ctx.nameOf(other)} 연결을 지우고 앱 서버(EC2)를 거치도록 연결해주세요.` }));
        ctx.neighborsOf(db, 'dbadmin').forEach(admin => issues.push({ nodeIds: [db.id, admin.id],
          message: `DB 관리자가 ${name}에 직접 연결돼 있어요. Client VPN을 거쳐서 접속하도록 연결해주세요.` }));
      });
      return issues;
    },
  },
  {
    id: 5, level: 'error', message: '앱-DB 연결',
    check(ctx) {
      const ec2s = ctx.ofType('ec2'), rdss = ctx.ofType('rds');
      if (!ec2s.length && !rdss.length) return [{ message: 'EC2와 RDS가 없어요.' }];
      if (!rdss.length) return [{ message: 'RDS가 없어요. 앱 서버가 데이터를 저장할 RDS가 필요해요.' }];
      if (!ec2s.length) return [{ message: 'EC2(앱 서버)가 없어요. RDS를 사용할 EC2가 필요해요.' }];
      if (!ec2s.some(n => ctx.neighborsOf(n, 'rds').length)) {
        return [{ message: 'EC2와 RDS가 연결되어 있지 않아요. 앱 서버가 DB를 쓸 수 있도록 연결해주세요.' }];
      }
      return [];
    },
  },
  {
    id: 6, level: 'warn', message: '외부 통신',
    check(ctx) {
      const privateEc2 = ctx.ofType('ec2').filter(n => ctx.zoneOf(n) === 'private');
      if (!privateEc2.length) return [];
      const nats = ctx.ofType('nat');
      if (nats.some(n => ctx.zoneOf(n) === 'public')) return [];
      return [{
        nodeIds: nats.map(n => n.id),
        message: nats.length
          ? 'NAT가 퍼블릭 서브넷에 있지 않아요. 프라이빗 서브넷의 EC2가 인터넷으로 나가려면(업데이트 등) NAT가 퍼블릭 서브넷에 있어야 해요.'
          : 'NAT가 없어요. 프라이빗 서브넷의 EC2가 업데이트 등을 위해 인터넷으로 나갈 수 있도록 퍼블릭 서브넷에 NAT를 놓아주세요.',
      }];
    },
  },
  {
    id: 7, level: 'warn', message: '고가용성',
    check(ctx) {
      const issues = [];
      // EC2: 서로 다른 AZ에 2개 이상
      const ec2s = ctx.ofType('ec2');
      const ec2Azs = new Set(ec2s.map(ctx.azOf).filter(Boolean));
      if (ec2Azs.size < 2) issues.push({
        nodeIds: ec2s.map(n => n.id),
        message: ec2Azs.size === 0
          ? 'EC2가 AZ 안에 없어요. 서로 다른 AZ에 EC2를 2개 이상 두면 한 AZ에 장애가 나도 서비스가 계속돼요.'
          : 'EC2가 한 AZ에만 있어요. 다른 AZ에도 EC2를 두면 한 AZ에 장애가 나도 서비스가 계속돼요.',
      });
      // RDS: RDS와 RDS Standby가 서로 다른 AZ
      const rdss = ctx.ofType('rds'), standbys = ctx.ofType('rds-standby');
      const paired = rdss.some(r => standbys.some(s => {
        const a = ctx.azOf(r), b = ctx.azOf(s);
        return a && b && a !== b;
      }));
      if (!paired) issues.push({
        nodeIds: [...rdss, ...standbys].map(n => n.id),
        message: !rdss.length
          ? 'RDS가 없어서 DB 이중화를 확인할 수 없어요.'
          : !standbys.length
            ? 'RDS Standby가 없어요. 다른 AZ에 RDS Standby를 두면 DB 장애 때 자동으로 넘어갈 수 있어요.'
            : 'RDS와 RDS Standby가 서로 다른 AZ에 있지 않아요. 두 박스를 서로 다른 AZ의 DB 서브넷에 놓아주세요.',
      });
      return issues;
    },
  },
];

// 모든 규칙을 실행해 결과를 만든다
function validateArchitecture() {
  const ctx = buildContext();
  const issues = [];
  VALIDATION_RULES.forEach(rule => {
    rule.check(ctx).forEach(it => issues.push({ rule, message: it.message, nodeIds: it.nodeIds || [] }));
  });
  // 박스별 강조 단계 (오류가 경고보다 우선)
  const nodeLevels = new Map();
  issues.forEach(i => i.nodeIds.forEach(id => {
    if (i.rule.level === 'error' || !nodeLevels.has(id)) nodeLevels.set(id, i.rule.level);
  }));
  const status = issues.some(i => i.rule.level === 'error') ? 'error' : issues.length ? 'warn' : 'ok';

  // 개선·제거 제안 (판정과 별개)
  const allCtx = buildContext(true);
  const suggestions = [];
  SUGGESTION_RULES.forEach(rule => {
    rule.check(allCtx).forEach(it => suggestions.push({ rule, reason: it.reason, action: it.action, nodeIds: it.nodeIds || [] }));
  });
  const suggestNodes = new Set(suggestions.flatMap(s => s.nodeIds).filter(id => !nodeLevels.has(id)));
  return { status, issues, nodeLevels, suggestions, suggestNodes };
}

