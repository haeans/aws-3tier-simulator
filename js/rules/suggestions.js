// js/rules/suggestions.js — 개선·제거 제안 규칙 (판정에는 영향 없음)

/* ----- 개선·제거 제안 -----
   정상/경고/오류 판정에는 영향을 주지 않고, 더 나은 설계 방향만 알려준다.
   - kind: 'improve'(개선) | 'remove'(제거)
   - 검증 대상이 아닌 서비스(validated: false)도 함께 본다.
   - check(ctx)는 [{ reason, action, nodeIds }]를 돌려준다 (빈 배열 = 제안 없음) */
const SUGGESTION_RULES = [
  {
    id: 1, kind: 'improve', title: 'DB 캐싱',
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
    check(ctx) {
      if (ctx.ofType('vpce').length) return [];
      const ec2s = ctx.ofType('ec2').filter(e => ctx.zoneOf(e) === 'private' && ctx.neighborsOf(e, 's3').length);
      if (!ec2s.length) return [];
      return [{
        nodeIds: ec2s.flatMap(e => [e.id, ...ctx.neighborsOf(e, 's3').map(n => n.id)]),
        reason: '프라이빗 서브넷의 EC2가 S3에 갈 때 NAT를 거치면 인터넷 쪽으로 나가고, 데이터 처리 비용도 들어요.',
        action: 'VPC Endpoints를 VPC 안(서브넷 밖)에 두고 EC2와 S3 사이를 연결하세요.',
      }];
    },
  },
  {
    id: 4, kind: 'improve', title: '자동 확장',
    check(ctx) {
      const ec2s = ctx.ofType('ec2');
      if (ec2s.length < 2 || ctx.ofType('autoscaling').length) return [];
      return [{
        nodeIds: ec2s.map(e => e.id),
        reason: 'EC2 수가 고정되어 있어요. 사용자가 몰리면 느려지고, 한가할 땐 남는 서버 비용이 들어요.',
        action: 'Auto Scaling을 프라이빗 서브넷에 두고 EC2를 그룹으로 묶어 자동으로 늘리고 줄이세요.',
      }];
    },
  },
  {
    id: 5, kind: 'improve', title: '모니터링·감사',
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
    check(ctx) {
      // 실제로는 서로 통신하지 않는 조합: [서비스, 상대 종류들, 이유, 방안]
      const PAIRS = [
        ['elasticache', RDS_TYPES,
          'ElastiCache는 RDS 앞에서 요청을 대신 전달하지 않아요. 앱(EC2)이 캐시와 DB에 각각 접속해요.',
          '이 연결을 지우고 EC2 — ElastiCache, EC2 — RDS로 각각 연결하세요.'],
        ['autoscaling', [...RDS_TYPES, 'elasticache'],
          'Auto Scaling은 EC2를 묶어 늘리고 줄이는 관리 그룹이라 DB와 직접 통신하지 않아요.',
          '이 연결을 지우고 Auto Scaling은 EC2와만 연결하세요. DB에는 EC2가 접속해요.'],
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
];

