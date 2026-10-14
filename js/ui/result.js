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
  ok:    { label: '정상', desc: 'T-3 아키텍처의 기본 흐름이 모두 갖춰졌어요!' },
  warn:  { label: '경고', desc: '동작은 하지만 권장 구성은 아니에요.' },
  error: { label: '오류', desc: '이대로는 서비스가 동작하지 않아요.' },
};

function runValidation() {
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
// 요청 방향만 보여준다 (응답까지 그리면 점이 왕복해 헷갈림).
const FLOW_HOP = { ok: 0.8, warn: 1.6, error: 3.2 };   // 한 구간을 지나는 시간(초)
const FLOW_PAUSE = 0.6;                                 // 한 바퀴 끝나고 쉬는 시간(초)
const FLOW_COLOR = { ok: '#2e9e47', warn: '#e0a800', error: '#d13212' };
const FLOW_SOURCES = [...USER_TYPES, 'dbadmin'];
const $flowG = document.getElementById('flow-g');
let flowRaf = null, flowFor = null, flowDots = [];

// 사용자 박스에서 연결을 따라가며 거리를 매겨 방향을 정한다 (가까운 쪽 → 먼 쪽). 사용자와 이어지지 않은 선은 흐르지 않음.
function computeFlow(nodeLevels) {
  const adj = new Map(state.nodes.map(n => [n.id, []]));
  state.edges.forEach(e => {
    if (adj.has(e.from) && adj.has(e.to)) { adj.get(e.from).push(e.to); adj.get(e.to).push(e.from); }
  });
  const queue = state.nodes.filter(n => FLOW_SOURCES.includes(n.type)).map(n => n.id);
  const dist = new Map(queue.map(id => [id, 0]));
  for (let i = 0; i < queue.length; i++) {
    adj.get(queue[i]).forEach(nb => {
      if (!dist.has(nb)) { dist.set(nb, dist.get(queue[i]) + 1); queue.push(nb); }
    });
  }
  const flow = state.edges
    .filter(e => dist.has(e.from) && dist.has(e.to))
    .map(e => {
      const lv = [nodeLevels.get(e.from), nodeLevels.get(e.to)];
      const reverse = dist.get(e.to) < dist.get(e.from);
      const level = lv.includes('error') ? 'error' : lv.includes('warn') ? 'warn' : 'ok';
      return { id: e.id, reverse, level, src: reverse ? e.to : e.from, dst: reverse ? e.from : e.to, start: 0, dur: FLOW_HOP[level] };
    });
  // 시작 시각: 출발 박스에 요청이 처음 도착한 시각 (사용자 쪽에 가까운 구간부터 차례로 계산)
  const arrival = new Map(queue.filter(id => dist.get(id) === 0).map(id => [id, 0]));
  [...flow].sort((a, b) => dist.get(a.src) - dist.get(b.src)).forEach(f => {
    f.start = arrival.get(f.src) || 0;
    const end = f.start + f.dur;
    if (!arrival.has(f.dst) || end < arrival.get(f.dst)) arrival.set(f.dst, end);
  });
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
}

// 검증 결과가 있으면 흐름을 시작하고, 없어지면 멈춘다 (render()마다 호출)
function syncFlow() {
  if (!validation || !validation.flow || !validation.flow.length) { if (flowFor) stopFlow(); return; }
  if (flowFor === validation) return;   // 이미 이 결과로 흐르는 중
  stopFlow();
  flowFor = validation;
  validation.flow.forEach(f => {
    const dot = svgEl('circle', { r: 4.5, class: 'flow-dot', fill: FLOW_COLOR[f.level], visibility: 'hidden' });
    $flowG.appendChild(dot);
    flowDots.push({ f, dot });
  });
  const cycle = Math.max(...validation.flow.map(f => f.start + f.dur)) + FLOW_PAUSE;
  const t0 = performance.now();
  const tick = now => {
    const t = ((now - t0) / 1000) % cycle;
    flowDots.forEach(({ f, dot }) => {
      const pts = edgePoints.get(f.id);   // 경로를 조절하면 바뀐 경로를 따라감
      const k = (t - f.start) / f.dur;    // 이 구간에서 지나간 비율 (0~1일 때만 보임)
      if (!pts || k < 0 || k >= 1) { dot.setAttribute('visibility', 'hidden'); return; }
      const path = f.reverse ? [...pts].reverse() : pts;
      const p = pointAlong(path, polyLength(path) * k);
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      dot.setAttribute('visibility', 'visible');
    });
    flowRaf = requestAnimationFrame(tick);
  };
  flowRaf = requestAnimationFrame(tick);
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

function renderResult() {
  $result.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'result-head';
  head.innerHTML = '<span class="label">검증 결과</span>';
  $result.appendChild(head);

  if (!validation) {
    head.insertAdjacentHTML('beforeend', `<span class="msg">${resultNote}</span>`);
    return;
  }
  const st = STATUS_TEXT[validation.status];
  const errors = validation.issues.filter(i => i.rule.level === 'error').length;
  const warns = validation.issues.length - errors;
  const counts = [];
  if (validation.issues.length) counts.push(`오류 ${errors}개 · 경고 ${warns}개`);
  if (validation.suggestions.length) counts.push(`제안 ${validation.suggestions.length}개`);
  head.insertAdjacentHTML('beforeend',
    `<span class="status ${validation.status}">${st.label}</span>` +
    `<span class="msg">${st.desc}${counts.length ? ` (${counts.join(' · ')})` : ''}</span>`);
  if (validation.flow && validation.flow.length) {
    $result.insertAdjacentHTML('beforeend', '<div class="flow-legend">요청 흐름(사용자부터 차례로) ·' +
      `<span><i style="background:${FLOW_COLOR.ok}"></i>정상</span>` +
      `<span><i style="background:${FLOW_COLOR.warn}"></i>병목(느림)</span>` +
      `<span><i style="background:${FLOW_COLOR.error}"></i>오류(거의 멈춤)</span></div>`);
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

