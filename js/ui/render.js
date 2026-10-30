// @ts-check
// js/ui/render.js — UI-6 그리기, UI-7 줌·저장·실행 취소

/* ---------------------------------------------------------
   UI-6. 그리기 (영역·박스 DOM 생성, 전체 다시 그리기)
   --------------------------------------------------------- */

function buildAreaEl(c) {
  const el = document.createElement('div');
  el.className = `area area-${c.type}`;
  el.dataset.id = c.id;

  const label = document.createElement('div');
  label.className = 'area-label';
  if (c.type === 'vpc') label.innerHTML = '<span class="vpc-tag">VPC</span>';
  else if (c.type === 'az' || c.type === 'asg') label.textContent = c.label;
  else label.innerHTML = LOCK_SVG + `<span>${c.label}</span>`;
  attachTooltip(label, () => areaTooltip(c.type));   // 영역은 이름표에서만 설명 표시
  el.appendChild(label);

  const del = document.createElement('div');
  del.className = 'del';
  del.textContent = '×';
  del.title = '영역 삭제';
  del.addEventListener('pointerdown', ev => ev.stopPropagation());
  del.addEventListener('click', ev => { ev.stopPropagation(); deleteContainer(c.id); });
  el.appendChild(del);

  // Auto Scaling 그룹: 안쪽은 클릭이 아래로 지나가므로, 점선 테두리 둘레를 잡아 옮길 수 있게 띠를 둔다
  if (c.type === 'asg') {
    ['top', 'right', 'bottom', 'left'].forEach(side => {
      const strip = document.createElement('div');
      strip.className = `asg-edge ${side}`;
      el.appendChild(strip);
    });
  }

  // 크기 조절 손잡이: 좌상단(tl) / 우하단(br)
  ['tl', 'br'].forEach(corner => {
    const handle = document.createElement('div');
    handle.className = `resize ${corner}`;
    handle.dataset.corner = corner;
    handle.title = '크기 조절';
    el.appendChild(handle);
  });

  el.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    if (ev.shiftKey) { startMarquee(ev); return; }   // Shift+드래그: 영역 위에서도 범위 선택
    const handle = /** @type {Element} */ (ev.target).closest('.resize');
    if (handle) startResize(ev, c, handle, handle.getAttribute('data-corner'));
    else startMoveDrag(ev, c, el);
  });
  return el;
}

function buildNodeEl(node) {
  const svc = SVC_MAP[node.type];
  const el = document.createElement('div');
  el.className = 'node';
  styleServiceBox(el, svc);
  el.dataset.id = node.id;

  const label = document.createElement('span');
  label.textContent = svc.name;
  el.appendChild(label);
  attachTooltip(el, () => simTooltip(node.id) + serviceTooltip(svc));   // 시뮬레이션 중이면 사용률 설명을 맨 위에

  const del = document.createElement('div');
  del.className = 'del';
  del.textContent = '×';
  del.title = '삭제';
  del.addEventListener('pointerdown', ev => ev.stopPropagation());
  del.addEventListener('click', ev => { ev.stopPropagation(); deleteNode(node.id); });
  el.appendChild(del);

  // 연결점 (네 변의 중앙). 마우스를 올리면 보이고, 끌어서 다른 박스에 놓으면 연결
  SIDES.forEach(side => {
    const a = document.createElement('div');
    a.className = 'anchor';
    a.dataset.side = side;
    el.appendChild(a);
  });

  el.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const anchor = /** @type {Element} */ (ev.target).closest('.anchor');
    if (anchor) { startConnectDrag(ev, node.id, anchor.getAttribute('data-side')); return; }
    if (ev.shiftKey) { ev.stopPropagation(); toggleMulti(node.id); return; }   // Shift+클릭: 여러 개 선택에 넣고 빼기
    startMoveDrag(ev, node, el);
  });
  return el;
}

// 위치·크기만 갱신 (드래그 중 사용)
function updatePositions() {
  [...state.containers, ...state.nodes].forEach(item => {
    const el = elMap.get(item.id);
    if (!el) return;
    el.style.left = item.x + 'px';
    el.style.top  = item.y + 'px';
    if (isContainer(item)) {
      el.style.width  = item.width + 'px';
      el.style.height = item.height + 'px';
    }
  });
  renderEdges();
}

// 전체 다시 그리기
function render() {
  hideTooltip();   // 다시 그리면 마우스 아래 요소가 바뀌므로 툴팁·연결선 강조 정리
  setHoverEdge(null);
  elMap.clear();
  $areaLayer.innerHTML = '';
  $nodeLayer.innerHTML = '';

  // 바깥 영역부터 그려서 안쪽 영역이 위에 보이도록
  [...state.containers]
    .sort((a, b) => AREA_MAP[a.type].rank - AREA_MAP[b.type].rank)
    .forEach(c => {
      const el = buildAreaEl(c);
      elMap.set(c.id, el);
      $areaLayer.appendChild(el);
    });
  state.nodes.forEach(n => {
    const el = buildNodeEl(n);
    if (n.id === connectFrom) el.classList.add('connect-from');
    elMap.set(n.id, el);
    $nodeLayer.appendChild(el);
  });
  [...multiSel].forEach(id => { if (!findNode(id)) multiSel.delete(id); });   // 지워진 박스는 선택에서 뺌
  elMap.forEach((el, id) => el.classList.toggle('selected', isSelected(id)));
  // 검증 후 캔버스가 바뀌었으면 이전 결과는 지운다 (연결선을 그리기 전에: 화살표 방향이 지난 결과를 따르지 않게)
  if (validation && validation.sig !== stateSig()) {
    validation = null;
    resultNote = '구성이 바뀌었어요. [검증하기]를 다시 눌러 확인해보세요.';
  }
  updatePositions();

  if (!connectFrom) $tempEdge.setAttribute('visibility', 'hidden');
  $emptyHint.classList.toggle('hidden', state.nodes.length + state.containers.length > 0);
  applyValidationMarks();
  renderResult();
  syncFlow();
  saveState();
  renderInfo();
  renderPaletteRec();
  recordHistory();
}

/* ---------------------------------------------------------
   UI-7. 줌·저장·실행 취소
   --------------------------------------------------------- */

// ----- 줌 -----
const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5];   // 60% 미만은 격자가 보이지 않아 제외

function applyZoom() {
  $world.style.transform = `scale(${zoom})`;
  $sizer.style.width  = $world.offsetWidth * zoom + 'px';
  $sizer.style.height = $world.offsetHeight * zoom + 'px';
  $zoomLabel.textContent = Math.round(zoom * 100) + '%';
}

// anchor(화면 좌표) 아래의 캔버스 지점이 그대로 보이도록 배율 변경. 없으면 화면 중앙 기준.
function setZoom(z, anchor) {
  z = clamp(z, ZOOM_STEPS[0], ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  if (z === zoom) return;
  const r = $wrap.getBoundingClientRect();
  const ax = anchor ? anchor.x - r.left : $wrap.clientWidth / 2;
  const ay = anchor ? anchor.y - r.top  : $wrap.clientHeight / 2;
  const wx = ($wrap.scrollLeft + ax) / zoom;
  const wy = ($wrap.scrollTop + ay) / zoom;
  zoom = z;
  applyZoom();
  $wrap.scrollLeft = wx * zoom - ax;
  $wrap.scrollTop  = wy * zoom - ay;
  saveState();
}

// dir: +1 확대, -1 축소 (단계별)
function stepZoom(dir, anchor) {
  const next = dir > 0
    ? ZOOM_STEPS.find(s => s > zoom + 1e-6)
    : [...ZOOM_STEPS].reverse().find(s => s < zoom - 1e-6);
  if (next) setZoom(next, anchor);
}

// ----- 화면 끌어 옮기기 (흰 배경 끌기, 스페이스바+끌기) -----
function startPan(e) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  const left = $wrap.scrollLeft, top = $wrap.scrollTop;
  document.body.classList.add('panning');
  hideTooltip();
  const move = ev => {
    $wrap.scrollLeft = left - (ev.clientX - sx);
    $wrap.scrollTop  = top - (ev.clientY - sy);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.classList.remove('panning');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// ----- 저장 / 불러오기 (브라우저 localStorage) -----
const STORAGE_KEY = 'aws-3tier-simulator:v1';
let lastSaved = null;
let savedScroll = null;   // 불러온 스크롤 위치 (시작 시 한 번 적용)
let removedAsgBoxes = 0;  // 불러올 때 지운 예전 Auto Scaling 박스 수 (시작 시 안내)

function saveState() {
  const scroll = { x: $wrap.scrollLeft, y: $wrap.scrollTop };   // 보고 있던 캔버스 시점
  const data = JSON.stringify({ version: 1, idSeq, zoom, scroll, state });
  if (data === lastSaved) return;
  try {
    localStorage.setItem(STORAGE_KEY, data);
    lastSaved = data;
  } catch (e) { /* 저장소를 쓸 수 없는 환경이면 저장 생략 */ }
}

// 화면 설정 (결과 패널 접힘·높이, 설명 패널 접힘). 배치와 따로 저장하고 되돌리기 기록에는 넣지 않는다.
const UI_PREFS_KEY = 'aws-3tier-simulator:ui';
const uiPrefs = { resultFolded: false, resultHeight: 0, infoFolded: false };   // resultHeight 0 = 내용만큼(기본)

function saveUiPrefs() {
  try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs)); } catch (e) { /* 저장소를 쓸 수 없으면 생략 */ }
}

function loadUiPrefs() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(UI_PREFS_KEY)); } catch (e) { /* 없으면 기본값 */ }
  if (!data) return;
  uiPrefs.resultFolded = data.resultFolded === true;
  uiPrefs.resultHeight = Number(data.resultHeight) > 0 ? Number(data.resultHeight) : 0;
  uiPrefs.infoFolded = data.infoFolded === true;
}

// 저장된 배치를 불러온다. 알 수 없는 항목은 버리고, 불러온 항목 수를 돌려준다.
function loadSaved() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return 0; }
  if (!data || !data.state) return 0;
  const s = data.state;
  // v1.12부터 Auto Scaling은 박스가 아니라 그룹 영역이다. 예전 박스는 지우고 시작할 때 안내한다.
  removedAsgBoxes = (Array.isArray(s.nodes) ? s.nodes : []).filter(n => n && n.type === 'autoscaling').length;
  const nodes = (Array.isArray(s.nodes) ? s.nodes : []).filter(n => n && SVC_MAP[n.type]);
  const containers = (Array.isArray(s.containers) ? s.containers : []).filter(c => c && AREA_MAP[c.type]);
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = (Array.isArray(s.edges) ? s.edges : [])
    .filter(ed => ed && nodeIds.has(ed.from) && nodeIds.has(ed.to));
  state.nodes = nodes;
  state.containers = containers;
  state.edges = edges;

  // 새 id가 기존 id와 겹치지 않도록 번호 이어가기
  const maxId = Math.max(0, ...[...nodes, ...containers, ...edges]
    .map(i => parseInt(String(i.id).slice(1), 10) || 0));
  idSeq = Math.max(Number(data.idSeq) || 1, maxId + 1);
  if (typeof data.zoom === 'number') {
    zoom = clamp(data.zoom, ZOOM_STEPS[0], ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  }
  if (data.scroll) savedScroll = data.scroll;
  recomputeParents();
  return nodes.length + containers.length;
}


// ----- 실행 취소 / 다시 실행 -----
// render()가 끝날 때마다 캔버스 상태를 기록한다. 바뀌었으면 바뀌기 전 상태를 되돌리기 목록에 쌓는다.
// (규칙 위반으로 되돌려진 동작은 상태가 같으므로 쌓이지 않는다)
// 기록은 이 창을 열어 둔 동안만 유지된다. 새로고침하면 처음부터 다시 기록한다.
const HISTORY_LIMIT = 50;
const undoStack = [];
const redoStack = [];
let historyLast = null;   // 마지막으로 기록한 상태 (JSON 문자열)
let pointerHeld = false;  // 마우스를 누르고 있는 동안(드래그 중)은 되돌리지 않음

const stateJSON = () => JSON.stringify({ nodes: state.nodes, containers: state.containers, edges: state.edges });

function recordHistory() {
  const cur = stateJSON();
  if (historyLast !== null && cur !== historyLast) {
    undoStack.push(historyLast);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;   // 새 동작을 하면 "다시 실행" 목록은 비운다
  }
  historyLast = cur;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  /** @type {HTMLButtonElement} */ (document.getElementById('btn-undo')).disabled = !undoStack.length;
  /** @type {HTMLButtonElement} */ (document.getElementById('btn-redo')).disabled = !redoStack.length;
}

// from 목록에서 상태 하나를 꺼내 적용하고, 지금 상태는 to 목록에 넣는다
function stepHistory(from, to, emptyMsg) {
  if (pointerHeld) return;
  if (!from.length) { showToast(emptyMsg); return; }
  to.push(historyLast);
  historyLast = from.pop();
  const s = JSON.parse(historyLast);
  state.nodes = s.nodes;
  state.containers = s.containers;
  state.edges = s.edges;
  selectedId = null;
  cancelPendingConnect();
  render();   // historyLast와 같으므로 새로 쌓이지 않음
}

const undo = () => stepHistory(undoStack, redoStack, '더 되돌릴 작업이 없어요.');
const redo = () => stepHistory(redoStack, undoStack, '다시 실행할 작업이 없어요.');
