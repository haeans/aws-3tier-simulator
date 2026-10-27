// @ts-check
// js/ui/sim-canvas.js — UI-12 성능 시뮬레이션 캔버스 표시 (박스 색·사용률 막대·장애 상태, 트래픽 점)

/* ---------------------------------------------------------
   UI-12. 성능 시뮬레이션 캔버스 표시
   - 계산 결과(simResult, js/ui/simulate.js)를 캔버스의 박스·연결선 위에 그린다.
   - 패널·시계·그래프는 simulate.js, 계산은 js/rules/simulation.js
   --------------------------------------------------------- */

// ----- 캔버스 표시: 박스 색·사용률 막대·장애 상태 -----
const SIM_BOX_CLASSES = ['sim-ok', 'sim-busy', 'sim-over', 'sim-stuck', 'sim-down', 'sim-recover', 'sim-info'];

// 박스마다 보여줄 단계·글자·막대 길이 (없으면 null)
function simMarkOf(id, down) {
  const n = findNode(id);
  const s = simResult.nodes.get(id);
  const h = simFaults.health.get(id);
  const db = n.type === 'rds' ? simFaults.db.get(id) : null;
  const left = d => Math.max(0, d.until - simT);
  if (down.has(id)) {
    let label = '고장';
    if (APP_TYPES.includes(n.type)) label += h && !h.inService ? ' · LB 제외' : ` · 확인 ${h ? h.fails : 0}/${UNHEALTHY_COUNT}`;
    if (db && db.phase === 'failover') label += ` · 조치 ${left(db)}초`;
    if (db && db.phase === 'down') label += ' · 예비 없음';
    return { level: 'down', label, width: 0, lost: s ? s.load : 0,
      title: '멈춘 박스예요. 들어오는 요청은 모두 실패해요. (확인 n/2: LB 상태 확인 실패 횟수)' };
  }
  if (h && !h.inService) return { level: 'recover', label: `복귀 확인 ${h.oks}/${HEALTHY_COUNT}`, width: h.oks / HEALTHY_COUNT * 100,
    title: `복구됐지만 LB가 상태 확인을 ${HEALTHY_COUNT}번 연속 통과해야 다시 보내요` };
  // 장애 조치로 넘어오는 중인 Standby
  if (n.type === 'rds-standby') {
    const moving = [...simFaults.db].find(([rid, d]) => d.phase === 'failover' && d.active === rid && standbyOf(findNode(rid)) === n);
    if (moving) return { level: 'busy', label: `본체로 이동 ${left(moving[1])}초`, width: 0, title: 'RDS Multi-AZ 장애 조치 중이에요' };
  }
  if (db && db.phase === 'ok' && db.active !== id) return { level: 'recover', label: '예비로 대기', width: 0, title: '장애 조치 후 원래 본체는 예비로 남아요' };
  // WAF가 막은 공격, CloudFront가 캐시로 바로 응답한 요청 (색은 바꾸지 않고 막대만)
  if (s && s.filtered) return { level: 'info', label: `차단 ${fmt(s.filtered)}/초`, width: 100,
    title: `WAF가 공격(봇) 요청 ${fmt(s.filtered)}/초를 Load Balancer·CloudFront 앞에서 막고 있어요 (비율 기반 규칙 등)` };
  if (s && s.cacheHits) return { level: 'info', label: `캐시 응답 ${Math.round(PERF_CDN_HIT * 100)}%`, width: PERF_CDN_HIT * 100,
    title: `들어온 요청의 ${Math.round(PERF_CDN_HIT * 100)}%(${fmt(s.cacheHits)}/초)를 엣지 캐시가 바로 응답해서, 서버로는 나머지만 가요` };
  // Standby는 장애 조치로 실제 본체가 됐을 때만 "새 본체". 평소에는 복제만 하고 요청은 받지 않음 (연결선이 있어도)
  if (n.type === 'rds-standby' && ![...simFaults.db.values()].some(d => d.active === id)) {
    return { level: 'info', label: '예비로 대기', width: 0,
      title: 'Multi-AZ 예비본이에요. 본체의 데이터를 복제만 하고 요청은 받지 않아요. 본체가 고장 나면 장애 조치로 새 본체가 돼요' };
  }
  if (!s || (!s.capacity && !s.stuck)) return null;
  const pct = Math.round(s.util * 100);
  const lost = s.stuck || Math.max(0, s.load - s.served);
  // 막대에는 사용률만, 실패는 박스 위 빨간 배지로 따로 (막대 폭이 좁아 함께 쓰면 글자가 잘림)
  return {
    level: s.stuck ? 'stuck' : simLevel(s.util),
    label: s.stuck ? '연결 끊김' : n.type === 'rds-standby' ? `새 본체 · ${pct}%` : `사용률 ${pct}%`,
    width: s.stuck ? 100 : Math.min(pct, 100),
    lost,
    title: s.capacity
      ? `사용률 ${pct}% = 들어온 요청 ${fmt(s.load)} ÷ 처리할 수 있는 양 ${fmt(s.capacity)} (초당)` +
        (lost ? `\n넘친 ${fmt(lost)}요청/초는 처리하지 못하고 실패해요` : '')
      : `다음 단계와 연결되지 않아 ${fmt(lost)}요청/초가 실패해요`,
  };
}

// 박스 설명 팝업 맨 위에 붙일 시뮬레이션 설명 (시뮬레이션 탭이 아니거나 표시할 것이 없으면 빈 문자열)
// 막대·배지에 브라우저 기본 툴팁(title)을 따로 달면 박스 설명 팝업과 겹쳐 보여서, 한 팝업으로 합친다
function simTooltip(id) {
  if (resultTab !== 'sim' || !simResult || !findNode(id)) return '';
  const m = simMarkOf(id, faultDownNodes(simFaults));
  if (!m) return '';
  const lines = m.title.split('\n');
  simFaults.asg.forEach(g => { if (g.running.has(id)) lines.push(`Auto Scaling 그룹: 이 박스는 지금 EC2 ${g.running.get(id)}대`); });
  if (m.lost && !lines.some(l => l.includes('실패'))) lines.push(`처리하지 못하고 실패한 요청: ${fmt(m.lost)}/초`);
  return `<div class="tt-sim"><b>${m.label}</b>${lines.map(l => `<div>${l}</div>`).join('')}</div>`;
}

// 재생 중에는 1초마다 불리므로, 바뀐 것만 고친다 (클래스를 뺐다 넣으면 깜빡임 애니메이션이 처음부터 다시 시작됨)
function applySimMarks() {
  const on = resultTab === 'sim' && !!simResult;
  const down = on ? faultDownNodes(simFaults) : new Set();
  elMap.forEach((el, id) => {
    if (!findNode(id)) { markSimArea(el, id, on); return; }   // 영역
    markSimCount(el, id, on);
    const m = on ? simMarkOf(id, down) : null;
    SIM_BOX_CLASSES.forEach(c => { if (!m || c !== 'sim-' + m.level) el.classList.remove(c); });
    const old = el.querySelector('.sim-bar'), oldFail = el.querySelector('.sim-fail');
    if (!m || !m.lost) { if (oldFail) oldFail.remove(); }
    if (!m) { if (old) old.remove(); return; }
    el.classList.add('sim-' + m.level);
    const bar = old || el.appendChild(document.createElement('div'));
    bar.className = 'sim-bar ' + m.level;
    bar.innerHTML = `<i style="width:${m.width}%"></i><span>${m.label}</span>`;
    if (m.lost) {   // 박스 위 빨간 배지: 실패한 요청 수
      const fail = oldFail || el.appendChild(document.createElement('div'));
      fail.className = 'sim-fail';
      fail.textContent = `실패 ${fmt(m.lost)}/초`;
    }
  });
  if (!on) { stopSimDots(); return; }
  startSimDots();
}

// 영역: 멈춘 AZ 빗금, Auto Scaling 그룹 위에 지금 대수
function markSimArea(el, id, on) {
  el.classList.toggle('sim-az-down', on && simFaults.downAzs.has(id));
  const g = on ? simFaults.asg.get(id) : null;
  let tag = el.querySelector('.sim-asg');
  if (!g) { if (tag) tag.remove(); return; }
  if (!tag) tag = el.appendChild(document.createElement('div'));
  tag.className = 'sim-asg';
  const launching = g.launching.length;
  tag.textContent = `서버 ${asgRunning(g)}대${launching ? ` (+${launching}대 준비 중)` : ''} · 최소 ${g.min} · 최대 ${g.max}`;
}
// Auto Scaling 그룹 안 EC2 박스: 이름에 대수 (EC2 ×2)
function markSimCount(el, id, on) {
  const label = el.querySelector('span');
  const n = findNode(id);
  if (!label || !n) return;
  let count = null;
  if (on) simFaults.asg.forEach(g => { if (g.running.has(id)) count = g.running.get(id); });
  label.textContent = count !== null && count !== 1 ? `${SVC_MAP[n.type].name} ×${count}` : SVC_MAP[n.type].name;
}

// ----- 캔버스 표시: 트래픽 점 -----
// 요청이 지나가는 연결선마다 점이 계속 흐른다.
// - 모든 선에서 같은 속도(초당 120px)로 움직인다. 긴 선은 오래 걸리고 짧은 선은 금방 지나간다.
// - 점은 요청량에 비례해 나온다 (25요청/초마다 1초에 점 1개). 그래서 같은 요청량이면 선 길이와 상관없이 점 간격이 같다.
// - 도착 박스에서 실패하는 비율만큼의 점은 박스 앞 40px에서 빨갛게 변하고, 박스에 닿으면 0.4초 동안 커지며 사라진다.
//   (선 길이와 상관없이 똑같이 보이도록 거리·시간으로 정함)
const SIM_SPEED = 120;        // 점이 움직이는 속도(px/초)
const SIM_DOT_PER = 25;       // 점 1개가 나타내는 초당 요청 수
const SIM_MIN_GAP = 14;       // 점 사이 최소 간격(px): 너무 많아 막대처럼 붙지 않게
const SIM_FAIL_ZONE = 40;     // 실패 점이 빨갛게 변하는 거리(박스 앞, px)
const SIM_BURST = 0.4;        // 실패 점이 박스에 닿은 뒤 사라지는 시간(초)
let simRaf = null, simDotsSig = '', simT0 = 0;
let simDots = [];             // 이번 화면에 그린 점 (확인용: { edgeId, virtual, fail })
const simPools = new Map();   // 연결선별 점 요소 묶음 (다시 만들지 않고 재사용)
const simVirtualPts = new Map();   // 가상의 길(EC2 → 새 본체 Standby) 경로
const $simG = svgEl('g', { id: 'sim-g' });
document.getElementById('flow-g').after($simG);

// n번째로 나온 점이 실패하는지: 실패 비율만큼 고르게 섞음 (예: 1/3이면 3개 중 1개)
const simIsFailDot = (n, rate) => Math.floor((n + 1) * rate) - Math.floor(n * rate) >= 1;
// 도착 박스에서 실패하는 비율 (넘침·연결 끊김·장애)
const simFailRate = id => { const d = simResult.nodes.get(id); return d && d.load ? (d.load - d.served + d.stuck) / d.load : 0; };

function stopSimDots() {
  cancelAnimationFrame(simRaf);
  simRaf = null;
  simDots = [];
  simDotsSig = '';
  simPools.clear();
  simVirtualPts.clear();
  $simG.innerHTML = '';
}

function startSimDots() {
  // 가상의 길이 바뀔 때만 점선을 다시 그림. 점은 시계를 이어서 계속 흐름 (요청량이 바뀌어도 처음부터 다시 시작하지 않음)
  const sig = simResult.links.filter(l => l.virtual).map(l => l.edgeId).join('|');
  if (!simRaf || sig !== simDotsSig) {
    $simG.querySelectorAll('.sim-virtual').forEach(p => p.remove());
    simVirtualPts.clear();
    // 가상의 길: 점선으로 그림 (DB 주소가 바뀌어 새로 연결된 길, 실제로 그린 연결선이 아님)
    simResult.links.filter(l => l.virtual).forEach(l => {
      const route = edgeRoute({ id: l.edgeId, from: l.src, to: l.dst, fromSide: null, toSide: null, mid: null });
      simVirtualPts.set(l.edgeId, route.points);
      const path = svgEl('path', { d: pathD(route.points), class: 'sim-virtual' });
      path.appendChild(svgEl('title', {}));
      path.firstChild.textContent = '장애 조치로 DB 주소가 새 본체(Standby)를 가리키게 바뀌어, EC2가 바로 접속하는 길이에요';
      $simG.prepend(path);   // 점보다 아래에
    });
    simDotsSig = sig;
  }
  if (simRaf) return;
  simT0 = performance.now();
  simRaf = requestAnimationFrame(simTick);
}

// 한 화면: 연결선마다 "지금까지 나온 점"들의 위치를 계산해서 그림
function simTick(now) {
  const t = (now - simT0) / 1000;
  const head = t * SIM_SPEED;            // 처음 나온 점이 지금까지 간 거리
  const linger = SIM_BURST * SIM_SPEED;  // 사라지는 동안을 거리로 환산
  const seen = new Set();
  simDots = [];
  simResult.links.forEach(l => {
    if (l.amount <= 0) return;
    const key = `${l.edgeId}|${l.src}`;
    seen.add(key);
    let pool = simPools.get(key);
    if (!pool) simPools.set(key, pool = []);
    const pts = l.virtual ? simVirtualPts.get(l.edgeId) : edgePoints.get(l.edgeId);
    let used = 0;
    if (pts) {
      const e = state.edges.find(x => x.id === l.edgeId);
      const path = e && e.from !== l.src ? [...pts].reverse() : pts;   // 요청이 가는 방향으로
      const len = polyLength(path);
      const gap = Math.max(SIM_MIN_GAP, SIM_SPEED * SIM_DOT_PER / l.amount);
      const rate = simFailRate(l.dst);
      const end = path[path.length - 1];
      for (let n = Math.floor(head / gap); ; n--) {   // 가장 최근에 나온 점부터 거꾸로
        const d = head - n * gap;                     // 이 점이 지나온 거리
        if (d > len + linger) break;
        const fail = simIsFailDot(n, rate);
        if (d > len && !fail) continue;               // 성공한 점은 박스에 닿으면 사라짐
        const dot = pool[used] || (pool[used] = $simG.appendChild(svgEl('circle', { class: 'sim-dot' })));
        used++;
        const p = d <= len ? pointAlong(path, d) : end;
        const burst = d > len ? (d - len) / linger : 0;   // 0 → 1: 박스에 닿은 뒤 커지며 사라짐
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
        dot.setAttribute('r', String(4 + 5 * burst));
        dot.setAttribute('fill', fail && d > len - SIM_FAIL_ZONE ? FLOW_COLOR.error : FLOW_COLOR.ok);
        dot.setAttribute('opacity', String(1 - burst));
        dot.setAttribute('visibility', 'visible');
        simDots.push({ edgeId: l.edgeId, virtual: !!l.virtual, fail });
      }
    }
    for (let i = used; i < pool.length; i++) pool[i].setAttribute('visibility', 'hidden');
  });
  // 없어진 연결선의 점은 지움
  simPools.forEach((pool, key) => { if (!seen.has(key)) { pool.forEach(c => c.remove()); simPools.delete(key); } });
  simRaf = requestAnimationFrame(simTick);
}
