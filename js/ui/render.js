// @ts-check
// js/ui/render.js — UI-6 그리기, UI-7 줌·화면 이동

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
  else {   // 자물쇠 그림 + 이름 (이름은 글자로 넣는다: R5)
    label.innerHTML = LOCK_SVG;
    const name = document.createElement('span');
    name.textContent = c.label;
    label.appendChild(name);
  }
  // 공식 그룹 아이콘 (AZ는 없음, DB 서브넷은 프라이빗 서브넷 아이콘). 있으면 자물쇠 대신 앞에 붙이고, 파일이 없으면 지금 모양 그대로
  const groupIcon = { vpc: 'vpc', public: 'public', private: 'private', db: 'private', asg: 'asg' }[c.type];
  if (groupIcon) {
    const lock = label.querySelector('svg');
    if (lock) lock.style.display = 'none';
    label.prepend(iconImg('area-' + groupIcon, 'area-icon', () => { if (lock) lock.style.display = ''; }));
  }
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

  fillServiceBox(el, svc);
  // 46번: 크기가 보통이 아니면 박스 아래쪽에 작은 글씨로 (그림만 봐도 설정이 보이게)
  if (sizeGroupOf(node.type) && nodeSize(node) !== 'medium') {
    const tag = document.createElement('div');
    tag.className = 'node-size';
    tag.textContent = SIZE_NAMES[nodeSize(node)];
    el.appendChild(tag);
  }
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
  renderLearn();
  syncFlow();
  saveState();
  renderInfo();
  renderPaletteRec();
  recordHistory();
}

/* ---------------------------------------------------------
   UI-7. 줌·화면 이동
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

// 저장·불러오기·실행 취소는 js/ui/storage.js (R5)
