// @ts-check
// js/data/missions.js — 단계별 미션 ([미션] 탭, 42번)

/* ---------------------------------------------------------
   미션 데이터
   - 만들기 미션 5개: 기본 틀에서 시작해 목표를 하나씩 달성하면 "기본 3-Tier" 예시와 같은 구성이 된다
   - start: 목록에서 이 미션을 [시작]할 때 미리 놓아 둘 박스 (EXAMPLE_BASIC의 키. 그 박스들 사이의 연결도 함께 놓는다)
            [다음 미션]으로 넘어올 때는 쓰지 않는다 (지금 캔버스를 그대로 이어 쓴다)
   - goals: { text 목표, hint 힌트, check(ctx, s) 달성 여부 }
            ctx는 모든 서비스를 보는 조회 도구(buildContext(true, s)), s는 채점할 구성
            check는 채점할 때(실행 시점)만 불린다. 채점 도구(mission…)는 js/rules/missions.js
   - 목표는 기존 판정 규칙이 보는 것과 같은 조건이다 (괄호 안이 판정 규칙 번호). 판정과 어긋나는 목표는 만들지 않는다
   --------------------------------------------------------- */
const MISSIONS = [
  {
    key: 'entry', title: '입구 만들기',
    intro: '사용자의 요청이 인터넷에서 VPC 안으로 들어오는 길을 만들어요.',
    start: [],
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
    key: 'app', title: '앱 서버 놓기',
    intro: '요청을 실제로 처리할 서버를 인터넷에서 보이지 않는 곳에 둬요.',
    start: ['pc', 'igw', 'lb'],
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
    key: 'db', title: 'DB 붙이기',
    intro: '데이터를 저장할 DB를 가장 안쪽에 두고 서버만 접속하게 해요.',
    start: ['pc', 'igw', 'lb', 'ec2a'],
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
    key: 'multi-az', title: '두 가용 영역으로 넓히기',
    intro: '한 가용 영역(AZ)에 장애가 나도 서비스가 이어지도록 서버와 DB를 두 AZ에 나눠 둬요.',
    start: ['pc', 'igw', 'lb', 'ec2a', 'rds'],
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
    key: 'egress', title: '밖으로 나가는 길 만들기',
    intro: '프라이빗 서브넷의 서버가 업데이트를 받으러 인터넷으로 나갈 길을 만들고, 구성을 마무리해요.',
    start: ['pc', 'igw', 'lb', 'ec2a', 'ec2b', 'rds', 'sb'],
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
        check: (ctx, s) => validateArchitecture(s).status === 'ok' },
    ],
    done: '기본 3-Tier 아키텍처를 직접 완성했어요! [검증하기]로 남은 제안을, [성능 시뮬레이션]으로 트래픽을 견디는지 확인해 보세요.',
  },
];
