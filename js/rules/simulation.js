// @ts-check
// js/rules/simulation.js — 성능 시뮬레이션 계산 엔진 (화면과 분리된 계산만)

/* =========================================================
   성능 시뮬레이션 엔진
   - 사용자에게서 초당 rps개의 요청이 들어온다고 보고, PERF_ROUTES를 따라 박스마다 나눠 보낸다.
   - 용량(capacity)이 있는 박스는 넘친 요청을 처리하지 못한다 (실패). 처리한 요청만 다음 박스로 넘어간다.
   - 더 넘길 곳이 없는 박스(보통 RDS)까지 처리된 요청이 "성공"이다.
   - 응답 시간: 거친 박스의 기본 지연 × 대기 배수(바쁠수록 커짐)의 합, 성공한 요청 기준 평균
   ========================================================= */

// 바쁠수록 대기 시간이 늘어나는 배수 (사용률 0% → 1배, 50% → 2배, 90% 이상 → 10배)
const queueFactor = util => util < 0.9 ? 1 / (1 - util) : 10;

// 사용자에서 출발해 요청이 닿는 박스까지의 거리 (Route 53·WAF는 길이 아니므로 거치지 않음)
function perfDistances() {
  const PASS_OFF = ['route53', 'waf'];
  const adj = new Map(state.nodes.map(n => [n.id, []]));
  state.edges.forEach(e => {
    if (!adj.has(e.from) || !adj.has(e.to)) return;
    if (PASS_OFF.includes(findNode(e.from).type) || PASS_OFF.includes(findNode(e.to).type)) return;
    adj.get(e.from).push(e.to); adj.get(e.to).push(e.from);
  });
  const queue = state.nodes.filter(n => USER_TYPES.includes(n.type)).map(n => n.id);
  const dist = new Map(queue.map(id => [id, 0]));
  for (let i = 0; i < queue.length; i++) {
    adj.get(queue[i]).forEach(nb => {
      if (!dist.has(nb)) { dist.set(nb, dist.get(queue[i]) + 1); queue.push(nb); }
    });
  }
  return { adj, dist };
}

// faults: 장애 반영 (simFaultOptions의 결과, 없으면 장애 없음)
//   down: 멈춘 박스 / excluded: LB가 상태 확인으로 뺀 EC2 / dbBlocked: 장애 조치 중이거나 넘어갈 곳이 없는 RDS
//   redirect: 장애 조치가 끝나 다른 박스(Standby)가 대신 처리하는 RDS → 대신 처리하는 박스
// rps: 사용자 전체가 1초에 보내는 요청 수
// 결과: { rps, served, successRate, latency, nodes: Map(id → { load, served, capacity, util, stuck }),
//         links: [{ edgeId, src, dst, amount, virtual }] (요청이 지나간 연결선과 초당 요청 수, 캔버스의 트래픽 점용)
//           virtual: 그려진 연결선이 없는 길 (장애 조치 후 EC2 → 새 본체 Standby). edgeId는 'v:출발:도착' }
function simulateTraffic(rps, faults = null) {
  const F = faults || { down: new Set(), excluded: new Set(), dbBlocked: new Set(), redirect: new Map() };
  const { adj, dist } = perfDistances();
  // 대신 처리하는 박스(Standby)는 연결선이 없어도 원래 박스와 같은 차례에 처리
  F.redirect.forEach((to, from) => { if (dist.has(from) && !dist.has(to) && findNode(to)) dist.set(to, dist.get(from)); });
  const users = state.nodes.filter(n => USER_TYPES.includes(n.type));
  const load = new Map();     // 박스에 들어온 요청 수
  const inLat = new Map();    // 들어온 요청의 평균 누적 지연(ms) × 요청 수 (가중 합)
  const add = (id, amount, lat) => {
    load.set(id, (load.get(id) || 0) + amount);
    inLat.set(id, (inLat.get(id) || 0) + amount * lat);
  };
  users.forEach(u => add(u.id, users.length ? rps / users.length : 0, 0));

  const nodes = new Map();
  const links = [];
  const edgeOf = (a, b) => state.edges.find(e => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  // 같은 연결선·같은 방향으로 가는 요청은 하나로 합침 (여러 EC2가 같은 RDS → Standby 선을 쓰는 경우)
  const addLink = (edgeId, src, dst, amount, virtual = false) => {
    const same = links.find(l => l.edgeId === edgeId && l.src === src);
    if (same) same.amount += amount; else links.push({ edgeId, src, dst, amount, virtual });
  };
  let served = 0, latSum = 0;
  // 사용자에 가까운 박스부터 차례로 처리 (요청은 더 먼 박스로만 넘어감)
  [...dist.keys()].sort((a, b) => dist.get(a) - dist.get(b)).forEach(id => {
    const n = findNode(id);
    const amount = load.get(id) || 0;
    const perf = PERF[n.type];
    const capacity = perf ? perf.capacity : null;
    const blocked = F.down.has(id) || F.dbBlocked.has(id);   // 멈췄거나 장애 조치 중: 들어온 요청이 모두 실패
    const done = blocked ? 0 : capacity === null ? amount : Math.min(amount, capacity);
    const util = capacity ? amount / capacity : 0;
    const lat = (amount ? inLat.get(id) / amount : 0) + (perf ? perf.latency * queueFactor(Math.min(util, 1)) : 0);
    // stuck: 처리는 했지만 넘길 곳이 없어 실패한 요청 수 (예: RDS와 연결되지 않은 EC2)
    const info = { load: amount, served: done, capacity, util, stuck: 0, blocked };
    if (perf || USER_TYPES.includes(n.type)) nodes.set(id, info);

    // 다음 박스: PERF_ROUTES의 앞 종류부터, 더 먼 쪽에 연결된 박스에 고르게
    const route = PERF_ROUTES[USER_TYPES.includes(n.type) ? 'user' : n.type];
    const farther = adj.get(id).map(findNode).filter(m => dist.get(m.id) > dist.get(id));
    const nextType = (route || []).find(t => farther.some(m => m.type === t));
    let next = nextType ? farther.filter(m => m.type === nextType) : [];
    // LB는 상태 확인으로 뺀 EC2에는 보내지 않음. 모두 빠졌으면 모두에게 보냄 (fail open, ALB 문서)
    const healthy = next.filter(m => !F.excluded.has(m.id));
    if (healthy.length) next = healthy;
    if (blocked) return;
    if (!next.length) {
      // 넘길 차례가 정해진 박스(사용자·LB·EC2 등)에서 멈추면 실패, 마지막 차례(RDS)면 성공
      if (route) info.stuck = done;
      else { served += done; latSum += done * lat; }
      return;
    }
    next.forEach(m => {
      const to = F.redirect.get(m.id) || m.id;
      add(to, done / next.length, lat);
      if (to !== m.id) {
        // 장애 조치로 Standby가 새 본체: DB 주소가 Standby를 가리키게 바뀌어 EC2가 바로 접속 (그려진 선이 없는 가상의 길)
        addLink(`v:${id}:${to}`, id, to, done / next.length, true);
        return;
      }
      const e = edgeOf(id, m.id);
      if (e) addLink(e.id, id, m.id, done / next.length);
    });
  });
  return {
    rps, served,
    successRate: rps ? served / rps : 1,
    latency: served ? latSum / served : 0,
    nodes, links,
  };
}

/* =========================================================
   장애와 자동 복구 (시뮬레이션 시계 1초마다 stepFaults)
   - LB 상태 확인: 30초마다, 2번 연속 실패하면 EC2를 빼고, 5번 연속 성공하면 다시 넣는다 (ALB 기본값)
   - RDS Multi-AZ: 본체가 멈추면 다른 AZ의 Standby로 장애 조치. 약 90초 동안 DB 요청 실패 (문서: 보통 60~120초)
   - AZ 장애: 그 AZ 안의 EC2·DB가 모두 멈춤. LB·IGW는 여러 AZ에 걸친 관리형이라 그대로 동작
   ========================================================= */
const HEALTH_INTERVAL = 30, UNHEALTHY_COUNT = 2, HEALTHY_COUNT = 5, FAILOVER_TIME = 90;
const FAULT_TYPES = ['ec2', ...RDS_TYPES];   // 장애를 넣을 수 있는 박스

// 박스가 속한 AZ 영역 (없으면 null)
function simAzOf(n) {
  let c = findContainer(n.parentContainer);
  while (c && c.type !== 'az') c = findContainer(c.parentContainer);
  return c || null;
}
// 사건 기록용 이름: "EC2(가용 영역 A)"
function simNodeName(id) {
  const n = findNode(id);
  if (!n) return '';
  const az = simAzOf(n);
  return SVC_MAP[n.type].name + (az ? `(${az.label})` : '');
}

// down: 직접 끈 박스, downAzs: 끈 AZ, health: EC2별 LB 상태 확인, db: RDS별 장애 조치 상태, log: 사건 기록
function createFaults() {
  return { down: new Set(), downAzs: new Set(), health: new Map(), db: new Map(), log: [] };
}

// 실제로 멈춘 박스: 직접 끈 박스 + 끈 AZ 안의 EC2·DB
function faultDownNodes(f) {
  const set = new Set();
  state.nodes.forEach(n => {
    if (!FAULT_TYPES.includes(n.type)) return;
    const az = simAzOf(n);
    if (f.down.has(n.id) || (az && f.downAzs.has(az.id))) set.add(n.id);
  });
  return set;
}

// RDS 본체의 짝 Standby (다른 AZ에 있는 첫 Standby)
function standbyOf(rds) {
  const az = simAzOf(rds);
  const s = state.nodes.find(n => n.type === 'rds-standby' && simAzOf(n) && simAzOf(n) !== az);
  return s || null;
}

// 1초 진행: 상태 확인·장애 조치를 진행하고 사건을 기록
function stepFaults(f, t) {
  const down = faultDownNodes(f);
  const log = text => f.log.push({ t, text });
  // LB 상태 확인 (30초마다)
  if (t % HEALTH_INTERVAL === 0) state.nodes.filter(n => n.type === 'ec2').forEach(n => {
    const h = f.health.get(n.id) || { fails: 0, oks: 0, inService: true };
    f.health.set(n.id, h);
    if (down.has(n.id)) {
      h.oks = 0;
      h.fails++;
      if (h.inService && h.fails >= UNHEALTHY_COUNT) {
        h.inService = false;
        log(`LB 상태 확인 ${h.fails}번 연속 실패 → ${simNodeName(n.id)}에 더 이상 보내지 않아요`);
      }
    } else {
      h.fails = 0;
      if (!h.inService && ++h.oks >= HEALTHY_COUNT) {
        h.inService = true;
        h.oks = 0;
        log(`LB 상태 확인 ${HEALTHY_COUNT}번 연속 성공 → ${simNodeName(n.id)}에 다시 보내요`);
      }
    }
  });
  // RDS 장애 조치
  state.nodes.filter(n => n.type === 'rds').forEach(r => {
    const standby = standbyOf(r);
    const d = f.db.get(r.id) || { active: r.id, phase: 'ok', until: 0 };
    f.db.set(r.id, d);
    if (d.active !== r.id && (!standby || d.active !== standby.id)) d.active = r.id;   // Standby를 지웠으면 원래대로
    const other = d.active === r.id ? (standby ? standby.id : null) : r.id;
    const canMove = other && !down.has(other);
    if (d.phase === 'ok' && down.has(d.active)) {
      if (canMove) {
        d.phase = 'failover';
        d.until = t + FAILOVER_TIME;
        log(`${simNodeName(d.active)} 고장 → ${simNodeName(other)}로 장애 조치 시작 (약 ${FAILOVER_TIME}초, 그동안 DB 요청 실패)`);
      } else {
        d.phase = 'down';
        log(`${simNodeName(d.active)} 고장 → 넘어갈 Standby가 없어서 DB 요청이 모두 실패해요`);
      }
    } else if (d.phase === 'failover' && t >= d.until) {
      if (canMove) {
        log(`장애 조치 완료 → ${simNodeName(other)}가 새 본체가 되어 요청을 처리해요`);
        d.active = other;
        d.phase = 'ok';
      } else d.phase = 'down';
    } else if (d.phase === 'down') {
      if (!down.has(d.active)) {
        d.phase = 'ok';
        log(`${simNodeName(d.active)} 복구 → DB 요청을 다시 처리해요`);
      } else if (canMove) {
        d.phase = 'failover';
        d.until = t + FAILOVER_TIME;
        log(`${simNodeName(other)}로 장애 조치 시작 (약 ${FAILOVER_TIME}초)`);
      }
    }
  });
}

// 엔진(simulateTraffic)에 넘길 장애 정보
function simFaultOptions(f) {
  const excluded = new Set([...f.health].filter(([, h]) => !h.inService).map(([id]) => id));
  const dbBlocked = new Set(), redirect = new Map();
  f.db.forEach((d, id) => {
    if (d.phase !== 'ok') dbBlocked.add(id);
    else if (d.active !== id) redirect.set(id, d.active);
  });
  return { down: faultDownNodes(f), excluded, dbBlocked, redirect };
}
