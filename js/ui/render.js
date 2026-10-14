// js/ui/render.js — UI-6 그리기, UI-7 줌·저장

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
  else if (c.type === 'az') label.textContent = c.label;
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
    if (connectMode) { ev.stopPropagation(); cancelPendingConnect(); return; }
    const handle = ev.target.closest('.resize');
    if (handle) startResize(ev, c, handle, handle.dataset.corner);
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
  attachTooltip(el, () => serviceTooltip(svc));

  const del = document.createElement('div');
  del.className = 'del';
  del.textContent = '×';
  del.title = '삭제';
  del.addEventListener('pointerdown', ev => ev.stopPropagation());
  del.addEventListener('click', ev => { ev.stopPropagation(); deleteNode(node.id); });
  el.appendChild(del);

  // 연결점 (네 변의 중앙)
  SIDES.forEach(side => {
    const a = document.createElement('div');
    a.className = 'anchor';
    a.dataset.side = side;
    el.appendChild(a);
  });

  el.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    if (connectMode) {
      ev.preventDefault();
      ev.stopPropagation();
      const anchor = ev.target.closest('.anchor');
      handleConnectClick(node.id, anchor ? anchor.dataset.side : null);
      return;
    }
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
  elMap.forEach((el, id) => el.classList.toggle('selected', id === selectedId));
  updatePositions();

  if (!connectFrom) $tempEdge.setAttribute('visibility', 'hidden');
  $emptyHint.classList.toggle('hidden', state.nodes.length + state.containers.length > 0);

  // 검증 후 캔버스가 바뀌었으면 이전 결과는 지운다
  if (validation && validation.sig !== stateSig()) {
    validation = null;
    resultNote = '구성이 바뀌었어요. [검증하기]를 다시 눌러 확인해보세요.';
  }
  applyValidationMarks();
  renderResult();
  syncFlow();
  saveState();
}

/* ---------------------------------------------------------
   UI-7. 줌·저장
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

// ----- 저장 / 불러오기 (브라우저 localStorage) -----
const STORAGE_KEY = 'aws-t3-sim:v1';
let lastSaved = null;
let savedScroll = null;   // 불러온 스크롤 위치 (시작 시 한 번 적용)

function saveState() {
  const scroll = { x: $wrap.scrollLeft, y: $wrap.scrollTop };   // 보고 있던 캔버스 시점
  const data = JSON.stringify({ version: 1, idSeq, zoom, scroll, state });
  if (data === lastSaved) return;
  try {
    localStorage.setItem(STORAGE_KEY, data);
    lastSaved = data;
  } catch (e) { /* 저장소를 쓸 수 없는 환경이면 저장 생략 */ }
}

// 저장된 배치를 불러온다. 알 수 없는 항목은 버리고, 불러온 항목 수를 돌려준다.
function loadSaved() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return 0; }
  if (!data || !data.state) return 0;
  const s = data.state;
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

