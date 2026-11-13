// @ts-check
// js/ui/result.js — UI-8 검증 결과 표시·동적 흐름

/* ---------------------------------------------------------
   UI-8. 검증 결과 표시 (규칙 자체는 "검증 규칙" 구역)
   --------------------------------------------------------- */

// 검증에 영향을 주는 부분만 비교 (연결선 경로·연결 변 조절은 제외)
const stateSig = () => JSON.stringify({
  nodes: state.nodes, containers: state.containers,
  edges: state.edges.map(ed => [ed.from, ed.to]),
});
const LEVEL_TEXT = { error: '오류', warn: '경고' };
const STATUS_TEXT = {
  ok:    { label: '정상', desc: '3-Tier 아키텍처의 기본 흐름이 모두 갖춰졌어요!' },
  warn:  { label: '경고', desc: '동작은 하지만 권장 구성은 아니에요.' },
  error: { label: '오류', desc: '이대로는 서비스가 동작하지 않아요.' },
};

const $validateBtn = document.getElementById('btn-validate');

// [검증하기]를 누르면 검증, 결과가 떠 있을 때 다시 누르면([검증 종료]) 결과를 지우고 검증 전 화면으로
function runValidation() {
  if (validation) {
    validation = null;
    resultNote = '검증을 종료했어요. [검증하기]를 누르면 다시 확인할 수 있어요.';
    render();
    return;
  }
  if (!state.nodes.length) {
    validation = null;
    resultNote = '서비스를 먼저 배치해주세요.';
    showToast('서비스를 먼저 배치해주세요.', 'warn');
    render();
    return;
  }
  validation = { sig: stateSig(), ...validateArchitecture() };
  validation.flow = computeFlow(validation.nodeLevels);
  render();
}

// ----- 동적 흐름: 검증 후 사용자에서 안쪽으로, 요청이 지나가는 순서대로 한 구간씩 점이 흐른다 -----
// 사용자 → IGW 구간이 끝나면 IGW → LB 구간이 시작되는 식. 갈림길은 동시에, 마지막 구간 뒤 잠깐 쉬고 반복.
// 정상=초록, 경고(병목)=노랑(느림), 오류=빨강(아주 느림). 성능 계산이 아니라 검증 결과를 보여주는 표시.
// 27번: 요청 점(채운 원)이 끝까지 간 뒤 응답 점(빈 원)이 같은 길을 거꾸로 돌아온다. 한 번에 요청 하나의 왕복만 보여 준다.
//        캐시(CloudFront·ElastiCache)가 있으면 "캐시에 없는 요청"과 "캐시에 있는 요청"을 번갈아 보여 준다.
//        보기 전환: [사용자 요청] / [서버 통신](서버가 시작한 통신 선을 따라 갔다 오는 흐름)
// Route 53은 주소를 묻고 받는 왕복, WAF는 박스 반짝임으로 보여준다.
const FLOW_HOP = { ok: 0.8, warn: 1.6, error: 3.2 };   // 한 구간을 지나는 시간(초)
const FLOW_PAUSE = 0.6;                                 // 한 바퀴 끝나고 쉬는 시간(초)
const FLOW_TURN = 0.3;                                  // 요청이 끝에 닿은 뒤 응답이 출발하기까지(초)
const FLOW_COLOR = { ok: '#2e9e47', warn: '#e0a800', error: '#d13212' };
const FLOW_RESPONSE = '#1a73e8';   // 응답 점: 단계 색과 겹치지 않는 파랑 하나 (정상·병목·오류는 요청 점 색으로 보임, 27번)
const FLOW_SOURCES = [...USER_TYPES, 'dbadmin'];
const $flowG = document.getElementById('flow-g');
let flowRaf = null, flowFor = null, flowDots = [];
let flowLabel = '';         // 지금 보여 주는 요청 설명 (결과 패널을 다시 그려도 유지)
let flowView = 'request';   // 'request' 사용자 요청 | 'server' 서버 통신 (27번)

// 요청 경로의 한 단계가 아니라, 경로 위의 박스가 잠깐 거쳤다가 다음으로 넘어가는 곳
//   Route 53: 사용자가 먼저 도메인 주소를 물어보고(점 왕복), 답을 받은 뒤 CloudFront·IGW로 출발
//   WAF: 따로 오가는 길이 없다. CloudFront·Load Balancer에 붙은 규칙으로 그 자리에서 검사하므로,
//        요청이 도착하면 WAF 박스가 반짝이는 동안(검사) 기다렸다가 다음으로 보냄
const SIDE_TRIP_TYPES = ['route53', 'waf'];
const INSPECT_TYPES = ['waf'];

// 사용자 박스에서 연결을 따라가며 거리를 매겨 방향을 정한다 (가까운 쪽 → 먼 쪽). 사용자와 이어지지 않은 선은 흐르지 않음.
// keep: 이번 흐름에 쓸 연결선만 고르는 함수 (캐시에 있는/없는 요청을 따로 그릴 때, 27번)
function computeFlow(nodeLevels, keep = null) {
  const isSide = id => SIDE_TRIP_TYPES.includes(findNode(id).type);
  const adj = new Map(state.nodes.map(n => [n.id, []]));
  // 25번: 요청 선만 흐른다 (서버 통신·복제·설정 관계는 흐름 점 없음). WAF는 설정 관계지만 검사 반짝임으로 남긴다
  const isWaf = id => findNode(id).type === 'waf';
  const edges = state.edges.filter(e => adj.has(e.from) && adj.has(e.to) &&
    (isWaf(e.from) || isWaf(e.to) || edgeInfoOf(e).kind === 'request') && (!keep || keep(e)));
  edges.forEach(e => {
    if (isSide(e.from) || isSide(e.to)) return;   // 들르는 곳은 경로를 잇지 않음
    adj.get(e.from).push(e.to); adj.get(e.to).push(e.from);
  });
  const queue = state.nodes.filter(n => FLOW_SOURCES.includes(n.type)).map(n => n.id);
  const dist = new Map(queue.map(id => [id, 0]));
  for (let i = 0; i < queue.length; i++) {
    adj.get(queue[i]).forEach(nb => {
      if (!dist.has(nb)) { dist.set(nb, dist.get(queue[i]) + 1); queue.push(nb); }
    });
  }
  const levelOf = (x, y) => {
    const lv = [nodeLevels.get(x), nodeLevels.get(y)];
    return lv.includes('error') ? 'error' : lv.includes('warn') ? 'warn' : 'ok';
  };
  const flow = [];
  edges.forEach(e => {
    const sideFrom = isSide(e.from), sideTo = isSide(e.to);
    if (sideFrom && sideTo) return;
    const level = levelOf(e.from, e.to);
    if (sideFrom || sideTo) {   // 경로 위 박스(src)가 거쳐 가는 곳(dst): 왕복(Route 53) 또는 검사 반짝임(WAF)
      const host = sideFrom ? e.to : e.from, side = sideFrom ? e.from : e.to;
      const inspect = INSPECT_TYPES.includes(findNode(side).type);
      if (dist.has(host)) flow.push({ id: e.id, reverse: sideFrom, roundTrip: !inspect, inspect, level,
        src: host, dst: side, start: 0, dur: FLOW_HOP[level] * (inspect ? 1 : 2) });
      return;
    }
    if (!dist.has(e.from) || !dist.has(e.to)) return;
    const reverse = dist.get(e.to) < dist.get(e.from);
    flow.push({ id: e.id, reverse, roundTrip: false, inspect: false, level, src: reverse ? e.to : e.from, dst: reverse ? e.from : e.to, start: 0, dur: FLOW_HOP[level] });
  });
  // 박스마다 들렀다 오는 시간 (여러 곳이면 동시에 다녀옴)
  const wait = new Map();
  const side = flow.filter(f => f.roundTrip || f.inspect);
  side.forEach(f => wait.set(f.src, Math.max(wait.get(f.src) || 0, f.dur)));
  // 시작 시각: 출발 박스에 요청이 처음 도착한 시각 + 들렀다 오는 시간 (사용자 쪽에 가까운 구간부터 차례로 계산)
  const arrival = new Map(queue.filter(id => dist.get(id) === 0).map(id => [id, 0]));
  flow.filter(f => !side.includes(f)).sort((a, b) => dist.get(a.src) - dist.get(b.src)).forEach(f => {
    f.start = (arrival.get(f.src) || 0) + (wait.get(f.src) || 0);
    const end = f.start + f.dur;
    if (!arrival.has(f.dst) || end < arrival.get(f.dst)) arrival.set(f.dst, end);
  });
  side.forEach(f => { f.start = arrival.get(f.src) || 0; });
  return flow;
}

const polyLength = pts => pts.slice(1).reduce((s, p, i) => s + Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y), 0);
function pointAlong(pts, d) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (d <= len || i === pts.length - 2) {
      const t = len ? Math.min(1, d / len) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= len;
  }
  return pts[0];
}

function stopFlow() {
  cancelAnimationFrame(flowRaf);
  flowRaf = null;
  flowFor = null;
  flowDots = [];
  $flowG.innerHTML = '';
  elMap.forEach(el => el.classList.remove('flow-inspect', 'flow-step-on'));
  flowSteps = [];
  flowStepIdx = -1;
  flowPaused = false;
  flowJump = 0;
}

// ----- 40번: 흐름 단계 해설 -----
// 흐름(요청 하나의 왕복)을 "같은 때에 출발하는 구간들"로 묶어 단계로 나눈다. 단계마다 점이 닿는 박스가 하는 일을 한 줄로 설명한다.
// 자동으로 흐르는 동안에는 해설이 따라 바뀌고, [멈춤]·[이전]·[다음]으로 멈춘 채 한 단계씩 볼 수 있다.
// 문구는 js/data/flow-steps.js (FLOW_STEP_TEXT, AWS 공식 문서 근거)
let flowSteps = [];        // 지금 흐름의 단계: { start, end, hops, nodes(강조할 박스 id), lines(해설) }
let flowStepIdx = -1;      // 지금 단계 번호 (-1: 아직 없음)
let flowPaused = false;    // 멈춘 채 보는 중
let flowHold = 0;          // 멈췄을 때 시간이 더 가지 않는 지점(초)
let flowJump = 0;          // 버튼으로 요청한 이동 (+1 다음, -1 이전). 다음 화면에서 처리

// 이 구간에서 점이 닿는 박스: 응답 구간은 요청 구간을 거꾸로 가므로 출발 박스(src)에 닿는다
const flowArrive = f => (f.response ? f.src : f.dst);

function flowStepsOf(hops, view) {
  const groups = new Map();
  hops.forEach(f => {
    const key = f.start.toFixed(3);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });
  const steps = [...groups.values()].map(list => {
    const lines = [];
    list.forEach(f => {
      const line = flowStepLine(f, view);
      if (!lines.some(l => l.key === line.key)) lines.push(line);
    });
    return { start: list[0].start, end: Math.max(...list.map(f => f.start + f.dur)), hops: list, nodes: [...new Set(list.map(flowArrive))], lines };
  }).sort((a, b) => a.start - b.start);
  // 응답이 출발하는 첫 단계에 네트워크 한 줄: 응답 길을 따로 열지 않아도 되는 이유 (보안 그룹)
  const firstBack = steps.find(s => s.hops.some(f => f.response));
  if (firstBack) firstBack.lines.push({ key: 'net-stateful', name: '', ...FLOW_STEP_NET.stateful });
  return steps;
}

// 구간 하나의 해설: 점이 닿는 박스(dst)의 종류와 구간의 성격(요청·응답·주소 묻기·검사)으로 고른다
function flowStepLine(f, view) {
  const type = typeOfId(flowArrive(f)), name = SVC_MAP[type].name;
  const entry = FLOW_STEP_TEXT[type] || {};
  const kind = f.inspect ? 'inspect' : f.roundTrip ? 'lookup' : f.response ? 'response' : view === 'server' && entry.server ? 'server' : 'request';
  const fallback = kind === 'response' ? FLOW_STEP_TEXT_DEFAULT.response : FLOW_STEP_TEXT_DEFAULT.request;
  const picked = entry[kind] || fallback;
  return { key: `${type}|${kind}`, name, text: picked.text, net: picked.net || '', ref: picked.ref || '' };
}

// 지금 단계의 해설을 패널에 적고, 그 단계에서 점이 닿는 박스를 강조한다
function showFlowStep() {
  elMap.forEach(el => el.classList.remove('flow-step-on'));
  const step = flowSteps[flowStepIdx];
  if (step) step.nodes.forEach(id => { const el = elMap.get(id); if (el) el.classList.add('flow-step-on'); });
  const $count = document.getElementById('flow-count');
  const $text = document.getElementById('flow-step-text');
  const $pause = document.getElementById('flow-pause');
  if ($pause) $pause.textContent = flowPaused ? '▶ 이어서 재생' : '⏸ 멈춤';
  if (!$count || !$text) return;
  $count.textContent = step ? `${flowStepIdx + 1} / ${flowSteps.length}` : '';
  $text.innerHTML = '';
  if (!step) return;
  step.lines.forEach(l => {
    const row = document.createElement('span');
    row.className = 'fs-line';
    if (l.name) row.appendChild(Object.assign(document.createElement('b'), { textContent: l.name }));
    row.appendChild(document.createTextNode(l.text));
    if (l.net) row.appendChild(Object.assign(document.createElement('span'), { className: 'fs-net', textContent: l.net }));
    if (l.ref) row.appendChild(Object.assign(document.createElement('a'), { className: 'ref', textContent: '자세히 ↗', href: l.ref, target: '_blank', rel: 'noopener' }));
    $text.appendChild(row);
  });
}

// [멈춤 / 이어서 재생]
function toggleFlowPause() {
  flowPaused = !flowPaused;
  if (flowPaused) flowHold = -1;   // -1: 지금 자리에서 바로 멈춤 (다음 화면에서 그때의 시각으로 정함)
  showFlowStep();
}
// [이전]·[다음]: 멈춘 채 한 단계씩
function flowStepBy(d) {
  if (!flowSteps.length) return;
  flowPaused = true;
  flowJump = d;
  showFlowStep();
}

// 응답: 요청 구간마다 같은 길을 거꾸로. 끝(가장 늦게 도착한 곳)에서 먼저 출발하도록 시간을 거울처럼 뒤집는다
function withResponses(hops) {
  const T = Math.max(0, ...hops.map(f => f.start + f.dur));
  const back = hops.filter(f => !f.roundTrip && !f.inspect).map(f => ({
    ...f, response: true, reverse: !f.reverse, start: T + FLOW_TURN + (T - (f.start + f.dur)),
  }));
  return [...hops, ...back];
}

const typeOfId = id => (findNode(id) || {}).type;
const isServerType = t => EDGE_SERVERS.includes(t);
// 서버—캐시 / 서버—DB 연결 (요청 선)
const isCacheEdge = e => edgeInfoOf(e).kind === 'request' && [typeOfId(e.from), typeOfId(e.to)].includes('elasticache') && [e.from, e.to].some(id => isServerType(typeOfId(id)));
const isDbEdge = e => edgeInfoOf(e).kind === 'request' && [typeOfId(e.from), typeOfId(e.to)].some(t => t === 'rds' || t === 'rds-replica') && [e.from, e.to].some(id => isServerType(typeOfId(id)));
// CloudFront에서 원본(IGW·LB·S3) 쪽으로 가는 연결
const isCdnOriginEdge = e => { const t = [typeOfId(e.from), typeOfId(e.to)]; return t.includes('cloudfront') && !t.some(x => FLOW_SOURCES.includes(x) || x === 'route53' || x === 'waf'); };

// [사용자 요청] 보기: 요청 하나의 왕복. 캐시가 있으면 캐시에 없는 요청 → 캐시에 있는 요청 순서로 번갈아
function requestCycles(nodeLevels) {
  const full = computeFlow(nodeLevels, e => !isCacheEdge(e));
  const cycles = [];
  const hasCdn = full.some(f => typeOfId(f.dst) === 'cloudfront' || typeOfId(f.src) === 'cloudfront');
  const hasCache = validation.flow.some(f => isCacheEdge(state.edges.find(e => e.id === f.id) || {}));
  cycles.push({ hops: withResponses(full), label: hasCdn || hasCache ? '캐시에 없는 요청: DB까지 갔다가 같은 길로 응답이 돌아와요' : '요청이 끝까지 갔다가 같은 길로 응답이 돌아와요' });
  if (hasCache) cycles.push({ hops: withResponses(computeFlow(nodeLevels, e => !isDbEdge(e))), label: 'ElastiCache에 있는 요청: DB까지 가지 않고 캐시에서 바로 받아 응답해요' });
  if (hasCdn) cycles.push({ hops: withResponses(computeFlow(nodeLevels, e => !isCdnOriginEdge(e))), label: 'CloudFront에 있는 요청: 엣지에서 바로 응답해요 (서버까지 가지 않아요)' });
  return cycles.filter(c => c.hops.length);
}

// [서버 통신] 보기: 서버에서 출발해 서버가 시작한 통신 선을 따라 화살표 방향으로 갔다가, 응답만 같은 길로 돌아온다
function serverCycles(nodeLevels) {
  const out = new Map();
  state.edges.forEach(e => {
    if (!findNode(e.from) || !findNode(e.to)) return;
    const info = edgeInfoOf(e);
    if (info.kind !== 'egress') return;
    const [src, dst] = info.dir === 1 ? [e.from, e.to] : [e.to, e.from];
    if (!out.has(src)) out.set(src, []);
    out.get(src).push({ e, dst });
  });
  const levelOf = (x, y) => { const lv = [nodeLevels.get(x), nodeLevels.get(y)]; return lv.includes('error') ? 'error' : lv.includes('warn') ? 'warn' : 'ok'; };
  const queue = state.nodes.filter(n => isServerType(n.type) && out.has(n.id)).map(n => n.id);
  const arrival = new Map(queue.map(id => [id, 0]));
  const hops = [];
  for (let i = 0; i < queue.length; i++) {
    const src = queue[i];
    (out.get(src) || []).forEach(({ e, dst }) => {
      if (arrival.has(dst) && arrival.get(dst) <= arrival.get(src)) return;   // 이미 더 일찍 닿은 곳
      const level = levelOf(src, dst);
      const start = arrival.get(src);
      hops.push({ id: e.id, reverse: e.from !== src, roundTrip: false, inspect: false, level, src, dst, start, dur: FLOW_HOP[level] });
      if (!arrival.has(dst)) { arrival.set(dst, start + FLOW_HOP[level]); queue.push(dst); }
    });
  }
  return hops.length
    ? [{ hops: withResponses(hops), label: '서버가 먼저 밖으로 연결을 열고, 응답만 같은 길로 돌아와요 (밖에서 먼저 들어올 수는 없어요)' }]
    : [{ hops: [], label: '서버가 시작한 통신 선(초록)이 없어요' }];
}

// 보기 바꾸기 (범례 줄의 버튼)
function setFlowView(view) {
  flowView = view;
  stopFlow();
  render();
}

// 검증 결과가 있으면 흐름을 시작하고, 없어지면 멈춘다 (render()마다 호출)
function syncFlow() {
  const $edgeLayer = document.getElementById('edge-layer');
  if (resultTab === 'sim') { if (flowFor) stopFlow(); $edgeLayer.classList.remove('view-server'); return; }   // 시뮬레이션 탭에서는 트래픽 점만 보여줌
  if (!validation || !validation.flow || !validation.flow.length) { if (flowFor) stopFlow(); flowView = 'request'; $edgeLayer.classList.remove('view-server'); return; }
  $edgeLayer.classList.toggle('view-server', flowView === 'server');
  if (flowFor === validation) {   // 이미 이 결과로 흐르는 중 (결과 패널을 다시 그렸으면 설명만 다시 채움)
    const $now = document.getElementById('flow-now');
    if ($now) $now.textContent = flowLabel;
    showFlowStep();   // 다시 그린 패널·박스에 지금 단계 해설과 강조를 다시 채움
    return;
  }
  stopFlow();
  flowFor = validation;
  const cycles = flowView === 'server' ? serverCycles(validation.nodeLevels) : requestCycles(validation.nodeLevels);
  let ci = -1, cycleLen = 0, t = 0, lastNow = 0;
  const startCycle = k => {
    ci = ((k % cycles.length) + cycles.length) % cycles.length;
    t = 0;
    flowDots = [];
    $flowG.innerHTML = '';
    elMap.forEach(el => el.classList.remove('flow-inspect'));
    const hops = cycles[ci].hops;
    hops.forEach(f => {
      if (f.inspect) { flowDots.push({ f, dot: null }); return; }   // WAF: 점 대신 박스 반짝임
      // 요청 점은 단계 색 작은 원, 응답 점은 파랑 큰 원 (27번, 흰 바탕에서도 잘 보이게)
      const dot = f.response
        ? svgEl('circle', { r: 6.5, class: 'flow-dot response', fill: FLOW_RESPONSE, stroke: '#0b3d91', 'stroke-width': 2, visibility: 'hidden' })
        : svgEl('circle', { r: 4.5, class: 'flow-dot', fill: FLOW_COLOR[f.level], visibility: 'hidden' });
      $flowG.appendChild(dot);
      flowDots.push({ f, dot });
    });
    cycleLen = (hops.length ? Math.max(...hops.map(f => f.start + f.dur)) : 1) + FLOW_PAUSE;
    flowLabel = cycles[ci].label;
    const $now = document.getElementById('flow-now');
    if ($now) $now.textContent = flowLabel;
    flowSteps = flowStepsOf(hops, flowView);
    flowStepIdx = -1;
  };
  // 40번: 단계로 이동 (멈춘 채 그 단계가 시작해서 박스에 닿을 때까지만 보여 준다)
  const gotoStep = i => {
    flowStepIdx = i;
    t = flowSteps[i].start;
    flowHold = flowSteps[i].end;
    showFlowStep();
    // 버튼으로 넘겼을 때만: 그 단계의 박스가 화면 밖(결과 패널 아래 등)이면 보이는 곳까지 화면을 옮김
    const el = elMap.get(flowSteps[i].nodes[0]);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  };
  const tick = now => {
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;   // 탭이 가려졌다 돌아와도 건너뛰지 않게
    lastNow = now;
    if (ci < 0) startCycle(0);
    if (flowJump) {   // [이전]·[다음]: 흐름(요청 종류)의 끝을 넘으면 다음·이전 흐름으로
      const d = flowJump;
      flowJump = 0;
      if (flowSteps.length) {
        let i = Math.max(flowStepIdx, 0) + d;
        if (i >= flowSteps.length) { startCycle(ci + 1); i = 0; }
        else if (i < 0) { startCycle(ci - 1); i = flowSteps.length - 1; }
        if (flowSteps.length) gotoStep(i);
      }
    } else if (flowPaused) {
      if (flowHold < 0) flowHold = t;
      t = Math.min(t + dt, flowHold);
    } else {
      t += dt;
      if (t >= cycleLen) startCycle(ci + 1);
      // 지금 단계: 이미 시작한 단계 가운데 마지막
      let i = -1;
      flowSteps.forEach((s, k) => { if (s.start <= t) i = k; });
      if (i !== flowStepIdx) { flowStepIdx = i; showFlowStep(); }
    }
    const held = flowPaused && flowSteps[flowStepIdx] ? flowSteps[flowStepIdx].hops : [];
    flowDots.forEach(({ f, dot }) => {
      let k = (t - f.start) / f.dur;    // 이 구간에서 지나간 비율 (0~1일 때만 보임)
      if (held.includes(f)) k = Math.min(k, 0.999);   // 멈춘 단계의 점은 도착한 자리에 남겨 둠
      if (!dot) {   // 검사 중인 동안 WAF 박스 반짝임
        const el = elMap.get(f.dst);
        if (el) el.classList.toggle('flow-inspect', k >= 0 && k < 1);
        return;
      }
      const pts = edgePoints.get(f.id);   // 경로를 조절하면 바뀐 경로를 따라감
      if (!pts || k < 0 || k >= 1) { dot.setAttribute('visibility', 'hidden'); return; }
      const path = f.reverse ? [...pts].reverse() : pts;
      const p = pointAlong(path, polyLength(path) * (f.roundTrip ? 1 - Math.abs(1 - 2 * k) : k));   // 왕복은 갔다가 돌아옴
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      dot.setAttribute('visibility', 'visible');
    });
    flowRaf = requestAnimationFrame(tick);
  };
  flowRaf = requestAnimationFrame(tick);
  showFlowStep();   // 버튼 글자를 먼저 채움 (해설은 첫 단계가 시작되면)
}

// 문제 있는 박스에 빨강/노랑 테두리와 ! 표시
function applyValidationMarks() {
  if (!validation) return;
  validation.suggestNodes.forEach(id => {
    const el = elMap.get(id);
    if (el) el.classList.add('v-suggest');
  });
  validation.nodeLevels.forEach((level, id) => {
    const el = elMap.get(id);
    if (!el) return;
    el.classList.add(level === 'error' ? 'v-error' : 'v-warn');
    const badge = document.createElement('div');
    badge.className = 'v-badge';
    badge.textContent = '!';
    el.appendChild(badge);
  });
}

// 결과 패널 크기: 접힘이면 한 줄, 높이를 정했으면 그 높이, 아니면 내용만큼(CSS 기본, 최대 34vh)
function applyResultSize() {
  $result.classList.toggle('folded', uiPrefs.resultFolded);
  const h = uiPrefs.resultFolded ? 0 : uiPrefs.resultHeight;
  $result.style.height = h ? h + 'px' : '';
  $result.style.maxHeight = h ? 'none' : '';
}

// 경계선을 끌어 결과 패널 높이 조절 (접혀 있으면 펼치면서 시작)
function startResultResize(e) {
  e.preventDefault();
  if (uiPrefs.resultFolded) { uiPrefs.resultFolded = false; renderResult(); }
  const sy = e.clientY, start = $result.offsetHeight;
  document.body.classList.add('result-resizing');
  const move = ev => {
    uiPrefs.resultHeight = Math.round(clamp(start - (ev.clientY - sy), 44, window.innerHeight * 0.7));
    applyResultSize();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.classList.remove('result-resizing');
    saveUiPrefs();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function renderResult() {
  $validateBtn.textContent = validation ? '검증 종료' : '검증하기';
  $validateBtn.title = validation ? '검증 결과(강조·화살표·흐르는 점)를 지우고 검증 전 화면으로 돌아가요' : '';
  $result.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'result-head';
  // 탭: 검증 결과 / 성능 시뮬레이션 (UI-11 simulate.js) / 비교 (UI-18 compare.js, 44번). 미션·문제는 오른쪽 학습 패널 (UI-16 learn.js, 43번)
  head.innerHTML = '<span class="tabs">' +
    '<button class="tab" data-tab="validate">검증 결과</button>' +
    '<button class="tab" data-tab="sim">성능 시뮬레이션</button>' +
    '<button class="tab" data-tab="compare">비교</button></span>';
  head.querySelectorAll('.tab').forEach(b => {
    const tab = b.getAttribute('data-tab');
    b.classList.toggle('active', tab === resultTab);
    b.addEventListener('click', () => { if (tab !== resultTab) { resultTab = tab; render(); } });
  });
  const fold = document.createElement('button');   // 접기: 탭·판정 한 줄만 남김 (CSS order로 맨 오른쪽)
  fold.className = 'result-fold';
  fold.innerHTML = uiPrefs.resultFolded ? '<b>▲</b>펼치기' : '<b>▼</b>접기';
  fold.addEventListener('click', () => { uiPrefs.resultFolded = !uiPrefs.resultFolded; saveUiPrefs(); renderResult(); });
  head.appendChild(fold);
  applyResultSize();
  $result.appendChild(head);
  if (resultTab === 'sim') { renderSimPanel(head); return; }
  stopSimAll();
  if (resultTab === 'compare') { renderComparePanel(head); return; }

  if (!validation) {
    head.insertAdjacentHTML('beforeend', `<span class="msg">${resultNote}</span>`);
    return;
  }
  const st = STATUS_TEXT[validation.status];
  const errors = validation.issues.filter(i => i.rule.level === 'error').length;
  const warns = validation.issues.length - errors;
  const counts = [];
  if (validation.issues.length) counts.push(`오류 ${errors}개 · 경고 ${warns}개`);
  if (validation.praises.length) counts.push(`잘한 점 ${validation.praises.length}개`);
  if (validation.suggestions.length) counts.push(`제안 ${validation.suggestions.length}개`);
  head.insertAdjacentHTML('beforeend',
    `<span class="status ${validation.status}">${st.label}</span>` +
    `<span class="msg">${st.desc}${counts.length ? ` (${counts.join(' · ')})` : ''}</span>`);
  if (validation.flow && validation.flow.length) {
    $result.insertAdjacentHTML('beforeend', '<div class="flow-legend">' +
      '<span class="flow-view">' + [['request', '사용자 요청'], ['server', '서버 통신']].map(([v, t]) =>
        `<button class="btn${flowView === v ? ' on' : ''}" data-view="${v}">${t}</button>`).join('') + '</span>' +
      '<span class="flow-mark"><i class="fill"></i>가는 요청 <i class="hollow"></i>돌아오는 응답</span> ·' +
      `<span><i style="background:${FLOW_COLOR.ok}"></i>정상</span>` +
      `<span><i style="background:${FLOW_COLOR.warn}"></i>병목(느림)</span>` +
      `<span><i style="background:${FLOW_COLOR.error}"></i>오류(거의 멈춤)</span>` +
      '<span class="edge-legend">' + Object.entries(EDGE_KINDS).map(([k, v]) => `<span class="k-${k}"><b></b>${v.name}</span>`).join('') + '</span>' +
      '<div id="flow-now" class="flow-now"></div>' +
      // 40번: 단계 해설 (지금 점이 닿는 박스가 하는 일) + 멈춤·이전·다음
      '<div class="flow-step"><span class="flow-ctl">' +
      '<button class="btn" id="flow-prev" title="멈추고 앞 단계를 다시 봐요">◀ 이전</button>' +
      '<button class="btn" id="flow-pause"></button>' +
      '<button class="btn" id="flow-next" title="멈추고 다음 단계로 넘어가요">다음 ▶</button>' +
      '<b id="flow-count"></b></span><span id="flow-step-text" class="flow-step-text"></span></div></div>');
    $result.querySelectorAll('.flow-view button').forEach(btn => btn.addEventListener('click', () => setFlowView(btn.getAttribute('data-view'))));
    document.getElementById('flow-prev').addEventListener('click', () => flowStepBy(-1));
    document.getElementById('flow-next').addEventListener('click', () => flowStepBy(1));
    document.getElementById('flow-pause').addEventListener('click', toggleFlowPause);
  }

  // 목록 한 줄: 클릭하면 관련 박스로 이동·선택
  const makeItem = (cls, lv, title, text, action, nodeIds, rule) => {
    const li = document.createElement('li');
    li.className = `issue ${cls}`;
    li.innerHTML = `<span class="lv">${lv}</span><span class="rt">${title}</span><span class="im"></span>`;
    const im = li.querySelector('.im');
    im.textContent = text;
    if (action) {
      const act = document.createElement('span');
      act.className = 'act';
      act.textContent = '→ ' + action;
      im.appendChild(act);
    }
    // 근거: Well-Architected 기준 태그(누르면 AWS 문서) + 왜 그런지 한 줄
    const basis = document.createElement('span');
    basis.className = 'basis';
    const tags = rule.pillars.length ? rule.pillars.map(k => {
      const a = document.createElement('a');
      a.className = 'pillar';
      a.textContent = PILLARS[k].label;
      a.href = PILLARS[k].url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = `AWS Well-Architected ${PILLARS[k].label} 기준 문서 열기`;
      a.addEventListener('click', ev => ev.stopPropagation());   // 박스 이동 대신 문서만 열기
      return a;
    }) : [Object.assign(document.createElement('span'), { className: 'pillar basic', textContent: '3-Tier 기본' })];
    basis.append(...tags, document.createTextNode(rule.basis));
    if (rule.ref) {   // 근거가 된 AWS 문서 (구체적인 모범 사례 페이지)
      const more = Object.assign(document.createElement('a'), { className: 'ref', textContent: '자세히 ↗', href: rule.ref, target: '_blank', rel: 'noopener' });
      more.addEventListener('click', ev => ev.stopPropagation());
      basis.appendChild(more);
    }
    im.appendChild(basis);
    const target = nodeIds.find(id => elMap.has(id));
    if (target) {
      li.classList.add('clickable');
      li.title = '클릭하면 해당 박스로 이동해요';
      li.addEventListener('click', () => {
        select(target);
        const el = elMap.get(target);
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        // 위치를 찾기 쉽게 잠깐 깜빡임 (다시 누르면 처음부터)
        el.classList.remove('locate');
        void el.offsetWidth;   // 클래스를 뺐다 넣어도 애니메이션이 다시 시작되도록 화면 계산을 한 번 거침
        el.classList.add('locate');
        el.addEventListener('animationend', () => el.classList.remove('locate'), { once: true });
      });
    }
    return li;
  };

  if (validation.issues.length) {
    const list = document.createElement('ul');
    list.className = 'issues';
    validation.issues.forEach(issue => list.appendChild(makeItem(issue.rule.level, LEVEL_TEXT[issue.rule.level],
      `규칙 ${issue.rule.id}. ${issue.rule.message}`, issue.message, '', issue.nodeIds, issue.rule)));
    $result.appendChild(list);
  }

  // 잘한 점 (문제 다음, 제안 앞): 좋은 구성이 실제로 있는 규칙만
  if (validation.praises.length) {
    const title = document.createElement('div');
    title.className = 'suggest-title';
    title.textContent = '잘한 점';
    $result.appendChild(title);
    const list = document.createElement('ul');
    list.className = 'issues';
    validation.praises.forEach(p => list.appendChild(makeItem('good', '✓ 잘함',
      p.rule.message || p.rule.title, p.text, '', p.nodeIds, p.rule)));
    $result.appendChild(list);
  }

  // 개선·제거 제안 (판정과 별개)
  if (validation.suggestions.length) {
    const title = document.createElement('div');
    title.className = 'suggest-title';
    title.textContent = '더 나은 설계를 위한 제안';
    $result.appendChild(title);
    const list = document.createElement('ul');
    list.className = 'issues';
    validation.suggestions.forEach(s => list.appendChild(makeItem(s.rule.kind, s.rule.kind === 'improve' ? '개선' : '제거',
      `제안 ${s.rule.id}. ${s.rule.title}`, s.reason, s.action, s.nodeIds, s.rule)));
    $result.appendChild(list);
  }
}

