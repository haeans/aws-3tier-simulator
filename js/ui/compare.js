// @ts-check
// js/ui/compare.js — UI-18 결과 패널 [비교] 탭: 담아 둔 구성(A)과 지금 캔버스(B) 비교 (44번)
// 계산은 js/rules/compare.js(compareConfigs). A는 배치와 따로 브라우저에 저장한다

const COMPARE_KEY = 'aws-3tier-simulator:compare';
let compareA = null;     // { saved: 담은 시각(ISO 문자열), s: { nodes, containers, edges } }
let compareRps = 300;    // 비교할 트래픽 (COMPARE_RPS 중 하나)
let compareCacheA = null; // A 요약은 A·트래픽이 같으면 다시 계산하지 않는다 { key, sum }

function loadCompareA() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(COMPARE_KEY)); } catch (e) { /* 없으면 담지 않은 상태 */ }
  if (!data || !data.s || !Array.isArray(data.s.nodes) || !Array.isArray(data.s.containers) || !Array.isArray(data.s.edges)) return;
  compareA = { saved: String(data.saved || ''), s: data.s };
  if (COMPARE_RPS.includes(data.rps)) compareRps = data.rps;
}
function saveCompareA() {
  try { localStorage.setItem(COMPARE_KEY, JSON.stringify({ ...compareA, rps: compareRps })); } catch (e) { /* 저장소를 쓸 수 없으면 생략 */ }
}

// [지금 구성을 A로 담기]
function captureCompareA() {
  compareA = { saved: new Date().toISOString(), s: JSON.parse(stateJSON()) };
  compareCacheA = null;
  saveCompareA();
  showToast('지금 구성을 A로 담았어요. 캔버스를 고치거나 다른 구성을 불러오면 A와 비교해요.');
  renderResult();
}

// [A 불러오기]: 캔버스를 A로 바꾼다. 되돌리기 한 번이면 원래 구성으로 돌아온다
function restoreCompareA() {
  if (!compareA) return;
  if (state.nodes.length + state.containers.length > 0 &&
      !confirm('캔버스를 담아 둔 구성(A)으로 바꿀까요? [↶ 되돌리기]를 누르면 지금 구성으로 돌아와요.')) return;
  const s = JSON.parse(JSON.stringify(compareA.s));
  state.nodes = s.nodes;
  state.containers = s.containers;
  state.edges = s.edges;
  const maxId = Math.max(0, ...[...s.nodes, ...s.containers, ...s.edges].map(i => parseInt(String(i.id).slice(1), 10) || 0));
  idSeq = Math.max(idSeq, maxId + 1);   // 새 id가 A의 id와 겹치지 않게
  selectedId = null;
  cancelPendingConnect();
  recomputeParents();
  render();
  fitView();
  showToast('A를 캔버스에 불러왔어요. [↶ 되돌리기]를 누르면 원래 구성으로 돌아가요.');
}

// 담은 시각: "11월 13일 14:02"
function compareTimeText(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 표의 줄: 항목 이름, 값 꺼내기, 글로 바꾸기, 더 좋은 쪽(1 = 클수록, -1 = 작을수록), 차이 글
const COMPARE_STATUS_RANK = { ok: 0, warn: 1, error: 2 };
const pct = v => `${Math.round(v * 100)}%`;
const COMPARE_ROWS = [
  { name: '판정', get: x => COMPARE_STATUS_RANK[x.status], text: (x) => STATUS_TEXT[x.status].label, better: -1, diff: null },
  { name: '오류', get: x => x.errors, text: (x, v) => `${v}개`, better: -1, diff: d => `${Math.abs(d)}개` },
  { name: '경고', get: x => x.warns, text: (x, v) => `${v}개`, better: -1, diff: d => `${Math.abs(d)}개` },
  { name: '제안', get: x => x.sugs.length, text: (x, v) => `${v}개`, better: -1, diff: d => `${Math.abs(d)}개` },
  { name: '처리한 요청', get: x => x.traffic && x.traffic.served, text: (x, v) => `${Math.round(v)}/초`, better: 1, diff: d => `${Math.round(Math.abs(d))}/초` },
  { name: '성공률', get: x => x.traffic && x.traffic.successRate, text: (x, v) => pct(v), better: 1, diff: d => `${Math.round(Math.abs(d) * 100)}%p` },
  { name: '평균 응답 시간', get: x => x.traffic && x.traffic.served ? x.traffic.latency : null, text: (x, v) => `${Math.round(v)}ms`, better: -1, diff: d => `${Math.round(Math.abs(d))}ms` },
  { name: '한 AZ가 멈추면 (성공률)', get: x => x.az && x.az.rate, text: (x, v) => `${pct(v)} (${x.az.label} 장애)`, better: 1, diff: d => `${Math.round(Math.abs(d) * 100)}%p` },
];

// [비교] 탭 내용. head: 결과 패널 머리 줄
function renderComparePanel(head) {
  const msg = document.createElement('span');
  msg.className = 'msg';
  head.appendChild(msg);
  const panel = document.createElement('div');
  panel.className = 'compare-panel';
  $result.appendChild(panel);
  const btn = (id, text, onClick, tip, primary) => {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? ' primary' : '');
    b.id = id;
    b.textContent = text;
    if (tip) b.title = tip;
    b.addEventListener('click', onClick);
    return b;
  };
  const ctl = document.createElement('div');
  ctl.className = 'compare-controls';
  panel.appendChild(ctl);

  if (!compareA) {
    msg.textContent = '두 구성을 같은 기준(판정·트래픽·AZ 장애)으로 비교해요.';
    ctl.appendChild(btn('compare-capture', '지금 구성을 A로 담기', captureCompareA, '지금 캔버스를 비교 기준(A)으로 저장해요', true));
    ctl.insertAdjacentHTML('beforeend', '<span class="compare-help">먼저 지금 구성을 A로 담고, 캔버스를 고치거나 다른 예시·파일을 불러오면 A와 지금(B)을 나란히 비교해요.</span>');
    return;
  }

  msg.textContent = `A(${compareTimeText(compareA.saved)}에 담은 구성)와 지금 캔버스(B)를 비교해요. ${PERF_NOTE}`;
  ctl.appendChild(btn('compare-capture', '지금 구성을 A로 다시 담기', captureCompareA, '지금 캔버스로 A를 바꿔요'));
  ctl.appendChild(btn('compare-load', 'A 불러오기', restoreCompareA, '캔버스를 A로 바꿔요. [↶ 되돌리기]로 돌아와요'));
  const rpsBox = document.createElement('span');
  rpsBox.className = 'compare-rps';
  rpsBox.append('트래픽 ');
  COMPARE_RPS.forEach(r => {
    const b = btn(`compare-rps-${r}`, `${r}`, () => { compareRps = r; saveCompareA(); renderResult(); });
    b.classList.toggle('active', r === compareRps);
    rpsBox.appendChild(b);
  });
  rpsBox.append(` 요청/초 (${COMPARE_TIME / 60}분 이어진 뒤)`);
  ctl.appendChild(rpsBox);

  // 계산 (A 요약은 A·트래픽이 그대로면 다시 쓴다)
  const key = compareA.saved + ':' + compareRps;
  if (!compareCacheA || compareCacheA.key !== key) compareCacheA = { key, sum: compareSummary(compareA.s, compareRps) };
  const now = { nodes: state.nodes, containers: state.containers, edges: state.edges };
  const result = compareConfigs(compareA.s, now, compareRps, compareCacheA.sum);
  const sa = result.a, sb = result.b;

  const table = document.createElement('table');
  table.className = 'compare-table';
  table.innerHTML = '<thead><tr><th></th><th>A (담은 구성)</th><th>B (지금)</th><th>B − A</th></tr></thead>';
  const tbody = document.createElement('tbody');
  COMPARE_ROWS.forEach(row => {
    const va = row.get(sa), vb = row.get(sb);
    const tr = document.createElement('tr');
    const cell = (text, cls) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    };
    cell(row.name, 'compare-name');
    const show = (x, v) => (v === null || v === undefined || v === false ? (x.status === 'error' ? '— (오류)' : '—') : row.text(x, v));
    cell(show(sa, va));
    cell(show(sb, vb));
    const has = v => typeof v === 'number';
    if (has(va) && has(vb) && Math.abs(vb - va) > 1e-6) {
      const good = (vb - va) * row.better > 0;
      const arrow = vb > va ? '▲' : '▼';
      cell(row.diff ? `${arrow} ${row.diff(vb - va)}` : (good ? '좋아짐' : '나빠짐'), good ? 'better' : 'worse');
    } else cell(has(va) && has(vb) ? '같음' : '', 'same');
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  panel.appendChild(table);

  // 달라진 점: 박스 개수, 사라진·새로 생긴 제안
  const diff = document.createElement('div');
  diff.className = 'compare-diff';
  const line = (label, items, cls) => {
    const p = document.createElement('div');
    p.innerHTML = '<b></b><span></span>';
    p.querySelector('b').textContent = label;
    const span = p.querySelector('span');
    span.textContent = items.length ? items.join(' · ') : '없음';
    if (cls && items.length) span.className = cls;
    diff.appendChild(p);
  };
  line('박스 (A → B)', result.boxes.map(x => `${x.b > x.a ? '+' : '−'}${x.name} ${Math.abs(x.b - x.a)}개`));
  line('설정 (A → B)', result.settings);
  line('B에서 사라진 제안', result.sugGone.map(x => x.title), 'better');
  line('B에 새로 생긴 제안', result.sugNew.map(x => x.title), 'worse');
  panel.appendChild(diff);
}
