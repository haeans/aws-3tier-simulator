// @ts-check
// js/ui/simulate.js — UI-11 성능 시뮬레이션 패널·시간 흐름·그래프 (캔버스 표시는 sim-canvas.js)

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
const firstOf = (...types) => state.nodes.find(n => types.includes(n.type));
const SIM_SCENARIOS = {
  steady: { label: '평소 (일정)', rps: base => base },
  surge:  { label: '급증 (3배)',  rps: (base, t) => { const c = t % 60; return c >= 15 && c < 35 ? base * 3 : base; } },
  ec2:    { label: 'EC2 장애', rps: base => base, events: {
    10:  f => { const n = firstOf(...APP_TYPES); if (n) setFault(f, n.id, true); },
    100: f => { const n = firstOf(...APP_TYPES); if (n) setFault(f, n.id, false); } } },
  az:     { label: 'AZ 장애', rps: base => base, events: {   // DB 본체가 있는 AZ (없으면 첫 EC2의 AZ)
    10:  f => { const az = scenarioAz(); if (az) setAzFault(f, az.id, true); },
    130: f => { const az = scenarioAz(); if (az) setAzFault(f, az.id, false); } } },
  attack: { label: '공격 (봇 트래픽)', rps: base => base,   // 60초마다 15~45초: 기본 트래픽의 3배만큼 봇 요청이 함께 들어옴 (반복)
    attack: (base, t) => { const c = t % 60; return c >= 15 && c < 45 ? base * PERF_ATTACK : 0; } },
  db:     { label: 'DB 장애', rps: base => base, events: {
    10:  f => { const n = firstOf('rds'); if (n) setFault(f, n.id, true); },
    130: f => { const n = firstOf('rds'); if (n) setFault(f, n.id, false); } } },
};
const scenarioAz = () => { const n = firstOf('rds') || firstOf(...APP_TYPES); return n ? azOf(n) : null; };
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
const simNowAttack = () => { const sc = SIM_SCENARIOS[simScenario]; return sc.attack ? sc.attack(simRps, simT) : 0; };

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
    '<button class="btn" id="sim-reset" title="경과 시간·그래프·사건 기록을 비우고, 넣은 장애도 모두 복구해요">⟲ 처음부터</button>' +
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
    '<div class="sim-assume"><b>박스 안 사용률</b> = 들어온 요청 ÷ 처리할 수 있는 양. 100%를 넘으면 넘친 만큼 실패하고, 박스 안 위쪽 빨간 배지에 초당 실패 수가 떠요.</div>' +
    '<details class="sim-assume"><summary>가정값과 근거 문서</summary>가정: ' +
    Object.entries(PERF).filter(([, p]) => p.capacity).map(([t, p]) => `${SVC_MAP[t].name} 1대 초당 ${p.capacity}요청`).join(' · ') +
    ' · Load Balancer·IGW·CloudFront는 AWS가 알아서 늘려서 제한 없음 ' +
    `(<a href="${PERF_DOCS.lb}" target="_blank" rel="noopener">ELB 문서 ↗</a>) · 그래프의 붉은 배경은 트래픽이 평소보다 많은 구간, 세로선은 사건<br>` +
    `장애 복구는 AWS 기본값: LB 상태 확인 30초마다·2번 실패하면 제외·5번 성공하면 다시 넣음 ` +
    `(<a href="${PERF_DOCS.health}" target="_blank" rel="noopener">ALB 문서 ↗</a>), ` +
    `RDS 장애 조치 약 90초 (<a href="${PERF_DOCS.failover}" target="_blank" rel="noopener">RDS 문서: 보통 60~120초 ↗</a>)<br>` +
    `Auto Scaling: 평균 사용률 목표 50%, 1분 넘으면 늘림(새 서버 약 90초 뒤 투입), 5분 낮으면 1대씩 줄임, 최대 = 처음 대수 × 3 ` +
    `(<a href="${PERF_DOCS.asg}" target="_blank" rel="noopener">목표 추적 문서 ↗</a>, 시간·최대는 가정)<br>` +
    `캐시·복제본: CloudFront가 요청의 ${PERF_CDN_HIT * 100}%를 엣지에서 응답 (<a href="${PERF_DOCS.cdn}" target="_blank" rel="noopener">캐시 적중률 ↗</a>), ` +
    `ElastiCache가 DB 조회의 ${PERF_CACHE_HIT * 100}%를 응답 (<a href="${PERF_DOCS.cache}" target="_blank" rel="noopener">lazy loading ↗</a>), ` +
    `DB 조회의 ${PERF_READ_SHARE * 100}%는 읽기라 Read Replica로 (<a href="${PERF_DOCS.replica}" target="_blank" rel="noopener">Read Replica ↗</a>), ` +
    `공격은 WAF가 앞에서 막음 (<a href="${PERF_DOCS.waf}" target="_blank" rel="noopener">비율 기반 규칙 ↗</a>) · 비율은 가정</details>`;
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
    resetSim();
  });
  box.querySelector('#sim-reset').addEventListener('click', resetSim);
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

// 처음부터: 경과 시간 0:00, 그래프·사건 기록 비움, 장애·상태 확인·장애 조치 상태도 모두 처음으로
// (기본 트래픽·시나리오·배속·재생/멈춤은 그대로)
function resetSim() {
  simT = 0;
  simHistory = [];
  simFaults = createFaults();
  computeSim();
  drawSimCharts();
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
  stepFaults(simFaults, simT, simResult);
  computeSim();
  // 이번 초에 사건이 있었으면 그래프에 세로선
  const mark = simFaults.log.length > logged;
  simHistory.push({ t: simT, rps: simResult.rps, attack: simResult.attack, success: simResult.successRate, latency: simResult.latency, mark });
  if (simHistory.length > SIM_HISTORY) simHistory.shift();
  syncSimControls();
  drawSimCharts();
}

// 지금 시각의 트래픽으로 다시 계산하고 숫자·박스 표시를 갱신
function computeSim() {
  simResult = simulateTraffic(simNowRps(), simFaultOptions(simFaults), simNowAttack());
  renderSimLog();
  const r = simResult;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('sim-rps-val', fmt(simRps));
  set('sim-now', r.rps !== simRps ? `→ 지금 ${fmt(r.rps)}요청/초 (급증 중)`
    : r.attack ? `+ 공격 ${fmt(r.attack)}요청/초 (${r.attackBlocked ? 'WAF가 막는 중' : '막는 곳 없음'})` : '');
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
    const d = simDiagnose(r, busiest, stuck, blocked);
    neck.innerHTML = '';
    neck.className = d ? 'sim-bottleneck ' + d.level : 'sim-bottleneck';
    if (d) {
      neck.appendChild(document.createTextNode(d.msg));
      if (d.fix) neck.appendChild(Object.assign(document.createElement('div'), { className: 'sim-fix', textContent: '→ ' + d.fix }));
    }
  }
  applySimMarks();
}

// ----- 지금 문제와 해결 방법 (기존 판정·제안 규칙과 연결) -----
// 우선순위: 막지 못한 공격 → 장애 → 연결 끊김 → 병목(80% 이상)
function simDiagnose(r, busiest, stuck, blocked) {
  const inAsg = id => [...simFaults.asg.values()].find(g => g.running.has(id)) || null;
  const has = type => state.nodes.some(n => n.type === type);
  if (r.attack && !r.attackBlocked) return { level: 'over',
    msg: `공격: 봇 요청 ${fmt(r.attack)}요청/초가 정상 요청과 섞여 서버까지 들어오고 있어요. 서버가 바빠져 정상 요청도 실패해요.`,
    fix: 'WAF를 Load Balancer나 CloudFront에 붙이면 앞에서 막아요 (제안 9 웹 방화벽)' };
  if (blocked.length) {
    const lost = blocked.reduce((sum, [, s]) => sum + s.load, 0);
    const dbStuck = [...simFaults.db.values()].some(d => d.phase === 'down');
    const ec2 = blocked.find(([id]) => APP_TYPES.includes(findNode(id).type));
    return { level: 'over',
      msg: `장애: ${blocked.map(([id]) => simNodeName(id)).join(', ')}에 보낸 ${fmt(lost)}요청/초가 실패하고 있어요.`,
      fix: dbStuck ? '다른 AZ에 RDS Standby를 두면 장애 조치로 이어져요 (판정 7 고가용성)'
        : ec2 && !inAsg(ec2[0]) ? 'EC2를 Auto Scaling 그룹에 넣으면 고장 난 EC2를 자동으로 교체해요 (제안 4 자동 확장)'
          : '자동 복구가 진행 중이에요. 사건 기록에서 어디까지 왔는지 확인해보세요.' };
  }
  if (stuck.length) {
    const type = findNode(stuck[0][0]).type, name = SVC_MAP[type].name;
    const lost = stuck.reduce((sum, [, s]) => sum + s.stuck, 0);
    const need = (PERF_ROUTES[USER_TYPES.includes(type) ? 'user' : type] || []).map(t => SVC_MAP[t].name).join('/');
    return { level: 'over', msg: `연결 끊김: ${name} → ${need} 연결이 없는 박스가 ${stuck.length}개 있어서, ${fmt(lost)}요청/초가 처리 도중 실패해요.`,
      fix: '다음 단계와 연결해주세요.' };
  }
  if (!busiest || busiest[1].util < PERF_BUSY) return null;
  const [id, s] = busiest;
  const type = findNode(id).type, name = SVC_MAP[type].name;
  const msg = s.util >= 1
    ? `병목: ${name}가 감당할 수 있는 양보다 ${fmt(s.load - s.capacity)}요청/초 더 들어와서, 넘친 요청은 실패해요.`
    : `거의 꽉 참: ${name} 사용률이 ${Math.round(s.util * 100)}%예요. 조금만 더 늘면 느려지고 실패하기 시작해요.`;
  let fix = '';
  if (APP_TYPES.includes(type)) {
    const g = inAsg(id);
    const cdn = has('cloudfront') ? '' : ' · CloudFront를 두면 정적 요청을 엣지에서 처리해 서버로 오는 요청이 줄어요 (제안 2 CDN 사용)';
    fix = !g ? 'EC2를 Auto Scaling 그룹에 넣으면 바쁠 때 자동으로 늘어나요 (제안 4 자동 확장)' + cdn
      : g.launching.length ? `Auto Scaling이 EC2를 늘리는 중이에요 (+${g.launching.length}대 준비 중)`
        : asgRunning(g) >= g.max ? '그룹이 최대 대수에 닿았어요.' + cdn
          : 'Auto Scaling이 1분 동안 지켜본 뒤 늘려요.';
  } else if (RDS_TYPES.includes(type)) {
    const tips = [];
    if (!has('elasticache')) tips.push('ElastiCache로 자주 읽는 데이터를 캐싱하세요 (제안 1 DB 캐싱)');
    if (!has('rds-replica')) tips.push('Read Replica를 EC2와 연결해 읽기 조회를 나누세요');
    fix = tips.length ? tips.join(' · ') : '캐시·복제본으로 더 나눌 곳이 없어요 (이 도구는 DB 크기 조절은 다루지 않아요)';
  }
  return { level: simLevel(s.util), msg, fix };
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
    if (h.rps > simRps || h.attack > 0) html += `<rect class="surge" x="${x(i) - w / 2}" y="${T}" width="${w}" height="${H - T - B}"/>`;
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
