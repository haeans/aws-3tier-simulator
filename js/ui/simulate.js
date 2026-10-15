// @ts-check
// js/ui/simulate.js — UI-11 성능 시뮬레이션 패널·시간 흐름·그래프·캔버스 표시

/* ---------------------------------------------------------
   UI-11. 성능 시뮬레이션 (계산은 js/rules/simulation.js)
   - 결과 영역의 [성능 시뮬레이션] 탭. 시뮬레이션 시계가 1초씩 흐르며, 그 순간의 트래픽으로 다시 계산한다.
   - 재생·멈춤·배속(1x/5x/10x), 시나리오(평소·급증·장애), 최근 5분 응답 시간·성공률 그래프
   - 장애 넣기: [⚡ 장애 넣기]를 켜고 EC2·RDS 박스나 AZ 영역을 누르면 고장/복구. 자동 복구 과정은 사건 기록에 남는다
   - 검증 오류가 있으면 요청이 끝까지 가지 못하므로 실행하지 않는다 (경고는 허용).
   - 재생 중에 구성을 바꿔도 시계·그래프는 이어진다 (바꾼 전후를 그래프로 비교할 수 있게).
   --------------------------------------------------------- */
let resultTab = 'validate';   // 결과 영역 탭: 'validate' | 'sim'
let simRps = 200;             // 기본 트래픽: 사용자 전체가 1초에 보내는 요청 수
let simResult = null;         // 마지막 계산 결과 (simulateTraffic)
const SIM_MAX_RPS = 1000;

const simLevel = util => util >= 1 ? 'over' : util >= PERF_BUSY ? 'busy' : 'ok';
const fmt = v => Math.round(v).toLocaleString('ko-KR');

// ----- 시나리오: 시각 t(초)의 트래픽 -----
// 급증: 60초마다 반복. 15초 평소 → 20초 동안 3배 (이벤트·선착순 판매) → 25초 평소
// 장애 시나리오: events[t] = 그 초에 일어나는 일. 10초에 고장, 일정 시간 뒤 복구 (복구 과정은 자동)
const firstOf = type => state.nodes.find(n => n.type === type);
const SIM_SCENARIOS = {
  steady: { label: '평소 (일정)', rps: base => base },
  surge:  { label: '급증 (3배)',  rps: (base, t) => { const c = t % 60; return c >= 15 && c < 35 ? base * 3 : base; } },
  ec2:    { label: 'EC2 장애', rps: base => base, events: {
    10:  f => { const n = firstOf('ec2'); if (n) setFault(f, n.id, true); },
    100: f => { const n = firstOf('ec2'); if (n) setFault(f, n.id, false); } } },
  az:     { label: 'AZ 장애', rps: base => base, events: {   // DB 본체가 있는 AZ (없으면 첫 EC2의 AZ)
    10:  f => { const az = scenarioAz(); if (az) setAzFault(f, az.id, true); },
    130: f => { const az = scenarioAz(); if (az) setAzFault(f, az.id, false); } } },
  db:     { label: 'DB 장애', rps: base => base, events: {
    10:  f => { const n = firstOf('rds'); if (n) setFault(f, n.id, true); },
    130: f => { const n = firstOf('rds'); if (n) setFault(f, n.id, false); } } },
};
const scenarioAz = () => { const n = firstOf('rds') || firstOf('ec2'); return n ? simAzOf(n) : null; };
const SIM_HISTORY = 300;      // 그래프에 남기는 시간(초): 장애 → 감지 → 복구가 한 그래프에 들어오게 5분
let simFaults = createFaults();
let simFaultMode = false;     // 켜면 박스·AZ를 눌러 고장/복구
let simScenario = 'steady';
let simPlaying = true;        // 탭을 열면 바로 재생
let simSpeed = 1;             // 배속
let simT = 0;                 // 시뮬레이션 경과 시간(초)
let simHistory = [];          // [{ t, rps, success, latency }]
let simClockRaf = null, simAcc = 0, simLast = 0;

const simNowRps = () => SIM_SCENARIOS[simScenario].rps(simRps, simT);

// 박스·AZ 고장/복구 (사건 기록에 남김)
function setFault(f, id, on) {
  if (f.down.has(id) === on) return;
  if (on) f.down.add(id); else f.down.delete(id);
  f.log.push({ t: simT, text: `${simNodeName(id)} ${on ? '고장' : '복구'}` });
}
function setAzFault(f, azId, on) {
  if (f.downAzs.has(azId) === on) return;
  if (on) f.downAzs.add(azId); else f.downAzs.delete(azId);
  const az = findContainer(azId);
  f.log.push({ t: simT, text: `${az ? az.label : 'AZ'} 전체 ${on ? '장애 (안의 EC2·DB가 모두 멈춤)' : '복구'}` });
}
const clockText = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

function renderSimPanel(head) {
  simResult = null;
  stopSimAll();
  if (!state.nodes.length) {
    head.insertAdjacentHTML('beforeend', '<span class="msg">서비스를 먼저 배치해주세요.</span>');
    return;
  }
  if (validateArchitecture().status === 'error') {
    head.insertAdjacentHTML('beforeend', '<span class="msg">검증 오류가 있어 요청이 끝까지 가지 못해요. ' +
      '[검증 결과] 탭에서 오류를 먼저 고쳐주세요.</span>');
    return;
  }
  head.insertAdjacentHTML('beforeend', `<span class="msg">${PERF_NOTE}</span>`);

  const box = document.createElement('div');
  box.className = 'sim-panel';
  box.innerHTML =
    '<div class="sim-controls">' +
    '<button class="btn sim-play" id="sim-play"></button>' +
    '<span class="sim-speed">' + [1, 5, 10].map(s => `<button class="btn" data-speed="${s}">${s}x</button>`).join('') + '</span>' +
    '<label>시나리오 <select id="sim-scenario">' +
    Object.entries(SIM_SCENARIOS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('') + '</select></label>' +
    '<span class="sim-clock">경과 <b id="sim-clock"></b></span>' +
    '<button class="btn sim-fault" id="sim-fault">⚡ 장애 넣기</button>' +
    '<button class="btn" id="sim-heal">모두 복구</button>' +
    '</div>' +
    '<label class="sim-traffic">기본 트래픽 <input type="range" id="sim-rps" min="0" max="' + SIM_MAX_RPS + '" step="10">' +
    '<b id="sim-rps-val"></b> 요청/초 <span class="sim-now" id="sim-now"></span></label>' +
    '<div class="sim-stats">' +
    '<span>처리 <b id="sim-served"></b></span>' +
    '<span>성공률 <b id="sim-success"></b></span>' +
    '<span>평균 응답 시간 <b id="sim-latency"></b></span>' +
    '</div>' +
    '<div class="sim-charts">' +
    '<figure><figcaption>응답 시간 (최근 5분)</figcaption><svg id="sim-chart-lat" viewBox="0 0 300 70"></svg></figure>' +
    '<figure><figcaption>성공률 (최근 5분)</figcaption><svg id="sim-chart-ok" viewBox="0 0 300 70"></svg></figure>' +
    '<figure class="sim-log-box"><figcaption>사건 기록</figcaption><ol class="sim-log" id="sim-log"></ol></figure>' +
    '</div>' +
    '<div class="sim-bottleneck" id="sim-bottleneck"></div>' +
    '<div class="sim-assume">가정: ' +
    Object.entries(PERF).filter(([, p]) => p.capacity).map(([t, p]) => `${SVC_MAP[t].name} 1대 초당 ${p.capacity}요청`).join(' · ') +
    ' · Load Balancer·IGW·CloudFront는 AWS가 알아서 늘려서 제한 없음 ' +
    `(<a href="${PERF_DOCS.lb}" target="_blank" rel="noopener">ELB 문서 ↗</a>) · 그래프의 붉은 배경은 트래픽이 평소보다 많은 구간, 세로선은 사건<br>` +
    `장애 복구는 AWS 기본값: LB 상태 확인 30초마다·2번 실패하면 제외·5번 성공하면 다시 넣음 ` +
    `(<a href="${PERF_DOCS.health}" target="_blank" rel="noopener">ALB 문서 ↗</a>), ` +
    `RDS 장애 조치 약 90초 (<a href="${PERF_DOCS.failover}" target="_blank" rel="noopener">RDS 문서: 보통 60~120초 ↗</a>)</div>`;
  $result.appendChild(box);

  const slider = /** @type {HTMLInputElement} */ (box.querySelector('#sim-rps'));
  slider.value = String(simRps);
  // 끌 때는 render() 없이 숫자와 막대만 바꿈 (render하면 슬라이더가 다시 만들어져 끌기가 끊김)
  slider.addEventListener('input', () => { simRps = Number(slider.value); computeSim(); });
  const play = /** @type {HTMLButtonElement} */ (box.querySelector('#sim-play'));
  play.addEventListener('click', () => { simPlaying = !simPlaying; syncSimControls(); simPlaying ? startSimClock() : stopSimClock(); });
  box.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
    simSpeed = Number(b.getAttribute('data-speed'));
    syncSimControls();
  }));
  const scenario = /** @type {HTMLSelectElement} */ (box.querySelector('#sim-scenario'));
  scenario.value = simScenario;
  scenario.addEventListener('change', () => {   // 시나리오를 바꾸면 처음부터 (장애도 모두 지움)
    simScenario = scenario.value;
    simT = 0;
    simHistory = [];
    simFaults = createFaults();
    computeSim();
    drawSimCharts();
    syncSimControls();
  });
  box.querySelector('#sim-fault').addEventListener('click', () => setSimFaultMode(!simFaultMode));
  box.querySelector('#sim-heal').addEventListener('click', () => {
    [...simFaults.down].forEach(id => setFault(simFaults, id, false));
    [...simFaults.downAzs].forEach(id => setAzFault(simFaults, id, false));
    computeSim();
  });
  syncSimControls();
  computeSim();
  drawSimCharts();
  if (simPlaying) startSimClock();
}

// 장애 넣기 모드 켜기/끄기: 켜는 동안은 선택을 풀고 끌기·삭제·되돌리기를 막는다 (실수로 구성이 바뀌지 않게)
function setSimFaultMode(on) {
  simFaultMode = on;
  if (on) {
    select(null);
    showToast('고장 낼 EC2·RDS 박스나 AZ 영역을 누르세요. 다시 누르면 복구돼요. (끄기: Esc)');
  }
  syncSimControls();
}

// 재생 버튼·배속 버튼·시계 표시를 지금 상태에 맞춤
function syncSimControls() {
  const play = document.getElementById('sim-play');
  if (play) play.textContent = simPlaying ? '⏸ 멈춤' : '▶ 재생';
  document.querySelectorAll('.sim-speed [data-speed]').forEach(b =>
    b.classList.toggle('active', Number(b.getAttribute('data-speed')) === simSpeed));
  const clock = document.getElementById('sim-clock');
  if (clock) clock.textContent = clockText(simT);
  const fault = document.getElementById('sim-fault');
  if (fault) fault.classList.toggle('active', simFaultMode);
  document.body.classList.toggle('fault-mode', simFaultMode && resultTab === 'sim');
}

// ----- 시뮬레이션 시계: 1초(배속이면 더 빨리)마다 한 걸음 -----
function startSimClock() {
  if (simClockRaf) return;
  simLast = performance.now();
  simAcc = 0;
  const tick = now => {
    simAcc += (now - simLast) / 1000 * simSpeed;
    simLast = now;
    while (simAcc >= 1) { simAcc -= 1; simStep(); }
    simClockRaf = requestAnimationFrame(tick);
  };
  simClockRaf = requestAnimationFrame(tick);
}
function stopSimClock() {
  cancelAnimationFrame(simClockRaf);
  simClockRaf = null;
}
function stopSimAll() {
  stopSimClock();
  stopSimDots();
  document.body.classList.remove('fault-mode');
}

// 1초 진행: 그 순간의 트래픽으로 계산하고 그래프에 한 점 추가
function simStep() {
  simT++;
  const logged = simFaults.log.length;
  const events = SIM_SCENARIOS[simScenario].events;
  if (events && events[simT]) events[simT](simFaults);
  stepFaults(simFaults, simT);
  computeSim();
  // 이번 초에 사건이 있었으면 그래프에 세로선
  const mark = simFaults.log.length > logged;
  simHistory.push({ t: simT, rps: simResult.rps, success: simResult.successRate, latency: simResult.latency, mark });
  if (simHistory.length > SIM_HISTORY) simHistory.shift();
  syncSimControls();
  drawSimCharts();
}

// 지금 시각의 트래픽으로 다시 계산하고 숫자·박스 표시를 갱신
function computeSim() {
  simResult = simulateTraffic(simNowRps(), simFaultOptions(simFaults));
  renderSimLog();
  const r = simResult;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('sim-rps-val', fmt(simRps));
  set('sim-now', r.rps !== simRps ? `→ 지금 ${fmt(r.rps)}요청/초 (급증 중)` : '');
  set('sim-served', `${fmt(r.served)} / ${fmt(r.rps)} 요청/초`);
  set('sim-success', `${(r.successRate * 100).toFixed(1)}%`);
  set('sim-latency', r.served ? `${fmt(r.latency)}ms` : '-');
  const success = document.getElementById('sim-success');
  if (success) success.className = r.successRate < 1 ? 'bad' : '';

  // 가장 바쁜 박스 (80% 이상일 때만 병목으로 안내)
  const busiest = [...r.nodes.entries()].filter(([, s]) => s.capacity).sort((a, b) => b[1].util - a[1].util)[0];
  // 넘길 곳이 없어 실패하는 박스 (예: RDS와 연결되지 않은 EC2) — 병목보다 먼저 안내
  const stuck = [...r.nodes.entries()].filter(([, s]) => s.stuck > 0);
  // 멈춘 박스·장애 조치 중인 DB로 가서 실패하는 요청
  const blocked = [...r.nodes.entries()].filter(([, s]) => s.blocked && s.load > 0);
  const neck = document.getElementById('sim-bottleneck');
  if (neck) {
    neck.textContent = '';
    if (blocked.length) {
      const lost = blocked.reduce((sum, [, s]) => sum + s.load, 0);
      neck.textContent = `장애: ${blocked.map(([id]) => simNodeName(id)).join(', ')}에 보낸 ${fmt(lost)}요청/초가 실패하고 있어요. ` +
        '사건 기록에서 자동 복구가 어디까지 왔는지 확인해보세요.';
      neck.className = 'sim-bottleneck over';
    } else if (stuck.length) {
      const type = findNode(stuck[0][0]).type, name = SVC_MAP[type].name;
      const lost = stuck.reduce((sum, [, s]) => sum + s.stuck, 0);
      const need = (PERF_ROUTES[USER_TYPES.includes(type) ? 'user' : type] || []).map(t => SVC_MAP[t].name).join('/');
      neck.textContent = `연결 끊김: ${name} → ${need} 연결이 없는 박스가 ${stuck.length}개 있어서, ` +
        `${fmt(lost)}요청/초가 처리 도중 실패해요. 다음 단계와 연결해주세요.`;
      neck.className = 'sim-bottleneck over';
    } else if (busiest && busiest[1].util >= PERF_BUSY) {
      const s = busiest[1], name = SVC_MAP[findNode(busiest[0]).type].name;
      neck.textContent = s.util >= 1
        ? `병목: ${name}가 감당할 수 있는 양보다 ${fmt(s.load - s.capacity)}요청/초 더 들어와서, 넘친 요청은 실패해요.`
        : `거의 꽉 참: ${name} 사용률이 ${Math.round(s.util * 100)}%예요. 조금만 더 늘면 느려지고 실패하기 시작해요.`;
      neck.className = 'sim-bottleneck ' + simLevel(s.util);
    }
  }
  applySimMarks();
}

// ----- 캔버스 표시: 박스 색·사용률 막대·장애 상태 -----
const SIM_BOX_CLASSES = ['sim-ok', 'sim-busy', 'sim-over', 'sim-stuck', 'sim-down', 'sim-recover'];

// 박스마다 보여줄 단계·글자·막대 길이 (없으면 null)
function simMarkOf(id, down) {
  const n = findNode(id);
  const s = simResult.nodes.get(id);
  const h = simFaults.health.get(id);
  const db = n.type === 'rds' ? simFaults.db.get(id) : null;
  const left = d => Math.max(0, d.until - simT);
  if (down.has(id)) {
    let label = '고장';
    if (n.type === 'ec2') label += h && !h.inService ? ' · LB 제외' : ` · 확인 ${h ? h.fails : 0}/${UNHEALTHY_COUNT}`;
    if (db && db.phase === 'failover') label += ` · 조치 ${left(db)}초`;
    if (db && db.phase === 'down') label += ' · 예비 없음';
    return { level: 'down', label, width: 0, title: '멈춘 박스예요. 들어오는 요청은 모두 실패해요. (확인 n/2: LB 상태 확인 실패 횟수)' };
  }
  if (h && !h.inService) return { level: 'recover', label: `복귀 확인 ${h.oks}/${HEALTHY_COUNT}`, width: h.oks / HEALTHY_COUNT * 100,
    title: `복구됐지만 LB가 상태 확인을 ${HEALTHY_COUNT}번 연속 통과해야 다시 보내요` };
  // 장애 조치로 넘어오는 중인 Standby
  if (n.type === 'rds-standby') {
    const moving = [...simFaults.db].find(([rid, d]) => d.phase === 'failover' && d.active === rid && standbyOf(findNode(rid)) === n);
    if (moving) return { level: 'busy', label: `본체로 이동 ${left(moving[1])}초`, width: 0, title: 'RDS Multi-AZ 장애 조치 중이에요' };
  }
  if (db && db.phase === 'ok' && db.active !== id) return { level: 'recover', label: '예비로 대기', width: 0, title: '장애 조치 후 원래 본체는 예비로 남아요' };
  if (!s || (!s.capacity && !s.stuck)) return null;
  const pct = Math.round(s.util * 100);
  const lost = s.stuck || Math.max(0, s.load - s.served);
  const promoted = n.type === 'rds-standby' ? '새 본체 · ' : '';
  return {
    level: s.stuck ? 'stuck' : simLevel(s.util),
    label: s.stuck ? '연결 끊김' : `${promoted}${pct}%${lost ? ` · 실패 ${fmt(lost)}` : ''}`,
    width: s.stuck ? 100 : Math.min(pct, 100),
    title: s.capacity
      ? `들어옴 ${fmt(s.load)}요청/초 · 처리 가능 ${fmt(s.capacity)}요청/초` + (lost ? ` · 실패 ${fmt(lost)}요청/초` : '')
      : `다음 단계와 연결되지 않아 ${fmt(lost)}요청/초가 실패해요`,
  };
}

// 재생 중에는 1초마다 불리므로, 바뀐 것만 고친다 (클래스를 뺐다 넣으면 깜빡임 애니메이션이 처음부터 다시 시작됨)
function applySimMarks() {
  const on = resultTab === 'sim' && !!simResult;
  const down = on ? faultDownNodes(simFaults) : new Set();
  elMap.forEach((el, id) => {
    if (!findNode(id)) { el.classList.toggle('sim-az-down', on && simFaults.downAzs.has(id)); return; }   // 영역
    const m = on ? simMarkOf(id, down) : null;
    SIM_BOX_CLASSES.forEach(c => { if (!m || c !== 'sim-' + m.level) el.classList.remove(c); });
    const old = el.querySelector('.sim-bar');
    if (!m) { if (old) old.remove(); return; }
    el.classList.add('sim-' + m.level);
    const bar = old || el.appendChild(document.createElement('div'));
    bar.className = 'sim-bar ' + m.level;
    bar.title = m.title;
    bar.innerHTML = `<i style="width:${m.width}%"></i><span>${m.label}</span>`;
  });
  if (!on) { stopSimDots(); return; }
  startSimDots();
}

// 사건 기록 (최근 것이 위, 6개까지)
function renderSimLog() {
  const list = document.getElementById('sim-log');
  if (!list) return;
  const items = simFaults.log.slice(-6).reverse();
  list.innerHTML = items.length
    ? items.map(e => `<li><b>${clockText(e.t)}</b> ${e.text}</li>`).join('')
    : '<li class="empty">아직 사건이 없어요. [⚡ 장애 넣기]나 장애 시나리오로 시작해보세요.</li>';
}

// 장애 넣기 모드: 박스·AZ를 누르면 고장/복구 (끌기·선택보다 먼저 가로챔)
$world.addEventListener('pointerdown', e => {
  if (!simFaultMode || resultTab !== 'sim' || !simResult || e.button !== 0) return;
  const target = /** @type {Element} */ (e.target);
  const el = target.closest('.node') || target.closest('.area');
  if (!el) return;
  const hit = [...elMap].find(([, v]) => v === el);
  if (!hit) return;
  const id = hit[0];
  e.stopPropagation();
  e.preventDefault();
  const n = findNode(id);
  if (n) {
    if (!FAULT_TYPES.includes(n.type)) { showToast('장애는 EC2·RDS 박스나 AZ 영역에 넣을 수 있어요.', 'warn'); return; }
    setFault(simFaults, id, !simFaults.down.has(id));
  } else {
    let c = findContainer(id);
    while (c && c.type !== 'az') c = findContainer(c.parentContainer);
    if (!c) { showToast('장애는 EC2·RDS 박스나 AZ 영역에 넣을 수 있어요.', 'warn'); return; }
    setAzFault(simFaults, c.id, !simFaults.downAzs.has(c.id));
  }
  computeSim();
}, true);
// 장애 넣기 모드에서는 박스·영역의 클릭(삭제 버튼 등)이 원래 동작을 하지 않게 막음
$world.addEventListener('click', e => {
  if (!simFaultMode || resultTab !== 'sim') return;
  const target = /** @type {Element} */ (e.target);
  if (target.closest('.node') || target.closest('.area')) { e.stopPropagation(); e.preventDefault(); }
}, true);

// ----- 캔버스 표시: 트래픽 점 -----
// 요청이 지나가는 연결선마다 점이 계속 흐른다. 요청이 많을수록 점이 촘촘하다 (25요청/초마다 1개, 최대 12개).
// 도착 박스에서 실패하는 비율만큼의 점은 끝에서 빨갛게 변해 사라진다 (넘침·연결 끊김).
const SIM_HOP = 1.2;          // 점 하나가 연결선을 지나는 시간(초)
const SIM_DOT_PER = 25;       // 점 1개가 나타내는 초당 요청 수
const SIM_DOT_MAX = 12;
let simRaf = null, simDots = [], simDotsSig = '';
const simVirtualPts = new Map();   // 가상의 길(EC2 → 새 본체 Standby) 경로
const $simG = svgEl('g', { id: 'sim-g' });
document.getElementById('flow-g').after($simG);

function stopSimDots() {
  cancelAnimationFrame(simRaf);
  simRaf = null;
  simDots = [];
  simDotsSig = '';
  simVirtualPts.clear();
  $simG.innerHTML = '';
}

function startSimDots() {
  // 연결선마다 점 개수·실패 비율이 그대로면 흐르던 점을 그대로 둠 (재생 중 1초마다 다시 시작하면 점이 튐)
  const failOf = id => { const d = simResult.nodes.get(id); return d && d.load ? (d.load - d.served + d.stuck) / d.load : 0; };
  const sig = simResult.links.map(l => `${l.edgeId}:${Math.round(l.amount / SIM_DOT_PER)}:${failOf(l.dst).toFixed(2)}`).join('|');
  if (simRaf && sig === simDotsSig) return;
  stopSimDots();
  simDotsSig = sig;
  // 가상의 길: 점선으로 그림 (DB 주소가 바뀌어 새로 연결된 길, 실제로 그린 연결선이 아님)
  simResult.links.filter(l => l.virtual).forEach(l => {
    const route = edgeRoute({ id: l.edgeId, from: l.src, to: l.dst, fromSide: null, toSide: null, mid: null });
    simVirtualPts.set(l.edgeId, route.points);
    const path = svgEl('path', { d: pathD(route.points), class: 'sim-virtual' });
    path.appendChild(svgEl('title', {}));
    path.firstChild.textContent = '장애 조치로 DB 주소가 새 본체(Standby)를 가리키게 바뀌어, EC2가 바로 접속하는 길이에요';
    $simG.appendChild(path);
  });
  simResult.links.forEach(l => {
    if (l.amount <= 0) return;
    // 짧은 선에 점이 몰려 막대처럼 보이지 않게, 선 길이 18px마다 1개까지만
    const pts = l.virtual ? simVirtualPts.get(l.edgeId) : edgePoints.get(l.edgeId);
    const room = pts ? Math.max(1, Math.floor(polyLength(pts) / 18)) : SIM_DOT_MAX;
    const count = Math.min(SIM_DOT_MAX, room, Math.max(1, Math.round(l.amount / SIM_DOT_PER)));
    const d = simResult.nodes.get(l.dst);
    const failRate = d && d.load ? (d.load - d.served + d.stuck) / d.load : 0;
    const e = state.edges.find(x => x.id === l.edgeId);
    const reverse = e ? e.from !== l.src : false;
    for (let i = 0; i < count; i++) {
      const dot = svgEl('circle', { r: 4, class: 'sim-dot' });
      $simG.appendChild(dot);
      simDots.push({ edgeId: l.edgeId, virtual: l.virtual, reverse, offset: i / count, fail: (i + 0.5) / count < failRate, dot });
    }
  });
  const t0 = performance.now();
  const tick = now => {
    const t = (now - t0) / 1000 / SIM_HOP;
    simDots.forEach(s => {
      const pts = s.virtual ? simVirtualPts.get(s.edgeId) : edgePoints.get(s.edgeId);
      if (!pts) { s.dot.setAttribute('visibility', 'hidden'); return; }
      const k = (t + s.offset) % 1;
      const path = s.reverse ? [...pts].reverse() : pts;
      const p = pointAlong(path, polyLength(path) * k);
      const failing = s.fail && k > 0.7;   // 끝 30%에서 빨갛게 변하며 사라짐
      s.dot.setAttribute('cx', p.x);
      s.dot.setAttribute('cy', p.y);
      s.dot.setAttribute('fill', failing ? FLOW_COLOR.error : FLOW_COLOR.ok);
      s.dot.setAttribute('opacity', failing ? String(Math.max(0, (1 - k) / 0.3)) : '1');
      s.dot.setAttribute('visibility', 'visible');
    });
    simRaf = requestAnimationFrame(tick);
  };
  simRaf = requestAnimationFrame(tick);
}

// ----- 그래프: 최근 60초 응답 시간·성공률 (외부 라이브러리 없이 SVG로 직접) -----
// 가로 300칸(1초씩, 5분), 붉은 배경 = 트래픽이 기본 트래픽보다 많은 구간(급증), 세로선 = 사건
function drawSimChart(svg, values, { max, unit, color, digits = 0 }) {
  const W = 300, H = 70, L = 36, R = 6, T = 6, B = 12;
  const x = i => L + (W - L - R) * i / (SIM_HISTORY - 1);
  const y = v => T + (H - T - B) * (1 - Math.min(v, max) / max);
  const label = v => `${v.toFixed(digits)}${unit}`;
  let html = `<line class="axis" x1="${L}" y1="${y(max)}" x2="${W - R}" y2="${y(max)}"/>` +
    `<line class="axis" x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}"/>` +
    `<text x="${L - 4}" y="${y(max) + 4}" text-anchor="end">${label(max)}</text>` +
    `<text x="${L - 4}" y="${y(0) + 3}" text-anchor="end">${label(0)}</text>`;
  simHistory.forEach((h, i) => {
    const w = (W - L - R) / (SIM_HISTORY - 1);
    if (h.rps > simRps) html += `<rect class="surge" x="${x(i) - w / 2}" y="${T}" width="${w}" height="${H - T - B}"/>`;
    if (h.mark) html += `<line class="mark" x1="${x(i)}" y1="${T}" x2="${x(i)}" y2="${H - B}"/>`;
  });
  if (values.length > 1) {
    html += `<polyline fill="none" stroke="${color}" stroke-width="2" points="${values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`;
    const last = values.length - 1;
    html += `<circle cx="${x(last)}" cy="${y(values[last])}" r="3" fill="${color}"/>`;
  } else {
    html += `<text class="empty" x="${(L + W) / 2}" y="${H / 2 + 3}" text-anchor="middle">재생하면 그래프가 그려져요</text>`;
  }
  svg.innerHTML = html;
}

function drawSimCharts() {
  const lat = document.getElementById('sim-chart-lat'), ok = document.getElementById('sim-chart-ok');
  if (!lat || !ok) return;
  const lats = simHistory.map(h => h.latency);
  // 응답 시간 눈금: 100ms 단위로 올림 (최소 200ms)
  const top = Math.max(200, Math.ceil(Math.max(0, ...lats) * 1.2 / 100) * 100);
  drawSimChart(lat, lats, { max: top, unit: 'ms', color: '#2e73b8' });
  drawSimChart(ok, simHistory.map(h => h.success * 100), { max: 100, unit: '%', color: '#2e9e47' });
}
