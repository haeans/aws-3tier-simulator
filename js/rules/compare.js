// @ts-check
// js/rules/compare.js — 구성 두 개 비교 계산 (44번). 화면에 기대지 않고 구성 a·b를 받는다
// 판정(validateArchitecture)·트래픽 계산(simulateTraffic)·장애 엔진(createFaults·stepFaults)을 같은 기준으로 돌린다.
// 13번(마이그레이션)에서 "옮기기 전 / 옮긴 뒤" 비교에 다시 쓴다

const COMPARE_RPS = [100, 300, 1000];   // 표 위에서 고르는 트래픽 (요청/초)
// 트래픽이 이만큼(초) 이어진 뒤의 상태로 본다 (가정). 정상·AZ 장애 모두 같은 기준:
// AZ 장애는 LB 상태 확인(60초)·DB 장애 조치(약 90초)가 끝난 뒤, Auto Scaling이 있으면 서버를 늘린 뒤
const COMPARE_TIME = 300;

// 구성 하나의 요약. rps: 비교할 트래픽
// 돌려주는 값: { status, errors, warns, sugs: [{ id, title }], cost(월 달러, 47번), traffic: { served, successRate, latency } | null,
//               az: { rate, label } | null (AZ 하나가 멈췄을 때 가장 나쁜 성공률과 그 AZ 이름) }
// 트래픽·AZ 칸은 그 트래픽이 COMPARE_TIME초(5분) 이어진 뒤의 상태
// 판정이 오류면 요청이 끝까지 가지 못하므로 트래픽·AZ 계산은 하지 않는다 (성능 시뮬레이션 탭과 같은 원칙)
function compareSummary(s, rps) {
  const v = validateArchitecture(s);
  const out = {
    status: v.status,
    errors: v.issues.filter(i => i.rule.level === 'error').length,
    warns: v.issues.filter(i => i.rule.level === 'warn').length,
    sugs: v.suggestions.map(x => ({ id: x.rule.id, title: x.rule.title })),
    traffic: null, az: null,
    cost: costOf(s).total,   // 47번: 대략적인 월 비용 (달러)
  };
  if (v.status === 'error' || !s.nodes.some(n => USER_TYPES.includes(n.type))) return out;
  const t = compareRun(s, rps, null);
  out.traffic = { served: t.served, successRate: t.successRate, latency: t.latency };
  s.containers.filter(c => c.type === 'az').forEach(az => {
    const last = compareRun(s, rps, az.id);
    if (!out.az || last.successRate < out.az.rate) out.az = { rate: last.successRate, label: az.label };
  });
  return out;
}

// 트래픽 rps를 COMPARE_TIME초 동안 보낸 뒤의 계산 결과. azId: 처음부터 멈춰 둘 AZ (없으면 장애 없음)
// 성능 시뮬레이션 탭과 같은 장애 엔진으로 1초씩 진행한다 (Auto Scaling은 직전 1초 결과를 보고 늘리고 줄인다)
function compareRun(s, rps, azId) {
  const f = createFaults(s);
  if (azId) f.downAzs.add(azId);
  let last = null;
  for (let sec = 1; sec <= COMPARE_TIME; sec++) {
    stepFaults(f, sec, last);
    last = simulateTraffic(rps, simFaultOptions(f), 0, s);
  }
  return last;
}

// 두 구성의 박스 종류별 개수 차이: [{ type, name, a, b }] (개수가 다른 종류만, 팔레트 순서)
function compareBoxes(a, b) {
  const count = (s, type) => s.nodes.filter(n => n.type === type).length;
  return SERVICES.map(sv => ({ type: sv.type, name: sv.name, a: count(a, sv.type), b: count(b, sv.type) }))
    .filter(x => x.a !== x.b);
}

// 두 구성의 설정 차이 (46번): ["EC2 크기: 보통 2 → 크게 2", "Auto Scaling: 최소 2·최대 6·목표 50% → …"] (다른 것만)
function compareSettings(a, b) {
  const out = [];
  const dist = (s, type) => SIZE_KEYS.map(k => [k, s.nodes.filter(n => n.type === type && nodeSize(n) === k).length]).filter(([, c]) => c);
  const text = d => d.map(([k, c]) => `${SIZE_NAMES[k]} ${c}`).join('·');
  SERVICES.filter(sv => sizeGroupOf(sv.type)).forEach(sv => {
    const da = dist(a, sv.type), db = dist(b, sv.type);
    if (!da.length || !db.length || text(da) === text(db)) return;   // 한쪽에만 있는 종류는 박스 차이 줄에서 보인다
    out.push(`${sv.name} 크기: ${text(da)} → ${text(db)}`);
  });
  const asg = s => s.containers.filter(c => c.type === 'asg').map(c => {
    const st = asgSettings(c, asgMembersOf(c, s.nodes).length);
    return `최소 ${st.min}·최대 ${st.max}·목표 ${Math.round(st.target * 100)}%`;
  }).join(' / ');
  const ga = asg(a), gb = asg(b);
  if (ga && gb && ga !== gb) out.push(`Auto Scaling: ${ga} → ${gb}`);
  return out;
}

// 구성 두 개 비교. a: 담아 둔 구성(기준), b: 지금 구성. sumA: 이미 계산한 a의 요약 (같은 rps일 때 다시 쓰려고, 없으면 계산)
// 돌려주는 값: { a: 요약, b: 요약, boxes: 박스 차이, settings: 설정 차이(46번), sugGone: b에서 사라진 제안, sugNew: b에 새로 생긴 제안 }
function compareConfigs(a, b, rps, sumA = null) {
  const sa = sumA || compareSummary(a, rps), sb = compareSummary(b, rps);
  const ids = list => new Set(list.map(x => x.id));
  const ia = ids(sa.sugs), ib = ids(sb.sugs);
  return {
    a: sa, b: sb, boxes: compareBoxes(a, b), settings: compareSettings(a, b),
    sugGone: sa.sugs.filter(x => !ib.has(x.id)),
    sugNew: sb.sugs.filter(x => !ia.has(x.id)),
  };
}
