// @ts-check
// js/rules/validation.js — 검증 규칙 19개 (정상/경고/오류) + 검증 실행

/* =========================================================
   검증 규칙
   - validated: true 인 서비스만 검증에 사용
   - "연결" = 두 박스 사이의 직접 연결선, 방향 구분 없음
   - check(ctx)는 문제 목록 [{ message, nodeIds }]을 돌려준다 (빈 배열 = 통과)
   - pillars / basis: Well-Architected 기준 태그와 근거 (js/data/guide.js의 PILLARS)
   ========================================================= */

// praise(ctx): 이 규칙에 걸린 문제가 없을 때, 좋은 구성이 실제로 있으면 [{ text, nodeIds }]를 돌려준다 (잘한 점)
//   문제가 없어도 해당 박스가 아예 없으면 칭찬하지 않는다 (규칙 통과 ≠ 잘한 점)
const VALIDATION_RULES = [
  {
    // 근거: LB-04 (공개 LB에는 IGW가 필요)
    id: 1, level: 'error', message: '진입 경로',
    pillars: ['security', 'reliability'],
    basis: '인터넷 요청은 Load Balancer 같은 공개 입구로만 받고 서버는 숨겨요. Load Balancer는 정상인 서버에만 요청을 보내서 한 서버가 멈춰도 버텨요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_network_protection_create_layers.html',
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
    // 근거: LB-05(칭찬만 막음) — IGW와 이어지지 않은 LB가 하나라도 있거나, 서버(EC2)가 인터넷과 바로 이어져 있으면 칭찬하지 않는다
    praise(ctx) {
      const lbs = ctx.ofType('lb');
      if (lbs.some(lb => !ctx.neighborsOf(lb, 'igw').length)) return [];
      if (ctx.ofType(...APP_TYPES).some(e => ctx.neighborsOf(e, 'igw', ...USER_TYPES).length)) return [];
      return [{ nodeIds: ctx.ofType('igw', 'lb').map(n => n.id),
        text: '인터넷 요청이 IGW를 지나 Load Balancer라는 한 입구로만 들어와요. 서버는 인터넷에 직접 드러나지 않아요.' }];
    },
  },
  {
    // 근거: IGW-01, SRV-08
    id: 2, level: 'error', message: '계층 배치',
    pillars: ['security'],
    basis: '계층마다 네트워크를 나눠 보호해요. 인터넷 요청을 받는 Load Balancer는 퍼블릭 서브넷에, 앱 서버(EC2)는 프라이빗 서브넷에 둬요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_network_protection_create_layers.html',
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
      // 근거: SRV-08 — 퍼블릭 서브넷의 EC2는 문서가 금지하지 않으므로 오류가 아니라 경고(규칙 11). 서브넷 밖·DB 서브넷은 오류 유지
      ctx.ofType(...APP_TYPES).forEach(n => {
        if (!['private', 'public'].includes(ctx.zoneOf(n))) issues.push({ nodeIds: [n.id],
          message: 'EC2 앱 서버는 프라이빗 서브넷에 두어야 외부에서 직접 접근할 수 없어요.' });
      });
      return issues;
    },
    praise(ctx) {
      const lbs = ctx.ofType('lb'), ec2s = ctx.ofType(...APP_TYPES);
      if (!lbs.length || !ec2s.length) return [];
      // 근거: IGW-03 — 서버가 인터넷과 바로 이어져 있으면 "숨겼다"고 칭찬하지 않는다. SRV-08 — 퍼블릭 서브넷의 EC2가 있어도 마찬가지
      if (ec2s.some(e => ctx.neighborsOf(e, 'igw', ...USER_TYPES).length)) return [];
      if (ec2s.some(e => ctx.zoneOf(e) !== 'private')) return [];
      return [{ nodeIds: [...lbs, ...ec2s].map(n => n.id),
        text: 'Load Balancer는 퍼블릭 서브넷, EC2는 프라이빗 서브넷에 나눠 두었어요. 앱 서버를 인터넷에서 숨겼어요.' }];
    },
  },
  {
    // 근거: SRV-05 (Auto Scaling 그룹의 EC2도 LB와 이어져야 한다)
    id: 3, level: 'error', message: '흐름 연결',
    pillars: ['reliability'],
    basis: 'Load Balancer가 여러 EC2에 요청을 나누고 상태 확인으로 정상인 EC2에만 보내야, 한 서버가 멈춰도 서비스가 이어져요.',
    ref: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html',
    check(ctx) {
      const lbs = ctx.ofType('lb'), ec2s = ctx.ofType(...APP_TYPES);
      if (!lbs.length && !ec2s.length) return [{ message: 'Load Balancer와 EC2가 없어요.' }];
      if (!lbs.length)  return [{ message: 'Load Balancer가 없어요. 요청을 EC2로 나눠줄 Load Balancer가 필요해요.' }];
      if (!ec2s.length) return [{ message: 'EC2(앱 서버)가 없어요. 요청을 처리할 EC2가 필요해요.' }];
      if (!lbs.some(lb => ctx.neighborsOf(lb, ...APP_TYPES).length)) {
        return [{ message: 'Load Balancer와 EC2가 연결되어 있지 않아요. Load Balancer가 받은 요청을 EC2로 넘기도록 연결해주세요.' }];
      }
      return [];
    },
  },
  {
    id: 4, level: 'error', message: 'DB 보호',
    pillars: ['security'],
    basis: 'DB는 앱 계층과 다른 프라이빗 서브넷에 두고, 꼭 필요한 곳(앱 서버·VPN)에서 오는 연결만 허용해요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_network_protection_layered.html',
    check(ctx) {
      const issues = [];
      ctx.ofType(...RDS_TYPES).forEach(db => {
        const name = ctx.nameOf(db);
        // 근거: DB-05 — 서브넷 안(DB·프라이빗·퍼블릭)이면 오류가 아니다. 퍼블릭은 규칙 12(경고), 프라이빗은 제안 14. 서브넷 밖만 오류
        if (!['db', 'private', 'public'].includes(ctx.zoneOf(db))) issues.push({ nodeIds: [db.id],
          message: `${eunNeun(name)} 서브넷 안에 있어야 해요. DB 서브넷(없으면 프라이빗 서브넷)에 놓아 인터넷에서 숨겨요.` });
        ctx.neighborsOf(db, ...USER_TYPES, 'igw').forEach(other => issues.push({ nodeIds: [db.id, other.id],
          message: `DB가 인터넷에 직접 노출돼 있어요. ${name} — ${ctx.nameOf(other)} 연결을 지우고 앱 서버(EC2)를 거치도록 연결해주세요.` }));
        ctx.neighborsOf(db, 'dbadmin').forEach(admin => issues.push({ nodeIds: [db.id, admin.id],
          message: `DB 관리자가 ${name}에 직접 연결돼 있어요. Client VPN을 거쳐서 접속하도록 연결해주세요.` }));
      });
      return issues;
    },
    praise(ctx) {
      const dbs = ctx.ofType(...RDS_TYPES);
      if (!dbs.length) return [];
      // 근거: CF-01·R53-02·LB-07 — CloudFront·Route 53·WAF·Load Balancer가 DB에 바로 이어져 있으면 "인터넷과 바로 이어지지 않는다"고 칭찬하지 않는다
      // (LB—RDS는 오류·경고 근거가 없어(등급 X) 판정은 그대로 두고 칭찬만 막는다. Route 53·WAF는 검증 대상이 아니라 ctx에 없으므로 연결선에서 직접 찾는다)
      const exposed = dbs.some(db => state.edges.some(e => {
        const other = findNode(e.from === db.id ? e.to : e.to === db.id ? e.from : '');
        return other && ['cloudfront', 'route53', 'waf', 'lb'].includes(other.type);
      }));
      if (exposed) return [];
      // 근거: DB-05 — 칭찬은 모든 DB가 DB 서브넷에 있을 때만 (프라이빗은 오류는 아니지만 칭찬은 아님, 퍼블릭은 경고)
      if (dbs.some(db => ctx.zoneOf(db) !== 'db')) return [];
      return [{ nodeIds: dbs.map(n => n.id),
        text: 'DB를 DB 서브넷에 두고 인터넷과 바로 이어지지 않게 했어요. 데이터를 가장 안쪽에서 보호해요.' }];
    },
  },
  {
    id: 5, level: 'error', message: '앱-DB 연결',
    pillars: [],
    basis: '앱 계층(EC2)이 데이터 계층(RDS)에 접속해야 세 계층이 이어져요. 같은 VPC의 EC2 앱 서버가 RDS를 쓰는 것이 기본 구성이에요.',
    ref: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.Scenarios.html',
    check(ctx) {
      const ec2s = ctx.ofType(...APP_TYPES), rdss = ctx.ofType('rds');
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
    pillars: ['security', 'operations'],
    basis: '퍼블릭 서브넷의 NAT 게이트웨이를 쓰면 프라이빗 서버는 밖으로 연결할 수 있고, 밖에서 먼저 들어오는 연결은 받지 않아요.',
    ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html',
    check(ctx) {
      const privateEc2 = ctx.ofType(...APP_TYPES).filter(n => ctx.zoneOf(n) === 'private');
      if (!privateEc2.length) return [];
      const nats = ctx.ofType('nat');
      // 근거: NAT-01 — NAT는 모두 퍼블릭 서브넷에 있어야 한다 (하나만 맞아도 통과시키지 않음)
      if (!nats.length) return [{
        nodeIds: [],
        message: 'NAT가 없어요. 프라이빗 서브넷의 EC2가 업데이트 등을 위해 인터넷으로 나갈 수 있도록 퍼블릭 서브넷에 NAT를 놓아주세요.',
      }];
      const misplaced = nats.filter(n => ctx.zoneOf(n) !== 'public');
      if (!misplaced.length) return [];
      return [{
        nodeIds: misplaced.map(n => n.id),
        message: 'NAT가 퍼블릭 서브넷에 있지 않아요. 프라이빗 서브넷의 EC2가 인터넷으로 나가려면(업데이트 등) NAT가 퍼블릭 서브넷에 있어야 해요.',
      }];
    },
    praise(ctx) {
      const all = ctx.ofType('nat');
      const nats = all.filter(n => ctx.zoneOf(n) === 'public');
      if (!nats.length || nats.length < all.length || !ctx.ofType(...APP_TYPES).some(n => ctx.zoneOf(n) === 'private')) return [];
      return [{ nodeIds: nats.map(n => n.id),
        text: 'NAT를 퍼블릭 서브넷에 두었어요. 앱 서버는 숨긴 채로 업데이트처럼 밖으로 나가는 연결만 할 수 있어요.' }];
    },
  },
  {
    // 근거: SRV-02, LB-02, DB-04, SRV-05
    id: 7, level: 'warn', message: '고가용성',
    pillars: ['reliability'],
    basis: '운영 중인 서비스는 최소 두 AZ에 나눠 둬요. RDS는 Multi-AZ를 켜야 다른 AZ에 예비본이 생겨, 한 AZ에 장애가 나도 이어갈 수 있어요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html',
    check(ctx) {
      const issues = [];
      // EC2: 서로 다른 AZ에 2개 이상
      const ec2s = ctx.ofType(...APP_TYPES);
      const ec2Azs = new Set(ec2s.map(ctx.azOf).filter(Boolean));
      if (ec2Azs.size < 2) issues.push({
        nodeIds: ec2s.map(n => n.id),
        message: ec2Azs.size === 0
          ? 'EC2가 AZ 안에 없어요. 서로 다른 AZ에 EC2를 2개 이상 두면 한 AZ에 장애가 나도 서비스가 계속돼요.'
          : 'EC2가 한 AZ에만 있어요. 다른 AZ에도 EC2를 두면 한 AZ에 장애가 나도 서비스가 계속돼요.',
      });
      // 근거: LB-02 — Load Balancer와 연결된 EC2가 서로 다른 AZ 2곳 이상 (연결이 있는 LB만 본다. 연결이 없으면 규칙 3이 알림)
      ctx.ofType('lb').forEach(lb => {
        const targets = ctx.neighborsOf(lb, ...APP_TYPES);
        if (!targets.length || new Set(targets.map(ctx.azOf).filter(Boolean)).size >= 2) return;
        issues.push({
          nodeIds: [lb.id, ...targets.map(n => n.id)],
          message: 'Load Balancer와 연결된 EC2가 한 AZ에만 있어요. Load Balancer는 여러 AZ에 걸쳐 쓰는 것이니, 다른 AZ의 EC2도 같은 Load Balancer와 연결해주세요.',
        });
      });
      // RDS: RDS와 RDS Standby가 서로 다른 AZ
      const rdss = ctx.ofType('rds'), standbys = ctx.ofType('rds-standby');
      // 근거: DB-04 — RDS(본체)마다 서로 다른 AZ의 Standby와 1대1로 짝이 맞아야 한다 (Standby 하나로 RDS 둘을 덮지 않음)
      const taken = new Set();
      const unpaired = rdss.filter(r => {
        const s = standbys.find(s => {
          const a = ctx.azOf(r), b = ctx.azOf(s);
          return !taken.has(s.id) && a && b && a !== b;
        });
        if (s) taken.add(s.id);
        return !s;
      });
      const paired = !unpaired.length;
      if (!paired) issues.push({
        nodeIds: [...rdss, ...standbys].map(n => n.id),
        message: !rdss.length
          ? 'RDS가 없어서 DB 이중화를 확인할 수 없어요.'
          : !standbys.length
            ? 'RDS Standby가 없어요. 다른 AZ에 RDS Standby를 두면 DB 장애 때 자동으로 넘어갈 수 있어요.'
            : standbys.length < rdss.length
              ? `RDS가 ${rdss.length}개인데 RDS Standby가 ${standbys.length}개뿐이에요. RDS마다 다른 AZ에 RDS Standby를 하나씩 두세요.`
              : 'RDS와 RDS Standby가 서로 다른 AZ에 있지 않아요. 두 박스를 서로 다른 AZ의 DB 서브넷에 놓아주세요.',
      });
      return issues;
    },
    praise: ctx => [{ nodeIds: ctx.ofType(...APP_TYPES, 'rds', 'rds-standby').map(n => n.id),
      text: 'EC2와 DB(RDS·Standby)를 두 AZ에 나눠 두었어요. 한 AZ에 장애가 나도 서비스가 이어져요.' }],
  },
  {
    // 근거: IGW-02 (등급 A), SRV-07
    id: 8, level: 'error', message: '서버 경로',
    pillars: ['security'],
    basis: '프라이빗 서브넷에는 IGW로 가는 경로가 없어서, 서버(EC2)를 IGW에 바로 이을 수 없어요. 인터넷 요청은 퍼블릭 서브넷의 Load Balancer가 받아 서버로 넘겨요.',
    ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html',
    check(ctx) {
      const issues = [];
      ctx.ofType(...APP_TYPES).forEach(e => {
        if (!['private', 'db'].includes(ctx.zoneOf(e))) return;   // 서브넷 밖·퍼블릭 위치는 규칙 2가 알림
        ctx.neighborsOf(e, 'igw').forEach(igw => issues.push({ nodeIds: [e.id, igw.id],
          message: 'EC2가 IGW에 바로 연결돼 있어요. 프라이빗 서브넷의 서버는 IGW로 인터넷과 통신할 수 없어요. 이 연결을 지우고 IGW → Load Balancer → EC2로 이어주세요.' }));
      });
      return issues;
    },
  },
  {
    // 근거: IGW-03 (등급 B), SRV-07
    id: 9, level: 'warn', message: '서버 노출',
    pillars: ['security'],
    basis: '서버(EC2)는 공개 IP 없이 Load Balancer 뒤에 두는 것이 안전해요. 사용자가 서버에 바로 닿으면 공격받을 곳이 늘어요.',
    ref: 'https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html',
    check(ctx) {
      const issues = [];
      ctx.ofType(...APP_TYPES).forEach(e => ctx.neighborsOf(e, ...USER_TYPES).forEach(u => issues.push({ nodeIds: [e.id, u.id],
        message: `${ctx.nameOf(u)}가 EC2에 바로 연결돼 있어요. 서버가 인터넷에 드러나요. 이 연결을 지우고 사용자 → IGW → Load Balancer → EC2로 이어주세요.` })));
      return issues;
    },
  },
  {
    // 근거: NAT-03 (등급 A)
    id: 10, level: 'error', message: 'NAT 방향',
    pillars: ['security'],
    basis: 'NAT는 VPC 안에서 밖으로 나가는 연결만 도와요. 인터넷 쪽에서 먼저 NAT로 들어오는 연결은 만들 수 없어요.',
    ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html',
    check(ctx) {
      const issues = [];
      ctx.ofType('nat').forEach(n => ctx.neighborsOf(n, ...USER_TYPES).forEach(u => issues.push({ nodeIds: [n.id, u.id],
        message: `${ctx.nameOf(u)}가 NAT에 연결돼 있어요. 인터넷 쪽에서 먼저 NAT로 들어올 수는 없어요. 이 연결을 지우고 사용자 → IGW → Load Balancer로 들어오게 해주세요.` })));
      return issues;
    },
  },
  {
    // 근거: SRV-08 (등급 B)
    id: 11, level: 'warn', message: '서버 위치',
    pillars: ['security'],
    basis: '서버(EC2)는 프라이빗 서브넷에 두는 것이 안전해요. 퍼블릭 서브넷에 두면 공개 IP를 받아 인터넷에 드러날 수 있어요.',
    ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html',
    check(ctx) {
      return ctx.ofType('ec2').filter(n => ctx.zoneOf(n) === 'public').map(n => ({ nodeIds: [n.id],
        message: 'EC2가 퍼블릭 서브넷에 있어요. 인터넷에 드러날 수 있으니 프라이빗 서브넷에 두는 것이 안전해요. (관리용 접속이 목적이라면 Session Manager를 쓰세요.)' }));
    },
  },
  {
    // 근거: DB-05 (등급 B) — 퍼블릭 서브넷의 DB (RDS.2는 공개 접속 금지, 공개 접속은 서브넷이 공개일 때만 가능)
    id: 12, level: 'warn', message: 'DB 위치',
    pillars: ['security'],
    basis: 'DB는 프라이빗 서브넷에 두는 것이 안전해요. 서브넷이 공개(퍼블릭)이면 공개 접속을 켰을 때 인터넷에서 DB에 닿을 수 있어요.',
    ref: 'https://docs.aws.amazon.com/securityhub/latest/userguide/rds-controls.html',
    check(ctx) {
      return ctx.ofType(...RDS_TYPES).filter(db => ctx.zoneOf(db) === 'public').map(db => ({ nodeIds: [db.id],
        message: `${eunNeun(ctx.nameOf(db))} 퍼블릭 서브넷에 있어요. 인터넷에서 닿을 수 있는 자리예요. DB 서브넷(또는 프라이빗 서브넷)으로 옮겨주세요.` }));
    },
  },
  {
    // 근거: DB-02 (등급 A)
    id: 13, level: 'error', message: 'Standby 접속',
    pillars: ['reliability'],
    basis: 'RDS Standby는 장애를 대비한 예비본이라 읽기·쓰기 요청을 받지 않아요. 앱 서버는 RDS(본체)나 Read Replica에 접속해요.',
    ref: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html',
    check(ctx) {
      const issues = [];
      ctx.ofType('rds-standby').forEach(s => ctx.neighborsOf(s, ...APP_TYPES).forEach(e => issues.push({ nodeIds: [s.id, e.id],
        message: 'EC2가 RDS Standby에 바로 연결돼 있어요. Standby는 읽기·쓰기를 받지 않아요. 이 연결을 지우고 EC2 — RDS(본체)로 연결해주세요.' })));
      return issues;
    },
  },
  {
    // 근거: DB-03 (등급 A)
    id: 14, level: 'error', message: 'Replica 원본',
    pillars: ['reliability'],
    basis: 'Read Replica는 이미 있는 RDS를 원본으로 만들어요. RDS 없이 Replica만 있을 수 없어요.',
    ref: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html',
    check(ctx) {
      const replicas = ctx.ofType('rds-replica');
      if (!replicas.length || ctx.ofType('rds').length) return [];
      return [{ nodeIds: replicas.map(n => n.id),
        message: 'RDS Read Replica는 있는데 원본이 될 RDS가 없어요. Replica는 RDS를 복사해서 만드니, RDS를 먼저 놓아주세요.' }];
    },
  },
  {
    // 근거: DB-01 (등급 A)
    id: 15, level: 'error', message: 'DB 서브넷 AZ',
    pillars: ['reliability'],
    basis: 'RDS를 만들려면 VPC에 서로 다른 AZ의 서브넷이 2개 이상 필요해요. AZ 하나뿐이면 만들 수 없어요.',
    ref: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html',
    check(ctx) {
      const dbs = ctx.ofType(...RDS_TYPES);
      const subnets = state.containers.filter(c => SUBNET_TYPES.includes(c.type));
      if (!dbs.length || !subnets.length) return [];   // 서브넷이 아예 없으면 규칙 4가 알림
      const azIds = new Set(subnets.map(c => c.parentContainer).filter(id => findContainer(id)?.type === 'az'));
      if (azIds.size >= 2) return [];
      return [{ nodeIds: dbs.map(n => n.id),
        message: 'RDS는 서로 다른 AZ의 서브넷이 2개 이상 있어야 만들 수 있어요. 다른 AZ를 추가하고 그 안에 서브넷을 만들어주세요.' }];
    },
  },
  {
    // 근거: SSM-01 (근거 A, 라우팅을 표현하지 못해 화면은 경고)
    id: 16, level: 'warn', message: 'Session Manager 경로',
    pillars: ['security', 'operations'],
    basis: 'Session Manager는 서버가 AWS 쪽으로 먼저 연결해요. 인터넷으로 나갈 수 없는 프라이빗 서브넷의 서버는 NAT나 VPC Endpoints(ssm·ssmmessages)가 있어야 닿아요.',
    ref: 'https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-create-vpc.html',
    check(ctx) {
      const issues = [];
      ctx.ofType('ec2').filter(e => ctx.zoneOf(e) === 'private').forEach(e => {
        const sms = linkedNodes(e, 'sessionmanager');
        if (!sms.length || ctx.neighborsOf(e, 'nat').length) return;
        const bare = sms.filter(sm => !linkedNodes(sm, 'vpce').length);
        if (bare.length !== sms.length) return;
        issues.push({ nodeIds: [e.id, ...sms.map(n => n.id)],
          message: '프라이빗 서브넷의 EC2가 Session Manager에 닿을 길이 없어 보여요. NAT에 연결하거나, VPC Endpoints를 Session Manager와 연결해주세요.' });
      });
      return issues;
    },
  },
  {
    // 근거: CTR-01 (등급 B, Security Hub ECS.2)
    id: 17, level: 'warn', message: '컨테이너 위치',
    pillars: ['security'],
    basis: '컨테이너(ECS·EKS·Fargate)는 프라이빗 서브넷에 두는 것이 안전해요. 퍼블릭 서브넷에서 공개 IP를 받으면 인터넷에 드러날 수 있어요.',
    ref: 'https://docs.aws.amazon.com/securityhub/latest/userguide/ecs-controls.html',
    check() {
      return containerNodes().filter(n => zoneOf(n) === 'public').map(n => ({ nodeIds: [n.id],
        message: `${eunNeun(SVC_MAP[n.type].name)} 퍼블릭 서브넷에 있어요. 공개 IP를 받으면 인터넷에 드러날 수 있으니 프라이빗 서브넷에 두는 것이 안전해요.` }));
    },
  },
  {
    // 근거: CTR-02 (근거 A, 라우팅을 표현하지 못해 화면은 경고)
    id: 18, level: 'warn', message: '컨테이너 이미지 경로',
    pillars: ['security', 'operations'],
    basis: '컨테이너가 이미지를 받으려면 인터넷으로 나가는 길이 있어야 해요. 프라이빗 서브넷에서는 NAT를 거치거나 ECR용 VPC Endpoints를 써요.',
    ref: 'https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html',
    check() {
      const issues = [];
      containerNodes().filter(n => zoneOf(n) === 'private').forEach(n => {
        const ecrs = linkedNodes(n, 'ecr');
        if (!ecrs.length || linkedNodes(n, 'nat').length) return;
        if (ecrs.some(r => linkedNodes(r, 'vpce').length)) return;
        issues.push({ nodeIds: [n.id, ...ecrs.map(r => r.id)],
          message: `프라이빗 서브넷의 ${SVC_MAP[n.type].name}가 ECR에서 이미지를 받아올 길이 없어 보여요. NAT에 연결하거나, VPC Endpoints를 ECR과 연결해주세요.` });
      });
      return issues;
    },
  },
  {
    // 근거: CTR-03 (등급 A)
    id: 19, level: 'error', message: 'EKS 서브넷 AZ',
    pillars: ['reliability'],
    basis: 'EKS 클러스터는 서로 다른 AZ의 서브넷이 2개 이상 있어야 만들 수 있어요.',
    ref: 'https://docs.aws.amazon.com/eks/latest/userguide/network-reqs.html',
    check() {
      const eks = state.nodes.filter(n => n.type === 'eks');
      const subnets = state.containers.filter(c => SUBNET_TYPES.includes(c.type));
      if (!eks.length || !subnets.length) return [];
      const azIds = new Set(subnets.map(c => c.parentContainer).filter(id => findContainer(id)?.type === 'az'));
      if (azIds.size >= 2) return [];
      return [{ nodeIds: eks.map(n => n.id),
        message: 'EKS는 서로 다른 AZ의 서브넷이 2개 이상 있어야 만들 수 있어요. 다른 AZ를 추가하고 그 안에 서브넷을 만들어주세요.' }];
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
  // 잘한 점: 문제가 하나도 없는 규칙만 칭찬 후보 (판정 → 제안 순서)
  const praises = [];
  const addPraises = (rules, found, c) => rules.forEach(rule => {
    if (!rule.praise || found.some(f => f.rule === rule)) return;
    rule.praise(c).forEach(p => praises.push({ rule, text: p.text, nodeIds: p.nodeIds || [] }));
  });
  addPraises(VALIDATION_RULES, issues, ctx);
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
  addPraises(SUGGESTION_RULES, suggestions, allCtx);
  return { status, issues, nodeLevels, suggestions, suggestNodes, praises };
}

