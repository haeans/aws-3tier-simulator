// @ts-check
// js/rules/suggestions.js — 개선·제거 제안 규칙 (판정에는 영향 없음)

/* ----- 개선·제거 제안 -----
   정상/경고/오류 판정에는 영향을 주지 않고, 더 나은 설계 방향만 알려준다.
   - kind: 'improve'(개선) | 'remove'(제거)
   - 검증 대상이 아닌 서비스(validated: false)도 함께 본다.
   - check(ctx)는 [{ reason, action, nodeIds }]를 돌려준다 (빈 배열 = 제안 없음)
   - pillars / basis: Well-Architected 기준 태그와 근거 (js/data/guide.js의 PILLARS)
   - praise(ctx): 제안이 없고 좋은 구성이 실제로 있을 때 [{ text, nodeIds }] (잘한 점, 제거 제안에는 없음)
   - 배열 순서 = 화면에 나오는 순서. id는 화면의 "제안 N" 번호이자 criteria 문서가 가리키는 번호라 순서에 맞춰 바꾸지 않는다
     (예: 13 잘못된 WAF 연결은 WAF 제안끼리 모이도록 10 다음에 둔다) */
const SUGGESTION_RULES = [
  {
    // 근거: CACHE-02
    id: 1, kind: 'improve', title: 'DB 캐싱',
    pillars: ['performance'],
    basis: '자주 읽는 데이터를 메모리 캐시에 두면 읽기가 빨라지고 DB 부담이 줄어요. 읽기가 쓰기보다 훨씬 많은 DB가 캐싱 대상이에요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/perf_data_access_patterns_caching.html',
    praise(ctx) {
      const ec2s = ctx.ofType(...APP_TYPES).filter(e => ctx.neighborsOf(e, 'elasticache').length);
      if (!ec2s.length) return [];
      return [{ nodeIds: [...ec2s, ...ec2s.flatMap(e => ctx.neighborsOf(e, 'elasticache'))].map(n => n.id),
        text: 'EC2가 ElastiCache에서 자주 쓰는 데이터를 먼저 찾아요. DB 부담이 줄고 응답이 빨라져요.' }];
    },
    check(ctx) {
      const caches = ctx.ofType('elasticache');
      const pairs = ctx.ofType(...APP_TYPES).flatMap(e => ctx.neighborsOf(e, 'rds').map(r => [e, r]));
      if (!pairs.length) return [];
      if (ctx.ofType(...APP_TYPES).some(e => ctx.neighborsOf(e, 'elasticache').length)) return [];
      return [{
        nodeIds: [...new Set(pairs.flat().map(n => n.id))],
        reason: 'EC2가 RDS를 직접 조회하고 있어요. 같은 데이터를 반복해서 읽으면 DB 부담이 커지고 응답이 느려져요.',
        action: caches.length
          ? 'ElastiCache가 있지만 EC2와 연결되어 있지 않아요. EC2와 연결해 자주 쓰는 데이터를 캐싱하세요.'
          : 'ElastiCache를 DB 서브넷에 두고 EC2와 연결해 자주 쓰는 데이터를 캐싱하세요.',
      }];
    },
  },
  {
    id: 2, kind: 'improve', title: 'CDN 사용',
    pillars: ['performance', 'cost'],
    basis: '사용자와 가까운 엣지 로케이션에서 캐시로 응답하면 지연이 줄고, 원본 서버가 처리할 요청과 데이터 이동도 줄어요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/perf_networking_choose_workload_location_network_requirements.html',
    praise(ctx) {
      const cfs = ctx.ofType('cloudfront').filter(cf => ctx.neighborsOf(cf, ...USER_TYPES).length);
      if (!cfs.length) return [];
      return [{ nodeIds: cfs.map(n => n.id),
        text: 'CloudFront가 사용자와 가까운 엣지에서 먼저 응답해요. 빠르고, 서버가 받는 요청도 줄어요.' }];
    },
    check(ctx) {
      const users = ctx.ofType(...USER_TYPES);
      if (!users.length) return [];
      // 사용자가 S3나 EC2에 바로 붙어 있는 경우
      const direct = users.filter(u => ctx.neighborsOf(u, 's3', ...APP_TYPES).length);
      if (direct.length) return [{
        nodeIds: direct.flatMap(u => [u.id, ...ctx.neighborsOf(u, 's3', ...APP_TYPES).map(n => n.id)]),
        reason: '사용자가 S3나 EC2에서 파일을 직접 받아가요. 멀리 있는 사용자는 느리고, 서버가 모든 전송을 떠안아요.',
        action: '정적 파일은 S3에 두고 CloudFront를 거쳐 전달하세요. (사용자 — CloudFront — S3 / IGW)',
      }];
      // 진입 경로에 CloudFront가 전혀 없는 경우
      if (users.some(u => ctx.neighborsOf(u, 'cloudfront').length)) return [];
      return [{
        nodeIds: users.map(u => u.id),
        reason: '사용자 요청이 CDN 없이 바로 서버로 가요. 이미지·정적 파일까지 매번 서버가 처리해요.',
        action: '사용자와 IGW 사이에 CloudFront를 두세요. (사용자 — CloudFront — IGW)',
      }];
    },
  },
  {
    // 근거: S3-01, VPCE-01, DDB-S-01
    id: 3, kind: 'improve', title: 'S3·DynamoDB 전용 통로',
    pillars: ['security', 'cost'],
    basis: '게이트웨이 엔드포인트를 쓰면 IGW나 NAT 없이 S3·DynamoDB에 접속해요. 엔드포인트는 추가 요금이 없어서 NAT 데이터 처리 요금도 줄어요.',
    ref: 'https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html',
    praise(ctx) {
      const eps = ctx.ofType('vpce').filter(v => ctx.neighborsOf(v, 's3', 'dynamodb').length);
      if (!eps.length) return [];
      return [{ nodeIds: eps.map(n => n.id),
        text: 'VPC Endpoints로 NAT 없이 S3·DynamoDB에 비공개로 접속해요. NAT 데이터 처리 요금도 줄어요.' }];
    },
    check(ctx) {
      // 근거: DDB-S-01 — S3·DynamoDB는 서비스마다 게이트웨이 엔드포인트가 따로 필요하다 (VPC Endpoints가 하나라도 있으면 통과시키지 않음)
      const issues = [];
      ctx.ofType(...APP_TYPES).filter(e => ctx.zoneOf(e) === 'private').forEach(e => {
        const bare = ctx.neighborsOf(e, 's3', 'dynamodb').filter(sv => !ctx.neighborsOf(sv, 'vpce').length);
        if (!bare.length) return;
        const names = [...new Set(bare.map(ctx.nameOf))].join('·');
        issues.push({
          nodeIds: [e.id, ...bare.map(n => n.id)],
          reason: `프라이빗 서브넷의 EC2가 ${names}에 가려면 NAT와 IGW를 거쳐야 하고, NAT가 처리한 데이터만큼 요금도 들어요.`,
          action: `VPC Endpoints를 VPC 안(서브넷 밖)에 두고 ${names}와 연결하세요. (엔드포인트는 서비스마다 따로 필요해요)`,
        });
      });
      return issues;
    },
  },
  {
    // 근거: SRV-03, SRV-04
    id: 4, kind: 'improve', title: '자동 확장',
    pillars: ['reliability', 'cost'],
    basis: 'Auto Scaling으로 사용량에 맞춰 서버를 자동으로 늘리고 줄이면, 몰릴 때 버티고 한가할 때 비용을 아껴요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_autoscale_adapt.html',
    praise(ctx) {
      const used = ctx.asgGroups().filter(g => g.members.length);
      if (!used.length) return [];
      return [{ nodeIds: used.flatMap(g => g.members.map(e => e.id)),
        text: 'Auto Scaling 그룹이 두 AZ의 EC2를 묶었어요. 사용량에 맞춰 늘고 줄며, 한 AZ에 장애가 나도 버텨요.' }];
    },
    check(ctx) {
      const ec2s = ctx.ofType('ec2');
      const groups = ctx.asgGroups();
      const used = groups.filter(g => g.members.length);
      // EC2가 2대 이상인데 어느 그룹에도 들어 있지 않은 경우
      if (!used.length) {
        if (ec2s.length < 2) return [];
        return [{
          nodeIds: ec2s.map(e => e.id),
          reason: 'EC2 수가 고정되어 있어요. 사용자가 몰리면 느려지고, 한가할 땐 남는 서버 비용이 들어요.',
          action: groups.length
            ? 'Auto Scaling 그룹 안에 EC2가 없어요. 그룹 영역을 옮기거나 넓혀서 EC2를 감싸세요.'
            : '[영역]의 Auto Scaling 그룹을 두 AZ의 프라이빗 서브넷에 걸쳐 놓고, 그 안에 EC2를 두세요.',
        }];
      }
      // 그룹 안의 EC2가 한 AZ에만 있는 경우 (그 AZ에 장애가 나면 그룹 전체가 멈춤)
      return used.filter(g => new Set(g.members.map(ctx.azOf)).size < 2).map(g => ({
        nodeIds: g.members.map(e => e.id),
        reason: 'Auto Scaling 그룹의 EC2가 한 AZ에만 있어요. 그 AZ에 장애가 나면 서버가 모두 멈춰요.',
        action: '그룹 영역을 다른 AZ의 프라이빗 서브넷까지 넓히고, 그 AZ에도 EC2를 두세요.',
      }));
    },
  },
  {
    // 근거: CT-01, CT-02
    id: 5, kind: 'improve', title: '모니터링·감사',
    pillars: ['operations', 'security'],
    basis: '작업 기록(CloudTrail)과 상태 지표·로그(CloudWatch)를 남겨야 문제를 빨리 알아채고 원인을 찾을 수 있어요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_detect_investigate_events_app_service_logging.html',
    praise(ctx) {
      // 근거: CT-02 — 둘이 이어졌을 때만 칭찬 (CloudTrail 로그가 CloudWatch Logs로 가야 이상한 작업을 바로 알림받음)
      const pairs = ctx.ofType('cloudtrail').flatMap(t => ctx.neighborsOf(t, 'cloudwatch').map(w => [t, w]));
      if (!ctx.ofType(...APP_TYPES).length || !pairs.length) return [];
      return [{ nodeIds: [...new Set(pairs.flat().map(n => n.id))],
        text: 'CloudTrail(작업 기록)을 CloudWatch(상태·경보)와 이었어요. 문제를 빨리 알아채고 원인을 찾을 수 있어요.' }];
    },
    check(ctx) {
      if (!ctx.ofType(...APP_TYPES).length) return [];
      const missing = [];
      if (!ctx.ofType('cloudwatch').length) missing.push('CloudWatch(상태 모니터링·알림)');
      if (!ctx.ofType('cloudtrail').length) missing.push('CloudTrail(작업 기록)');
      if (!missing.length) {
        // 근거: CT-02 (CloudTrail.5) — 둘 다 있는데 이어지지 않은 경우
        const traces = ctx.ofType('cloudtrail');
        if (traces.some(t => ctx.neighborsOf(t, 'cloudwatch').length)) return [];
        return [{
          nodeIds: [...traces, ...ctx.ofType('cloudwatch')].map(n => n.id),
          reason: 'CloudTrail과 CloudWatch가 따로 있어요. 누가 무엇을 바꿨는지 기록만 쌓이고, 이상한 작업이 있어도 바로 알림받지 못해요.',
          action: 'CloudTrail — CloudWatch를 연결하세요. 기록을 CloudWatch로 보내면 경보를 걸 수 있어요.',
        }];
      }
      return [{
        nodeIds: [],
        reason: '서버 상태나 누가 무엇을 바꿨는지 볼 수단이 없어요. 문제가 생겨도 원인을 찾기 어려워요.',
        action: `${missing.join(', ')}을 VPC 밖에 추가하세요.`,
      }];
    },
  },
  {
    id: 6, kind: 'remove', title: 'Bastion 서버',
    pillars: ['security', 'cost'],
    basis: 'SSH 같은 직접 접속을 줄이고 Session Manager를 쓰면, 열린 접속 포트와 관리용 서버가 필요 없어 공격받을 곳과 관리 부담이 줄어요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_protect_compute_reduce_manual_management.html',
    check(ctx) {
      // 관리 접속용으로 보이는 EC2: DB 관리자와 바로 연결됐거나, 퍼블릭 서브넷에서 Load Balancer 없이 쓰이는 EC2
      const bastions = ctx.ofType('ec2').filter(e =>
        ctx.neighborsOf(e, 'dbadmin').length ||
        (ctx.zoneOf(e) === 'public' && !ctx.neighborsOf(e, 'lb').length));
      if (!bastions.length) return [];
      return [{
        nodeIds: bastions.map(e => e.id),
        reason: '관리 접속용 서버(Bastion)로 보이는 EC2가 있어요. 인터넷에 열린 접속 포트와 서버를 따로 관리해야 하고 비용도 들어요.',
        action: '이 EC2를 지우고 Session Manager로 서버에 접속하세요. DB 접속은 Client VPN을 거치면 돼요.',
      }];
    },
  },
  {
    // 근거: CACHE-02, CF-01, R53-02, VPCE-02, LB-06 (조합별 주석 참고)
    id: 7, kind: 'remove', title: '불필요한 연결',
    pillars: [],
    basis: '실제로 통신하지 않는 연결은 구성을 잘못 이해하게 만들어요. 캐시는 앱이 먼저 확인하고, 없으면 앱이 DB에서 읽어 캐시에 넣어요.',
    ref: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html',
    check(ctx) {
      // 실제로는 서로 통신하지 않는 조합: [서비스, 상대 종류들, 이유, 방안]
      const PAIRS = [
        ['elasticache', RDS_TYPES,
          'ElastiCache는 RDS 앞에서 요청을 대신 전달하지 않아요. 앱(EC2)이 캐시와 DB에 각각 접속해요.',
          '이 연결을 지우고 EC2 — ElastiCache, EC2 — RDS로 각각 연결하세요.'],
        // 근거: CF-01 (등급 C)
        ['cloudfront', RDS_TYPES,
          'CloudFront의 원본은 S3나 웹 서버(Load Balancer)예요. DB는 CloudFront가 아니라 앱 서버(EC2)가 조회해요.',
          '이 연결을 지우고 EC2 — RDS로 연결하세요.'],
        // 근거: R53-02 (등급 C)
        ['route53', [...APP_TYPES, ...RDS_TYPES],
          'Route 53은 도메인을 CloudFront나 Load Balancer 같은 공개 입구로 이어 줘요. 프라이빗 서브넷의 서버·DB는 공개 IP가 있어도 인터넷과 통신할 수 없어요.',
          '이 연결을 지우고 사용자 — Route 53 — CloudFront(또는 Load Balancer)로 연결하세요.'],
        // 근거: VPCE-02 (등급 C)
        ['vpce', ['igw', 'nat'],
          'VPC Endpoints는 IGW·NAT 없이 AWS 서비스로 가는 길이에요. 둘을 서로 이을 필요가 없어요.',
          '이 연결을 지우세요. VPC Endpoints는 접속할 서비스(S3·DynamoDB 등)와 이어요.'],
        // 근거: LB-06 (등급 C)
        ['lb', ['nat'],
          'Load Balancer는 서버의 사설 IP로 요청을 보내요. NAT는 안에서 밖으로 나가는 연결만 도와서 둘 사이에는 오가는 요청이 없어요.',
          '이 연결을 지우세요. NAT는 EC2 — NAT — IGW로 이어요.'],
      ];
      const issues = [];
      PAIRS.forEach(([type, others, reason, action]) => {
        ctx.ofType(type).forEach(n => ctx.neighborsOf(n, ...others).forEach(m => issues.push({
          nodeIds: [n.id, m.id],
          reason: `${ctx.nameOf(n)} — ${ctx.nameOf(m)} 연결: ${reason}`,
          action,
        })));
      });
      return issues;
    },
  },
  {
    // 근거: R53-01
    id: 8, kind: 'improve', title: '도메인 연결(DNS)',
    pillars: ['reliability'],
    basis: 'Route 53이 도메인 이름을 서비스 주소로 바꿔 사용자를 안내해요. 상태 확인을 켜면 문제가 생긴 곳을 피해 정상인 곳으로만 보내요.',
    ref: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover.html',
    praise(ctx) {
      const dns = ctx.ofType('route53').filter(r => ctx.neighborsOf(r, ...USER_TYPES).length);
      if (!dns.length) return [];
      return [{ nodeIds: dns.map(n => n.id),
        text: 'Route 53으로 도메인 이름을 연결했어요. 상태 확인을 켜면 문제가 생긴 곳을 피해 안내할 수 있어요.' }];
    },
    check(ctx) {
      const users = ctx.ofType(...USER_TYPES).filter(u => ctx.neighborsOf(u, 'igw', 'cloudfront').length);
      if (!users.length) return [];
      if (users.some(u => ctx.neighborsOf(u, 'route53').length)) return [];
      const dns = ctx.ofType('route53');
      return [{
        nodeIds: [...users, ...dns].map(n => n.id),
        reason: '사용자가 도메인 이름(example.com) 없이 들어오고 있어요. 서비스 주소가 바뀌거나 한 곳에 문제가 생기면 사용자가 접속하지 못해요.',
        action: dns.length
          ? 'Route 53이 있지만 사용자와 연결되어 있지 않아요. 사용자와 연결하세요. (사용자 — Route 53)'
          : 'Route 53을 VPC 밖에 두고 사용자와 연결하세요. (사용자 — Route 53)',
      }];
    },
  },
  {
    id: 9, kind: 'improve', title: '웹 방화벽',
    pillars: ['security'],
    basis: 'HTTP(S)로 들어오는 요청은 웹 방화벽(WAF)으로 검사해요. 정한 규칙에 맞는 위험한 요청은 CloudFront나 Load Balancer에 닿기 전에 막아요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_network_protection_inspection.html',
    praise(ctx) {
      const wafs = ctx.ofType('waf').filter(w => ctx.neighborsOf(w, 'cloudfront', 'lb').length);
      if (!wafs.length) return [];
      return [{ nodeIds: wafs.map(n => n.id),
        text: 'WAF로 들어오는 요청을 검사해요. SQL 인젝션 같은 흔한 웹 공격을 앞단에서 막아요.' }];
    },
    check(ctx) {
      const fronts = ctx.ofType('cloudfront', 'lb');
      if (!fronts.length || !ctx.ofType(...USER_TYPES).length) return [];
      // 근거: WAF-03 — 입구(CloudFront·Load Balancer)마다 WAF가 있어야 한다 (하나라도 있으면 통과시키지 않음)
      const bare = fronts.filter(f => !ctx.neighborsOf(f, 'waf').length);
      if (!bare.length) return [];
      const names = [...new Set(bare.map(ctx.nameOf))].join('·');
      return [{
        nodeIds: bare.map(f => f.id),
        reason: bare.length < fronts.length
          ? `WAF가 없는 입구가 있어요(${names}). 그곳으로 들어오는 요청은 검사 없이 그대로 받아요.`
          : '인터넷에서 들어오는 요청을 검사하지 않고 그대로 받아요. SQL 인젝션 같은 흔한 공격이 서버까지 닿을 수 있어요.',
        action: bare.length < fronts.length
          ? `${names}에도 WAF를 연결하세요. (WAF는 입구 하나에 하나씩 연결해요)`
          : ctx.ofType('waf').length
            ? 'WAF가 있지만 연결되어 있지 않아요. CloudFront나 Load Balancer와 연결하세요.'
            : 'WAF를 VPC 밖에 두고 CloudFront나 Load Balancer와 연결하세요.',
      }];
    },
  },
  {
    id: 10, kind: 'remove', title: 'WAF를 사이에 둔 연결',
    pillars: [],
    basis: 'WAF는 요청이 지나가는 길이 아니라 CloudFront·Load Balancer(ALB)에 붙이는 검사 규칙이에요. WAF로 이어도 두 곳 사이에 요청이 오가지 않아요.',
    ref: 'https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html',
    check(ctx) {
      const reached = requestReach(ctx);
      const HOW = {
        cloudfront: 'CloudFront는 사용자와 IGW 사이에 두세요. (사용자 — CloudFront — IGW)',
        lb: 'Load Balancer는 IGW와 EC2 사이에 두세요. (IGW — Load Balancer — EC2)',
      };
      return ctx.ofType('waf').flatMap(w => {
        const fronts = ctx.neighborsOf(w, 'cloudfront', 'lb');
        const off = fronts.filter(f => !reached.has(f.id));
        if (fronts.length < 2 || !off.length) return [];
        return [{
          nodeIds: [w.id, ...fronts.map(f => f.id)],
          reason: `WAF가 ${fronts.map(ctx.nameOf).join('·')}를 이어 주는 것처럼 연결되어 있어요. ` +
            `WAF는 길이 아니라서 ${off.map(ctx.nameOf).join('·')}에는 요청이 들어오지 않아요.`,
          action: [...new Set(off.map(f => HOW[f.type]))].join(' '),
        }];
      });
    },
  },
  {
    // 근거: WAF-01 (등급 C), WAF-02 (등급 A이나 WAF는 검증 대상이 아니라 제안으로 반영 — 사용자 결정 2026-10-27)
    id: 13, kind: 'remove', title: '잘못된 WAF 연결',
    pillars: [],
    basis: 'WAF는 CloudFront나 Application Load Balancer에 붙이는 검사 규칙이에요. 입구 하나에는 WAF를 하나만 붙일 수 있고, 한 WAF를 CloudFront와 Load Balancer에 함께 붙일 수도 없어요.',
    ref: 'https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-associating-aws-resource.html',
    check(ctx) {
      const issues = [];
      const FRONTS = ['cloudfront', 'lb'];
      ctx.ofType('waf').forEach(w => {
        // 붙일 수 없는 곳(EC2·DB·NAT 등)과 연결
        ctx.neighborsOf(w, ...SERVICES.map(v => v.type).filter(t => !FRONTS.includes(t))).forEach(m => issues.push({
          nodeIds: [w.id, m.id],
          reason: `WAF — ${ctx.nameOf(m)} 연결: WAF는 ${ctx.nameOf(m)}에 붙일 수 없어요. CloudFront나 Load Balancer(ALB)에만 붙여요.`,
          action: '이 연결을 지우고 WAF를 CloudFront나 Load Balancer와 연결하세요.',
        }));
        // 한 WAF가 CloudFront와 Load Balancer에 함께 연결
        const fronts = ctx.neighborsOf(w, ...FRONTS);
        // (요청 경로에 안 놓인 입구가 있으면 '길이 아니다' 제안(10)이 이미 알리므로 겹쳐 알리지 않는다)
        const reached = requestReach(ctx);
        if (fronts.every(f => reached.has(f.id)) &&
            fronts.some(f => f.type === 'cloudfront') && fronts.some(f => f.type === 'lb')) issues.push({
          nodeIds: [w.id, ...fronts.map(f => f.id)],
          reason: 'WAF 하나가 CloudFront와 Load Balancer에 함께 연결돼 있어요. CloudFront에 쓴 WAF는 다른 종류의 입구에 함께 쓸 수 없어요.',
          action: 'CloudFront용 WAF와 Load Balancer용 WAF를 따로 두세요.',
        });
      });
      // 입구 하나에 WAF가 둘 이상
      ctx.ofType(...FRONTS).forEach(f => {
        const wafs = ctx.neighborsOf(f, 'waf');
        if (wafs.length > 1) issues.push({
          nodeIds: [f.id, ...wafs.map(w => w.id)],
          reason: `${ctx.nameOf(f)}에 WAF가 ${wafs.length}개 연결돼 있어요. 입구 하나에는 WAF를 하나만 붙일 수 있어요.`,
          action: 'WAF 하나만 남기고 나머지 연결을 지우세요.',
        });
      });
      return issues;
    },
  },
  {
    // 근거: LB-03 (등급 C) — 문서가 LB 여러 개를 금지하지는 않으므로 오류가 아니라 제안
    id: 11, kind: 'improve', title: 'Load Balancer 하나로',
    pillars: ['reliability', 'cost'],
    basis: 'Load Balancer는 하나를 만들어 여러 AZ에 걸쳐 쓰는 것이 기본이에요. AZ마다 따로 두면 관리할 곳과 비용이 늘고, 요청을 AZ 사이에 나눠주지도 못해요.',
    ref: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html',
    praise(ctx) {
      const lbs = ctx.ofType('lb').filter(lb => new Set(ctx.neighborsOf(lb, ...APP_TYPES).map(ctx.azOf).filter(Boolean)).size > 1);
      if (!lbs.length) return [];
      return [{ nodeIds: lbs.map(n => n.id),
        text: 'Load Balancer 하나가 여러 AZ의 EC2에 요청을 나눠요. 한 AZ에 장애가 나도 나머지 AZ로 이어가요.' }];
    },
    check(ctx) {
      const lbs = ctx.ofType('lb').filter(lb => ctx.azOf(lb));
      if (new Set(lbs.map(ctx.azOf)).size < 2) return [];
      return [{
        nodeIds: lbs.map(n => n.id),
        reason: 'Load Balancer가 AZ마다 따로 있어요. 관리할 곳과 비용이 늘고, 요청을 AZ 사이에 나눠주지 못해요.',
        action: 'Load Balancer를 하나만 두고, 두 AZ의 EC2를 모두 그 Load Balancer와 연결하세요.',
      }];
    },
  },
  {
    // 근거: NAT-02 (등급 C)
    id: 12, kind: 'improve', title: 'NAT를 AZ마다',
    pillars: ['reliability'],
    basis: 'NAT 하나를 여러 AZ가 같이 쓰면, 그 NAT가 있는 AZ에 장애가 날 때 다른 AZ의 서버도 인터넷으로 나갈 수 없어요. AZ마다 NAT를 두면 버텨요.',
    ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html',
    praise(ctx) {
      const { azs, covered } = natCoverage(ctx);
      if (azs.length < 2 || covered.length < azs.length) return [];
      return [{ nodeIds: ctx.ofType('nat').map(n => n.id),
        text: 'NAT를 AZ마다 두었어요. 한 AZ에 장애가 나도 다른 AZ의 서버는 인터넷으로 나갈 수 있어요.' }];
    },
    check(ctx) {
      const { azs, covered } = natCoverage(ctx);
      const missing = azs.filter(a => !covered.includes(a));
      if (!azs.length || !covered.length || !missing.length) return [];   // NAT가 아예 없으면 판정 6이 알림
      return [{
        nodeIds: ctx.ofType('nat').map(n => n.id),
        reason: `${missing.map(a => a.label).join(', ')}의 서버는 다른 AZ의 NAT를 같이 써요. 그 NAT가 있는 AZ에 장애가 나면 인터넷으로 나갈 수 없어요.`,
        action: `${missing.map(a => a.label).join(', ')}의 퍼블릭 서브넷에도 NAT를 두세요.`,
      }];
    },
  },
  {
    // 근거: DB-05 (등급 C) — 프라이빗 서브넷의 DB는 오류가 아니지만, 앱 서버와 계층을 나누면 더 안전
    id: 14, kind: 'improve', title: 'DB 서브넷 분리',
    pillars: ['security'],
    basis: 'DB를 앱 서버와 다른 서브넷(DB 서브넷)에 두면, 서브넷 단위로 접근을 더 좁게 막을 수 있어요. 프라이빗 서브넷의 DB도 동작은 하지만 계층이 섞여요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_network_protection_layered.html',
    check(ctx) {
      const dbs = ctx.ofType(...RDS_TYPES).filter(db => ctx.zoneOf(db) === 'private');
      if (!dbs.length) return [];
      return [{
        nodeIds: dbs.map(n => n.id),
        reason: 'DB가 앱 서버(EC2)와 같은 프라이빗 서브넷에 있어요. 서브넷 단위로 접근을 따로 좁히기 어려워요.',
        action: 'DB 서브넷을 만들어 DB를 옮기세요. 앱 서버가 있는 서브넷과 계층이 나뉘어요.',
      }];
    },
  },
  {
    // 근거: SSM-03 (Security Hub SSM.1은 B, 정상의 의미를 흔들지 않도록 제안)
    id: 15, kind: 'improve', title: 'Session Manager로 서버 관리',
    pillars: ['security', 'operations'],
    basis: 'Session Manager로 서버를 관리하면 열린 접속 포트·Bastion·SSH 키가 필요 없어요. 모든 EC2를 Systems Manager로 관리하는 것이 권장이에요.',
    ref: 'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html',
    praise(ctx) {
      const ec2s = ctx.ofType('ec2');
      if (!ec2s.length || ec2s.some(e => !ec2HasSessionManager(e))) return [];
      return [{ nodeIds: ec2s.map(n => n.id),
        text: '모든 EC2를 Session Manager로 관리해요. 열린 접속 포트나 SSH 키 없이 안전하게 접속해요.' }];
    },
    check(ctx) {
      const bare = ctx.ofType('ec2').filter(e => !ec2HasSessionManager(e));
      if (!bare.length) return [];
      return [{
        nodeIds: bare.map(n => n.id),
        reason: 'Session Manager와 이어지지 않은 EC2가 있어요. 서버에 들어가려면 SSH 포트를 열고 키를 관리해야 해요.',
        action: 'Session Manager를 VPC 밖에 두고 EC2와 연결하세요. (프라이빗 서브넷이면 NAT나 VPC Endpoints도 필요해요)',
      }];
    },
  },
  {
    // 근거: CTR-04 (등급 C)
    id: 16, kind: 'improve', title: 'Fargate 짝',
    pillars: ['operations'],
    basis: 'Fargate는 ECS나 EKS가 컨테이너를 서버 관리 없이 실행하는 방식이에요. 혼자서는 컨테이너를 실행하지 않아요.',
    ref: 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html',
    check(ctx) {
      const lone = ctx.ofType('fargate').filter(f => !ctx.neighborsOf(f, 'ecs', 'eks').length);
      if (!lone.length) return [];
      return [{
        nodeIds: lone.map(n => n.id),
        reason: 'ECS나 EKS와 이어지지 않은 Fargate가 있어요. Fargate는 ECS 작업이나 EKS Pod를 실행해 주는 방식이에요.',
        action: 'Fargate를 ECS(또는 EKS)와 연결하세요.',
      }];
    },
  },
];
