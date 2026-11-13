// @ts-check
// js/data/missions.js — 단계별 미션 ([미션] 탭, 42번)

/* ---------------------------------------------------------
   미션 데이터
   - kind: 'build' 만들기 5개 (기본 틀에서 시작해 "기본 3-Tier" 예시와 같은 구성까지)
           'fix' 고치기 3개 (실수가 숨은 기본 3-Tier를 고침. 실수는 EXAMPLE_MISTAKES) — 42-2
           'improve' 개선 3개 (정상인 기본 3-Tier의 제안을 없애 "고가용성" 예시와 같은 구성까지) — 42-2
   - start: 이 미션의 시작 구성 (js/ui/mission.js의 missionStartSpec이 구성 데이터로 바꾼다)
            { from: 예시 key(없으면 basic), keys: 놓아 둘 박스 키(그 박스들 사이의 연결도 함께), edges: 더할 연결 }
            { mistakes: 넣을 실수 key 목록 | 'random'(매번 다른 2개) }
   - continues: true면 [다음 미션]으로 넘어올 때 앞 미션의 캔버스를 그대로 이어 쓴다 (없으면 시작 구성을 새로 불러온다)
   - goals: { text 목표, hint 힌트, check(ctx, s) 달성 여부 }. text·hint는 (ctx, s) => 글 함수여도 된다 (남은 문제 수 등)
            ctx는 채점용 조회 도구(missionContext: 모든 서비스 + verdict() 검증 결과), s는 채점할 구성
            check는 채점할 때(실행 시점)만 불린다. 채점 도구(mission…)는 js/rules/missions.js
   - 목표는 기존 판정 규칙이 보는 것과 같은 조건이다 (괄호 안이 판정 규칙 번호). 판정과 어긋나는 목표는 만들지 않는다
   --------------------------------------------------------- */
const MISSION_KINDS = {
  build:   { name: '만들기', desc: '기본 틀에서 시작해 3-Tier를 직접 만들어요' },
  fix:     { name: '고치기', desc: '실수가 숨은 구성에서 문제를 찾아 고쳐요' },
  improve: { name: '개선',   desc: '정상인 구성을 더 좋은 설계로 다듬어요' },
};

// 고치기 미션의 목표 (세 미션이 함께 씀): 무엇이 틀렸는지는 알려 주지 않고 남은 개수만 보여 준다. 힌트가 남은 문제 하나를 알려 준다
const missionLeft = n => (n ? ` (지금 ${n}개 남음)` : '');
const missionFixHint = ctx => {
  const first = missionIssues(ctx).slice(-1)[0];   // 뒤쪽 규칙이 더 구체적이다 (예: "DB 위치"가 그 결과로 생긴 "고가용성" 경고보다 뒤)
  return '위쪽 [검증하기]를 누르면 문제가 있는 박스에 표시가 생겨요.' + (first ? ` 남은 문제 하나: ${first.message}` : '');
};
const MISSION_FIX_GOALS = [
  { text: ctx => '검증의 "오류"를 모두 없애기' + missionLeft(missionIssues(ctx, 'error').length), hint: missionFixHint,
    check: ctx => !missionIssues(ctx, 'error').length },
  { text: ctx => '검증의 "경고"를 모두 없애기' + missionLeft(missionIssues(ctx, 'warn').length), hint: missionFixHint,
    check: ctx => !missionIssues(ctx, 'warn').length },
];
// 개선 미션의 목표 도구: 제안 id가 사라지면 달성. 힌트는 그 제안의 이유·할 일 (판정 화면과 같은 문구)
const missionSugGoal = (id, text) => ({ text, hint: ctx => missionSugHint(ctx, id), check: ctx => !missionSug(ctx, id) });
const MISSION_KEEP_OK = { text: '검증 결과는 "정상"으로 유지하기',
  hint: '박스나 선을 지워서 제안을 없애면 안 돼요. 위쪽 [검증하기]를 눌러 오류·경고가 생기지 않았는지 확인해 보세요.',
  check: ctx => ctx.verdict().status === 'ok' };

const MISSIONS = [
  {
    key: 'entry', kind: 'build', title: '입구 만들기',
    intro: '사용자의 요청이 인터넷에서 VPC 안으로 들어오는 길을 만들어요.',
    start: { keys: [] },
    goals: [
      { text: '사용자(스마트폰·태블릿·PC 중 하나)를 VPC 밖에 놓기',
        hint: '왼쪽 팔레트의 [사용자]에서 PC를 끌어 VPC(초록 테두리) 바깥 빈 곳에 놓아 보세요.',
        check: ctx => ctx.ofType(...USER_TYPES).length > 0 },
      { text: 'IGW를 VPC 경계선에 놓기',   // 판정 1·2
        hint: '팔레트의 [네트워크]에서 IGW를 끌어 VPC 테두리 근처에 놓으면 경계선에 붙어요. IGW는 VPC와 인터넷을 잇는 문이에요.',
        check: ctx => ctx.ofType('igw').some(n => !SUBNET_TYPES.includes(ctx.zoneOf(n))) },
      { text: 'Load Balancer를 VPC 안, 두 가용 영역 사이에 놓기',   // 판정 2
        hint: 'Load Balancer는 여러 AZ에 걸쳐 쓰는 서비스라 서브넷 안이 아니라 두 가용 영역 사이 빈 곳에 놓아요.',
        check: ctx => ctx.ofType('lb').some(n => ctx.zoneOf(n) === 'vpc') },
      { text: '사용자와 IGW를 연결하기',   // 판정 1
        hint: '사용자 박스에 마우스를 올리면 보이는 연결점을 IGW까지 끌어 놓으세요.',
        check: ctx => missionLinked(ctx, USER_TYPES, ['igw']) },
      { text: 'IGW와 Load Balancer를 연결하기',   // 판정 1
        hint: 'IGW의 연결점을 Load Balancer까지 끌어 놓으세요. 인터넷 요청은 Load Balancer라는 한 입구로만 받아요.',
        check: ctx => missionLinked(ctx, ['igw'], ['lb']) },
    ],
    done: '인터넷 요청이 IGW를 지나 Load Balancer까지 들어오는 입구가 생겼어요.',
  },
  {
    key: 'app', kind: 'build', continues: true, title: '앱 서버 놓기',
    intro: '요청을 실제로 처리할 서버를 인터넷에서 보이지 않는 곳에 둬요.',
    start: { keys: ['pc', 'igw', 'lb'] },
    goals: [
      { text: 'EC2를 프라이빗 서브넷에 놓기',   // 판정 2·11
        hint: '팔레트의 [컴퓨팅]에서 EC2를 끌어 파란색 "프라이빗 서브넷" 안에 놓아 보세요. 프라이빗 서브넷은 인터넷에서 바로 들어올 수 없어요.',
        check: ctx => missionEc2s(ctx).length > 0 },
      { text: 'Load Balancer와 EC2를 연결하기',   // 판정 3
        hint: 'Load Balancer의 연결점을 EC2까지 끌어 놓으세요. Load Balancer가 받은 요청을 서버로 넘겨요.',
        check: ctx => missionEc2s(ctx).some(e => ctx.neighborsOf(e, 'lb').length > 0) },
    ],
    done: '요청은 Load Balancer가 받고, 서버는 프라이빗 서브넷에 숨겼어요.',
  },
  {
    key: 'db', kind: 'build', continues: true, title: 'DB 붙이기',
    intro: '데이터를 저장할 DB를 가장 안쪽에 두고 서버만 접속하게 해요.',
    start: { keys: ['pc', 'igw', 'lb', 'ec2a'] },
    goals: [
      { text: 'RDS를 DB 서브넷에 놓기',   // 판정 4
        hint: '팔레트의 [데이터]에서 RDS를 끌어 EC2와 같은 가용 영역의 "DB 서브넷" 안에 놓아 보세요.',
        check: ctx => ctx.ofType('rds').some(n => ctx.zoneOf(n) === 'db') },
      { text: 'EC2와 RDS를 연결하기',   // 판정 5
        hint: 'EC2의 연결점을 RDS까지 끌어 놓으세요. DB에는 서버만 접속해요. 사용자나 IGW와는 잇지 않아요.',
        check: ctx => missionEc2s(ctx).some(e => ctx.neighborsOf(e, 'rds').length > 0) },
    ],
    done: '웹(입구)·앱(서버)·데이터(DB) 세 계층이 이어졌어요. 이것이 3-Tier예요.',
  },
  {
    key: 'multi-az', kind: 'build', continues: true, title: '두 가용 영역으로 넓히기',
    intro: '한 가용 영역(AZ)에 장애가 나도 서비스가 이어지도록 서버와 DB를 두 AZ에 나눠 둬요.',
    start: { keys: ['pc', 'igw', 'lb', 'ec2a', 'rds'] },
    goals: [
      { text: '다른 가용 영역의 프라이빗 서브넷에도 EC2 놓기',   // 판정 7
        hint: '지금 EC2가 없는 쪽 가용 영역의 프라이빗 서브넷에 EC2를 하나 더 놓아 보세요.',
        check: ctx => missionAzCount(ctx, missionEc2s(ctx)) >= 2 },
      { text: '두 가용 영역의 EC2를 같은 Load Balancer와 연결하기',   // 판정 7 (LB-02)
        hint: 'Load Balancer의 연결점을 새 EC2까지 끌어 놓으세요. Load Balancer가 두 AZ의 서버에 요청을 나눠요.',
        check: ctx => ctx.ofType('lb').some(lb => missionAzCount(ctx, ctx.neighborsOf(lb, 'ec2')) >= 2) },
      { text: '모든 EC2를 RDS와 연결하기',   // 판정 5
        hint: '새로 놓은 EC2도 RDS와 연결해야 데이터를 읽고 쓸 수 있어요.',
        // 두 AZ에 EC2가 놓인 뒤부터 본다 (처음부터 ✓로 보이지 않게)
        check: ctx => missionAzCount(ctx, missionEc2s(ctx)) >= 2 && missionEc2s(ctx).every(e => ctx.neighborsOf(e, 'rds').length > 0) },
      { text: 'RDS Standby를 다른 가용 영역의 DB 서브넷에 놓기',   // 판정 7 (DB-04)
        hint: '팔레트의 [데이터]에서 RDS Standby를 끌어, RDS가 없는 쪽 가용 영역의 DB 서브넷에 놓아 보세요. RDS가 멈추면 이어받는 예비 DB예요.',
        check: ctx => missionStandbys(ctx).length > 0 },
      { text: 'RDS와 RDS Standby를 연결하기',
        hint: 'RDS의 연결점을 RDS Standby까지 끌어 놓으세요. RDS의 데이터가 Standby로 계속 복제돼요. 서버는 Standby와 잇지 않아요.',
        check: ctx => missionStandbys(ctx).some(sb => ctx.neighborsOf(sb, 'rds').length > 0) },
    ],
    done: '서버와 DB가 두 AZ에 나뉘었어요. 한 AZ가 멈춰도 다른 AZ가 서비스를 이어가요.',
  },
  {
    key: 'egress', kind: 'build', continues: true, title: '밖으로 나가는 길 만들기',
    intro: '프라이빗 서브넷의 서버가 업데이트를 받으러 인터넷으로 나갈 길을 만들고, 구성을 마무리해요.',
    start: { keys: ['pc', 'igw', 'lb', 'ec2a', 'ec2b', 'rds', 'sb'] },
    goals: [
      { text: 'NAT를 퍼블릭 서브넷에 놓기',   // 판정 6
        hint: '팔레트의 [네트워크]에서 NAT를 끌어 초록색 "퍼블릭 서브넷" 안에 놓아 보세요. NAT는 인터넷과 닿아야 해서 퍼블릭 서브넷에 둬요.',
        check: ctx => ctx.ofType('nat').some(n => ctx.zoneOf(n) === 'public') },
      { text: '모든 EC2를 NAT와 연결하기',
        hint: 'EC2마다 연결점을 NAT까지 끌어 놓으세요. 서버가 먼저 밖으로 나가는 연결만 NAT를 지나가요.',
        check: ctx => missionEc2s(ctx).length > 0 && missionEc2s(ctx).every(e => ctx.neighborsOf(e, 'nat').length > 0) },
      { text: 'NAT와 IGW를 연결하기',   // 제안 20
        hint: 'NAT의 연결점을 IGW까지 끌어 놓으세요. NAT로 모인 요청은 IGW를 지나 인터넷으로 나가요.',
        check: ctx => missionLinked(ctx, ['nat'], ['igw']) },
      { text: '검증 결과가 "정상"이 되게 하기',
        hint: '이 목표는 자동으로 확인해요. 아직 ✓가 아니면 위쪽 [검증하기]를 눌러 무엇이 오류·경고인지 보고 고쳐 보세요.',
        check: ctx => ctx.verdict().status === 'ok' },
    ],
    done: '기본 3-Tier 아키텍처를 직접 완성했어요! [검증하기]로 남은 제안을, [성능 시뮬레이션]으로 트래픽을 견디는지 확인해 보세요.',
  },

  // ----- 고치기 (42-2): 기본 3-Tier에 실수를 넣은 구성. 근거는 실수마다 EXAMPLE_MISTAKES의 rule -----
  {
    key: 'fix-lines', kind: 'fix', title: '잘못 이은 선 찾기',
    intro: '잘 돌아가던 구성에 잘못 이은 선 3개가 숨어 있어요. 찾아서 지워 보세요. (선을 누르고 Delete)',
    start: { mistakes: ['igw-ec2', 'ec2-standby', 'user-ec2'] },
    goals: MISSION_FIX_GOALS,
    done: '서버는 Load Balancer 뒤에 숨기고, 예비 DB(Standby)에는 접속하지 않아요. 잘못 이은 선 하나가 보안 구멍이 될 수 있어요.',
  },
  {
    key: 'fix-places', kind: 'fix', title: '잘못 놓인 박스 찾기',
    intro: '박스 2개가 엉뚱한 서브넷에 놓여 있어요. 찾아서 제자리로 끌어 옮겨 보세요.',
    start: { mistakes: ['db-public', 'ec2-public'] },
    goals: MISSION_FIX_GOALS,
    done: '서버는 프라이빗 서브넷에, DB는 DB 서브넷에 둬요. 퍼블릭 서브넷에는 인터넷과 닿아야 하는 것만 놓아요.',
  },
  {
    key: 'fix-random', kind: 'fix', title: '종합: 숨은 실수 찾기',
    intro: '실수 2개가 숨어 있어요. 미션 목록에서 [처음부터]를 누를 때마다 다른 실수가 나와요.',
    start: { mistakes: 'random' },
    goals: MISSION_FIX_GOALS,
    done: '숨은 실수를 모두 찾아 고쳤어요. [처음부터]로 다른 실수도 연습해 보세요.',
  },

  // ----- 개선 (42-2): 정상인 기본 3-Tier의 제안을 주제별로 없앤다. 끝내면 "고가용성" 예시처럼 제안 0개 -----
  {
    key: 'faster', kind: 'improve', title: '더 빠르게 만들기',
    intro: '같은 데이터를 매번 DB와 서버까지 가서 가져오지 않도록 캐시와 CDN을 더해요.',
    start: { keys: null },
    goals: [
      missionSugGoal(1, 'ElastiCache를 더해 DB 조회 부담 줄이기'),
      missionSugGoal(2, 'CloudFront를 더해 정적 파일을 사용자 가까이에서 보내기'),
      MISSION_KEEP_OK,
    ],
    done: '자주 읽는 데이터는 ElastiCache가, 이미지 같은 정적 파일은 CloudFront가 먼저 답해요. 서버와 DB의 부담이 줄어요.',
  },
  {
    key: 'safer', kind: 'improve', continues: true, title: '더 안전하게 운영하기',
    intro: '무슨 일이 일어나는지 지켜보고, 위험한 요청을 걸러내고, 서버에 안전하게 접속하는 수단을 더해요.',
    start: { from: 'ha', keys: ['pc', 'cf', 'igw', 'lb', 'nat', 'ec2a', 'ec2b', 'rds', 'cache', 'sb'], edges: [['ec2b', 'nat']] },
    goals: [
      missionSugGoal(5, 'CloudWatch·CloudTrail로 상태와 변경 기록 남기기'),
      missionSugGoal(8, 'Route 53으로 도메인 연결하기'),
      missionSugGoal(9, 'AWS WAF로 위험한 요청 걸러내기'),
      missionSugGoal(15, 'Session Manager로 서버에 안전하게 접속하기'),
      MISSION_KEEP_OK,
    ],
    done: '문제가 생기면 원인을 찾을 기록이 남고, 흔한 웹 공격은 WAF가 걸러내요. 서버에는 포트를 열지 않고도 접속할 수 있어요.',
  },
  {
    key: 'resilient', kind: 'improve', continues: true, title: '장애에 더 강하게 만들기',
    intro: '트래픽이 몰리거나 한 가용 영역이 멈춰도 버티도록 남은 약한 곳을 채워요.',
    start: { from: 'ha', keys: ['pc', 'r53', 'cf', 'waf', 'igw', 'waf2', 'lb', 'nat', 'ec2a', 'ec2b', 'rds', 'cache', 'sb', 'ssm', 'cw', 'trail'], edges: [['ec2b', 'nat']] },
    goals: [
      missionSugGoal(4, 'Auto Scaling 그룹으로 서버 수를 자동으로 조절하기'),
      missionSugGoal(12, 'NAT를 가용 영역마다 두기'),
      missionSugGoal(18, 'ElastiCache를 다른 가용 영역에도 두기'),
      { text: ctx => '제안이 하나도 남지 않게 하기' + missionLeft(ctx.verdict().suggestions.length),
        hint: ctx => missionSugHint(ctx, 0), check: ctx => !ctx.verdict().suggestions.length },
      MISSION_KEEP_OK,
    ],
    done: '제안이 하나도 없는 모범 구성을 완성했어요! [성능 시뮬레이션]에서 장애를 넣어 정말 버티는지 확인해 보세요.',
  },
];
