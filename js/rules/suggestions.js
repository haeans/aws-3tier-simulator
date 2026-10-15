// @ts-check
// js/rules/suggestions.js — 개선·제거 제안 규칙 (판정에는 영향 없음)

/* ----- 개선·제거 제안 -----
   정상/경고/오류 판정에는 영향을 주지 않고, 더 나은 설계 방향만 알려준다.
   - kind: 'improve'(개선) | 'remove'(제거)
   - 검증 대상이 아닌 서비스(validated: false)도 함께 본다.
   - check(ctx)는 [{ reason, action, nodeIds }]를 돌려준다 (빈 배열 = 제안 없음)
   - pillars / basis: Well-Architected 기준 태그와 근거 (js/data/guide.js의 PILLARS) */
const SUGGESTION_RULES = [
  {
    id: 1, kind: 'improve', title: 'DB 캐싱',
    pillars: ['performance'],
    basis: '자주 읽는 데이터를 메모리 캐시에 두면 읽기가 빨라지고 DB 부담이 줄어요. 읽기가 쓰기보다 훨씬 많은 DB가 캐싱 대상이에요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/perf_data_access_patterns_caching.html',
    check(ctx) {
      const caches = ctx.ofType('elasticache');
      const pairs = ctx.ofType('ec2').flatMap(e => ctx.neighborsOf(e, 'rds').map(r => [e, r]));
      if (!pairs.length) return [];
      if (ctx.ofType('ec2').some(e => ctx.neighborsOf(e, 'elasticache').length)) return [];
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
    check(ctx) {
      const users = ctx.ofType(...USER_TYPES);
      if (!users.length) return [];
      // 사용자가 S3나 EC2에 바로 붙어 있는 경우
      const direct = users.filter(u => ctx.neighborsOf(u, 's3', 'ec2').length);
      if (direct.length) return [{
        nodeIds: direct.flatMap(u => [u.id, ...ctx.neighborsOf(u, 's3', 'ec2').map(n => n.id)]),
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
    id: 3, kind: 'improve', title: 'S3 전용 통로',
    pillars: ['security', 'cost'],
    basis: '게이트웨이 엔드포인트를 쓰면 IGW나 NAT 없이 S3에 접속해요. 엔드포인트는 추가 요금이 없어서 NAT 데이터 처리 요금도 줄어요.',
    ref: 'https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html',
    check(ctx) {
      if (ctx.ofType('vpce').length) return [];
      const ec2s = ctx.ofType('ec2').filter(e => ctx.zoneOf(e) === 'private' && ctx.neighborsOf(e, 's3').length);
      if (!ec2s.length) return [];
      return [{
        nodeIds: ec2s.flatMap(e => [e.id, ...ctx.neighborsOf(e, 's3').map(n => n.id)]),
        reason: '프라이빗 서브넷의 EC2가 S3에 가려면 NAT와 IGW를 거쳐야 하고, NAT가 처리한 데이터만큼 요금도 들어요.',
        action: 'VPC Endpoints를 VPC 안(서브넷 밖)에 두고 EC2와 S3 사이를 연결하세요.',
      }];
    },
  },
  {
    id: 4, kind: 'improve', title: '자동 확장',
    pillars: ['reliability', 'cost'],
    basis: 'Auto Scaling으로 사용량에 맞춰 서버를 자동으로 늘리고 줄이면, 몰릴 때 버티고 한가할 때 비용을 아껴요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_autoscale_adapt.html',
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
    id: 5, kind: 'improve', title: '모니터링·감사',
    pillars: ['operations', 'security'],
    basis: '작업 기록(CloudTrail)과 상태 지표·로그(CloudWatch)를 남겨야 문제를 빨리 알아채고 원인을 찾을 수 있어요.',
    ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_detect_investigate_events_app_service_logging.html',
    check(ctx) {
      if (!ctx.ofType('ec2').length) return [];
      const missing = [];
      if (!ctx.ofType('cloudwatch').length) missing.push('CloudWatch(상태 모니터링·알림)');
      if (!ctx.ofType('cloudtrail').length) missing.push('CloudTrail(작업 기록)');
      if (!missing.length) return [];
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
    id: 8, kind: 'improve', title: '도메인 연결(DNS)',
    pillars: ['reliability'],
    basis: 'Route 53이 도메인 이름을 서비스 주소로 바꿔 사용자를 안내해요. 상태 확인을 켜면 문제가 생긴 곳을 피해 정상인 곳으로만 보내요.',
    ref: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover.html',
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
    check(ctx) {
      const fronts = ctx.ofType('cloudfront', 'lb');
      if (!fronts.length || !ctx.ofType(...USER_TYPES).length) return [];
      if (fronts.some(f => ctx.neighborsOf(f, 'waf').length)) return [];
      return [{
        nodeIds: fronts.map(f => f.id),
        reason: '인터넷에서 들어오는 요청을 검사하지 않고 그대로 받아요. SQL 인젝션 같은 흔한 공격이 서버까지 닿을 수 있어요.',
        action: ctx.ofType('waf').length
          ? 'WAF가 있지만 연결되어 있지 않아요. CloudFront나 Load Balancer와 연결하세요.'
          : 'WAF를 VPC 밖에 두고 CloudFront나 Load Balancer와 연결하세요.',
      }];
    },
  },
];

