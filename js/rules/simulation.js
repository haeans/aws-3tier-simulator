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
//   instances: Auto Scaling 그룹 안 EC2 박스가 나타내는 서버 대수 (없으면 1대). 처리량이 대수만큼 늘고, LB도 대수만큼 더 보냄
// rps: 사용자 전체가 1초에 보내는 정상 요청 수 / attack: 함께 들어오는 공격(봇) 요청 수
//   공격 요청은 WAF가 요청 경로의 CloudFront·LB에 붙어 있으면 그 앞에서 막히고, 없으면 정상 요청과 섞여 서버까지 들어온다.
//   서버는 둘을 가리지 못하므로, 정상 요청의 성공률 = 전체 중 처리된 비율
// 캐시·복제본: CloudFront는 정적 요청 몫을 엣지에서 바로 응답, ElastiCache는 캐시에 있는 조회를 응답,
//   Read Replica는 읽기 조회를 나눠 받는다 (비율은 PERF_CDN_HIT, PERF_CACHE_HIT, PERF_READ_SHARE)
// 결과: { rps, attack, attackBlocked, served, successRate, latency,
//         nodes: Map(id → { load, served, capacity, util, stuck, blocked, count, cacheHits, filtered }),
//         links: [{ edgeId, src, dst, amount, virtual }] (요청이 지나간 연결선과 초당 요청 수, 캔버스의 트래픽 점용)
//           virtual: 그려진 연결선이 없는 길 (장애 조치 후 EC2 → 새 본체 Standby). edgeId는 'v:출발:도착' }
function simulateTraffic(rps, faults = null, attack = 0) {
  const F = faults || { down: new Set(), excluded: new Set(), dbBlocked: new Set(), redirect: new Map(), instances: new Map() };
  const countOf = id => (F.instances && F.instances.has(id) ? F.instances.get(id) : 1);
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
  // WAF가 요청 경로의 CloudFront·LB에 붙어 있으면 공격 요청을 막음 (비율 기반 규칙 등)
  const frontsOf = id => state.edges.filter(e => e.from === id || e.to === id).map(e => findNode(e.from === id ? e.to : e.from))
    .filter(m => m && (m.type === 'cloudfront' || m.type === 'lb') && dist.has(m.id));
  const guard = attack > 0 ? state.nodes.find(w => w.type === 'waf' && frontsOf(w.id).length) : null;
  const total = rps + (guard ? 0 : attack);
  users.forEach(u => add(u.id, users.length ? total / users.length : 0, 0));

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
    const count = countOf(id);
    const capacity = perf && perf.capacity !== null ? perf.capacity * count : null;
    // 멈췄거나 장애 조치 중이거나 서버가 0대: 들어온 요청이 모두 실패
    const blocked = F.down.has(id) || F.dbBlocked.has(id) || count === 0;
    const done = blocked ? 0 : capacity === null ? amount : Math.min(amount, capacity);
    const util = capacity ? amount / capacity : 0;
    const lat = (amount ? inLat.get(id) / amount : 0) + (perf ? perf.latency * queueFactor(Math.min(util, 1)) : 0);
    // stuck: 처리는 했지만 넘길 곳이 없어 실패한 요청 수 (예: RDS와 연결되지 않은 EC2)
    const info = { load: amount, served: done, capacity, util, stuck: 0, blocked, count };
    if (perf || USER_TYPES.includes(n.type)) nodes.set(id, info);

    // 다음 박스: PERF_ROUTES의 앞 종류부터, 더 먼 쪽에 연결된 박스에 고르게
    const route = PERF_ROUTES[USER_TYPES.includes(n.type) ? 'user' : n.type];
    const farther = adj.get(id).map(findNode).filter(m => dist.get(m.id) > dist.get(id));
    const nextType = (route || []).find(t => farther.some(m => m.type === t));
    let next = nextType ? farther.filter(m => m.type === nextType) : [];
    // LB는 상태 확인으로 뺀 EC2에는 보내지 않음. 모두 빠졌으면 모두에게 보냄 (fail open, ALB 문서)
    const healthy = next.filter(m => !F.excluded.has(m.id) && countOf(m.id) > 0);
    if (healthy.length) next = healthy;
    if (blocked) return;
    if (!next.length) {
      // 넘길 차례가 정해진 박스(사용자·LB·EC2 등)에서 멈추면 실패, 마지막 차례(RDS)면 성공
      if (route) info.stuck = done;
      else { served += done; latSum += done * lat; }
      return;
    }
    // 넘길 양: CloudFront는 엣지 캐시가 바로 응답한 몫(성공)을 빼고 원본(IGW)으로
    let fwd = done;
    if (n.type === 'cloudfront') {
      const hits = done * PERF_CDN_HIT;
      info.cacheHits = hits;
      served += hits;
      latSum += hits * lat;
      fwd = done - hits;
    }
    // 서버 대수만큼 나눔 (Auto Scaling으로 2대가 된 박스는 2배를 받음, 기본 라운드 로빈)
    const weightOf = m => Math.max(countOf(m.id), 0) || 1;
    const totalWeight = next.reduce((sum, m) => sum + weightOf(m), 0);
    const targets = next.map(m => ({ m, share: fwd * weightOf(m) / totalWeight }));
    // EC2의 DB 조회: ElastiCache가 연결돼 있으면 캐시에 있는 몫은 캐시가 응답 (lazy loading)
    //               Read Replica가 연결돼 있으면 남은 조회 중 읽기 몫은 Replica로, 쓰기는 본체(RDS)로
    if (n.type === 'ec2' && nextType === 'rds') {
      const caches = farther.filter(m => m.type === 'elasticache');
      const replicas = farther.filter(m => m.type === 'rds-replica');
      let rest = 1;
      const extra = [];
      if (caches.length) {
        caches.forEach(m => extra.push({ m, share: fwd * PERF_CACHE_HIT / caches.length }));
        rest -= PERF_CACHE_HIT;
      }
      if (replicas.length) {
        const reads = rest * PERF_READ_SHARE;
        replicas.forEach(m => extra.push({ m, share: fwd * reads / replicas.length }));
        rest -= reads;
      }
      targets.forEach(x => { x.share *= rest; });
      targets.push(...extra);
    }
    targets.forEach(({ m, share }) => {
      const to = F.redirect.get(m.id) || m.id;
      add(to, share, lat);
      if (to !== m.id) {
        // 장애 조치로 Standby가 새 본체: DB 주소가 Standby를 가리키게 바뀌어 EC2가 바로 접속 (그려진 선이 없는 가상의 길)
        addLink(`v:${id}:${to}`, id, to, share, true);
        return;
      }
      const e = edgeOf(id, m.id);
      if (e) addLink(e.id, id, m.id, share);
    });
  });
  if (guard) nodes.set(guard.id, { load: attack, served: 0, capacity: null, util: 0, stuck: 0, blocked: false, count: 1, filtered: attack });
  // 정상 요청의 성공: 서버는 정상·공격을 가리지 못하므로 처리된 비율을 똑같이 나눠 가짐
  const legit = total ? served * rps / total : 0;
  return {
    rps, attack, attackBlocked: !!guard, served: legit,
    successRate: rps ? legit / rps : 1,
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
// asg: Auto Scaling 그룹별 상태 (stepAsg)
function createFaults() {
  return { down: new Set(), downAzs: new Set(), health: new Map(), db: new Map(), asg: new Map(), log: [] };
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

// 1초 진행: 상태 확인·장애 조치·Auto Scaling을 진행하고 사건을 기록
// last: 직전 1초의 계산 결과 (Auto Scaling이 평균 사용률을 볼 때 씀)
function stepFaults(f, t, last = null) {
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
  stepAsg(f, t, last, faultDownNodes(f));
}

/* ----- Auto Scaling 그룹 (목표 추적) -----
   - 그룹 영역 안의 EC2 박스 하나 = 그 AZ의 서버 묶음. 박스마다 서버 대수(running)를 센다.
   - 최소 = 처음 놓은 EC2 수, 최대 = 최소의 3배 (가정)
   - 늘리기: 그룹 평균 사용률이 목표 50%(문서 예시)를 1분(가정) 넘으면, 50%가 되도록 필요한 대수를 올림해서 한 번에 추가
   - 새 서버: 띄우는 데 60초(가정) + LB 상태 확인 1번 통과(30초) = 90초 뒤 요청을 받음
   - 줄이기: 1대를 빼도 50% 아래인 상태가 5분(가정) 이어지면 1대씩. 새 서버를 띄우는 중에는 줄이지 않음 (문서)
   - 고장 교체: 그룹 안 EC2가 고장 나서 LB에서 빠지면 새 EC2로 교체. AZ 장애면 다른 AZ에 띄우고, 돌아오면 균형을 맞춤 */
const ASG_TARGET = 0.5, ASG_OUT_AFTER = 60, ASG_IN_AFTER = 300, ASG_READY = 90, ASG_MAX_FACTOR = 3;

// 그룹 영역 안의 EC2 박스 (박스 중심이 영역 안)
function asgMembers(area) {
  return state.nodes.filter(n => n.type === 'ec2' && inRect(rectOf(area), centerOf(n)));
}
const asgRunning = g => [...g.running.values()].reduce((a, b) => a + b, 0);

// 그룹 상태를 만들고 그룹 안 박스 변화에 맞춤 (새 박스는 1대, 빠진 박스는 지움). 그룹 안에 EC2가 없으면 null
function asgState(f, area) {
  const members = asgMembers(area);
  if (!members.length) { f.asg.delete(area.id); return null; }
  let g = f.asg.get(area.id);
  if (!g) {
    g = { min: 0, max: 0, running: new Map(), launching: [], highFor: 0, lowFor: 0, maxNoted: false };
    f.asg.set(area.id, g);
  }
  members.forEach(m => { if (!g.running.has(m.id)) g.running.set(m.id, 1); });
  [...g.running.keys()].forEach(id => { if (!members.some(m => m.id === id)) g.running.delete(id); });
  g.launching = g.launching.filter(l => members.some(m => m.id === l.box));
  g.min = members.length;
  g.max = members.length * ASG_MAX_FACTOR;
  return { g, members };
}

function stepAsg(f, t, last, down) {
  const log = text => f.log.push({ t, text });
  const cap = PERF.ec2.capacity;
  state.containers.filter(c => c.type === 'asg').forEach(area => {
    const st = asgState(f, area);
    if (!st) return;
    const { g, members } = st;
    const up = members.filter(m => !down.has(m.id));
    const nameOf = id => simNodeName(id);

    // 1) 준비가 끝난 새 서버: 요청을 받기 시작
    const done = g.launching.filter(l => l.readyAt <= t);
    g.launching = g.launching.filter(l => l.readyAt > t);
    let added = 0;
    done.forEach(l => {
      if (l.replace) {   // 같은 자리 교체: 고장을 풀고 다시 넣음
        f.down.delete(l.box);
        f.health.set(l.box, { fails: 0, oks: 0, inService: true });
        g.running.set(l.box, 1);
        log(`Auto Scaling이 고장 난 ${nameOf(l.box)}를 새 EC2로 교체했어요`);
        return;
      }
      const box = down.has(l.box) ? (up[0] && up[0].id) : l.box;   // 그사이 그 AZ가 멈췄으면 다른 곳으로
      if (!box) return;
      g.running.set(box, (g.running.get(box) || 0) + 1);
      if (l.rebalance && (g.running.get(l.rebalance) || 0) > 1) g.running.set(l.rebalance, g.running.get(l.rebalance) - 1);
      added++;
    });
    if (added) log(`새 EC2 ${added}대가 준비를 마치고 요청을 받기 시작했어요 (그룹 ${asgRunning(g)}대)`);

    // 2) 고장 교체: LB 상태 확인으로 빠진 박스의 서버를 새로 띄움
    members.forEach(m => {
      const h = f.health.get(m.id);
      const lost = g.running.get(m.id) || 0;
      if (!down.has(m.id) || !h || h.inService || lost === 0) return;
      g.running.set(m.id, 0);
      const az = simAzOf(m);
      if (!(az && f.downAzs.has(az.id))) {   // 박스만 고장: 같은 자리에 교체
        g.launching.push({ box: m.id, readyAt: t + ASG_READY, replace: true });
        log(`Auto Scaling이 고장 난 ${nameOf(m.id)}를 알아채고 새 EC2로 교체하기 시작해요 (약 ${ASG_READY}초)`);
      } else if (up.length) {                // AZ 장애: 살아 있는 다른 AZ에 띄움
        for (let i = 0; i < lost; i++) g.launching.push({ box: up[i % up.length].id, readyAt: t + ASG_READY });
        log(`${az.label}가 멈춰서 Auto Scaling이 다른 AZ에 새 EC2 ${lost}대를 띄워요 (약 ${ASG_READY}초)`);
      }
    });

    // 3) AZ 균형: 다시 살아난 박스에 서버가 0대면, 가장 많은 박스에서 1대를 옮겨 옴
    members.forEach(m => {
      if (down.has(m.id) || (g.running.get(m.id) || 0) > 0 || g.launching.some(l => l.box === m.id)) return;
      const most = [...g.running].sort((a, b) => b[1] - a[1])[0];
      if (!most || most[1] < 2) return;
      g.launching.push({ box: m.id, readyAt: t + ASG_READY, rebalance: most[0] });
      log(`${nameOf(m.id)}가 돌아와서 AZ 균형을 맞추려고 새 EC2를 띄워요`);
    });

    // 4) 목표 추적: 그룹 평균 사용률 = 살아 있는 박스에 들어온 요청 ÷ 처리할 수 있는 양
    const running = up.reduce((sum, m) => sum + (g.running.get(m.id) || 0), 0);
    const load = up.reduce((sum, m) => sum + ((last && last.nodes.get(m.id)) ? last.nodes.get(m.id).load : 0), 0);
    const util = running ? load / (running * cap) : 0;
    const total = running + g.launching.length;
    g.highFor = util > ASG_TARGET ? g.highFor + 1 : 0;
    if (g.highFor >= ASG_OUT_AFTER) {
      g.highFor = 0;
      const need = Math.min(g.max, Math.ceil(load / (cap * ASG_TARGET)));
      const add = need - total;
      if (add > 0 && up.length) {
        for (let i = 0; i < add; i++) g.launching.push({ box: up[i % up.length].id, readyAt: t + ASG_READY });
        log(`평균 사용률 ${Math.round(util * 100)}%가 1분 넘게 목표 50%보다 높아서 EC2를 늘려요 (${total}대 → ${total + add}대, 약 ${ASG_READY}초 뒤 투입)`);
        g.maxNoted = false;
      } else if (total >= g.max && !g.maxNoted) {
        g.maxNoted = true;
        log(`최대 ${g.max}대라서 더 늘릴 수 없어요`);
      }
    }
    // 줄이기: 띄우는 중이 아니고, 1대를 빼도 목표 아래일 때 5분 지나면 1대
    const canShrink = !g.launching.length && running > g.min && load / ((running - 1) * cap) < ASG_TARGET;
    g.lowFor = canShrink ? g.lowFor + 1 : 0;
    if (g.lowFor >= ASG_IN_AFTER) {
      g.lowFor = 0;
      const most = [...g.running].filter(([id]) => !down.has(id)).sort((a, b) => b[1] - a[1])[0];
      if (most && most[1] > 1) {
        g.running.set(most[0], most[1] - 1);
        log(`사용률이 5분 넘게 낮아서 EC2 1대를 줄여요 (${running}대 → ${running - 1}대)`);
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
  state.containers.filter(c => c.type === 'asg').forEach(area => asgState(f, area));   // 시작 전에도 그룹 대수를 보이게
  const instances = new Map();
  f.asg.forEach(g => g.running.forEach((n, id) => instances.set(id, n)));
  return { down: faultDownNodes(f), excluded, dbBlocked, redirect, instances };
}
