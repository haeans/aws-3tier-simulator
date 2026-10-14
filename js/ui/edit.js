// @ts-check
// js/ui/edit.js — UI-4 추가·삭제·선택·이동·크기 조절

/* ---------------------------------------------------------
   UI-4. 추가·삭제·선택·이동·크기 조절
   --------------------------------------------------------- */

// ----- 추가 / 삭제 / 선택 -----
// (cx, cy) = 놓은 위치(박스 중심)
function addNode(type, cx, cy) {
  const before = takeSnapshot();
  const pos = fitRect(cx - NODE_W / 2, cy - NODE_H / 2, NODE_W, NODE_H);
  const node = { id: newId('n'), type, x: pos.x, y: pos.y, parentContainer: null };
  state.nodes.push(node);
  snapToVpcEdge(node);
  if (commit(before, node.id, [node.id])) select(node.id);
}

// ----- VPC 경계선 스냅 (IGW 등) -----
const EDGE_SNAP_TYPES = ['igw', 'vpce', 'clientvpn'];
const EDGE_SNAP_DIST = NODE_W / 2;   // 박스 중심이 경계선에서 이 거리(px) 안이면 붙임 (박스 모서리가 선에 닿을 정도)

// 경계선 근처면 박스 중심이 VPC 테두리 위에 오도록 좌표 보정. 붙였으면 true.
function snapToVpcEdge(node) {
  if (!EDGE_SNAP_TYPES.includes(node.type)) return false;
  const c = centerOf(node);
  let best = null;
  state.containers.filter(k => k.type === 'vpc').forEach(v => {
    const L = v.x, R = v.x + v.width, T = v.y, B = v.y + v.height;
    const cands = [];
    if (c.y >= T && c.y <= B) cands.push({ x: L, y: c.y, d: Math.abs(c.x - L) }, { x: R, y: c.y, d: Math.abs(c.x - R) });
    if (c.x >= L && c.x <= R) cands.push({ x: c.x, y: T, d: Math.abs(c.y - T) }, { x: c.x, y: B, d: Math.abs(c.y - B) });
    cands.forEach(k => { if (k.d <= EDGE_SNAP_DIST && (!best || k.d < best.d)) best = k; });
  });
  if (!best) return false;
  const x = best.x - NODE_W / 2, y = best.y - NODE_H / 2;
  if (x < 0 || y < 0 || x > $world.clientWidth - NODE_W || y > $world.clientHeight - NODE_H) return false;
  node.x = x;
  node.y = y;
  return true;
}

function nextAzLabel() {
  const used = new Set(state.containers.filter(c => c.type === 'az').map(c => c.label));
  const letter = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(l => !used.has('가용 영역 ' + l)) || '?';
  return '가용 영역 ' + letter;
}

function addContainer(type, cx, cy) {
  const before = takeSnapshot();
  const def = AREA_MAP[type];
  const pos = fitRect(cx - def.w / 2, cy - def.h / 2, def.w, def.h);
  const c = {
    id: newId('c'), type, x: pos.x, y: pos.y, width: def.w, height: def.h,
    parentContainer: null, label: type === 'az' ? nextAzLabel() : def.name,
  };
  state.containers.push(c);
  if (commit(before, c.id)) select(c.id);
}

function deleteNode(id) {
  state.nodes = state.nodes.filter(n => n.id !== id);
  state.edges = state.edges.filter(ed => ed.from !== id && ed.to !== id); // 연결선도 함께 제거
  if (selectedId === id) selectedId = null;
  if (connectFrom === id) cancelPendingConnect();
  render();
}

// 영역 삭제: 안에 든 하위 영역·박스·연결선도 함께 삭제
function deleteContainer(id) {
  const d = getDescendants(id);
  const count = d.containers.length + d.nodes.length;
  if (count > 0 && !confirm(`안에 있는 ${count}개 항목도 함께 삭제됩니다. 삭제할까요?`)) return;
  const removeC = new Set([id, ...d.containers.map(c => c.id)]);
  const removeN = new Set(d.nodes.map(n => n.id));
  state.containers = state.containers.filter(c => !removeC.has(c.id));
  state.nodes = state.nodes.filter(n => !removeN.has(n.id));
  state.edges = state.edges.filter(ed => !removeN.has(ed.from) && !removeN.has(ed.to));
  if (removeC.has(selectedId) || removeN.has(selectedId)) selectedId = null;
  if (removeN.has(connectFrom)) cancelPendingConnect();
  render();
}

function deleteEdge(id) {
  state.edges = state.edges.filter(ed => ed.id !== id);
  if (selectedId === id) selectedId = null;
  render();
}

function deleteSelected() {
  if (!selectedId) return;
  const kind = selectedId[0];
  if (kind === 'n') deleteNode(selectedId);
  else if (kind === 'c') deleteContainer(selectedId);
  else if (kind === 'e') deleteEdge(selectedId);
}

// 선택 표시만 바꿈 (DOM을 다시 만들지 않아 드래그 중에도 안전)
function select(id) {
  selectedId = id;
  elMap.forEach((el, key) => el.classList.toggle('selected', key === id));
  renderEdges();
}

// ----- 이동 (서비스 박스 / 영역 + 안의 항목) -----
function startMoveDrag(e, item, el) {
  e.preventDefault();
  e.stopPropagation();
  select(item.id);

  const before = takeSnapshot();
  const group = [item];
  if (isContainer(item)) {
    const d = getDescendants(item.id);
    group.push(...d.containers, ...d.nodes);
  }
  const starts = group.map(g => ({ g, x: g.x, y: g.y }));
  const r = rectOf(item);
  const p0 = clientToWorld(e.clientX, e.clientY);
  const W = $world.clientWidth, H = $world.clientHeight;

  // 함께 움직이는 전체(경계선에 걸친 박스 포함)가 캔버스 안에 머물도록 기준 항목의 좌표 범위 계산
  const box = group.map(rectOf).reduce((b, g) => ({
    x1: Math.min(b.x1, g.x), y1: Math.min(b.y1, g.y),
    x2: Math.max(b.x2, g.x + g.w), y2: Math.max(b.y2, g.y + g.h),
  }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
  const rangeX = [Math.ceil((r.x - box.x1) / GRID) * GRID, Math.floor((W - (box.x2 - r.x)) / GRID) * GRID];
  const rangeY = [Math.ceil((r.y - box.y1) / GRID) * GRID, Math.floor((H - (box.y2 - r.y)) / GRID) * GRID];

  // 기준 항목의 이동량 계산 (캔버스 범위 안으로 제한)
  const delta = (ev, snapIt) => {
    const p = clientToWorld(ev.clientX, ev.clientY);
    let nx = r.x + p.x - p0.x, ny = r.y + p.y - p0.y;
    if (snapIt) { nx = snap(nx); ny = snap(ny); }
    nx = clamp(nx, rangeX[0], rangeX[1]);
    ny = clamp(ny, rangeY[0], rangeY[1]);
    return { dx: nx - r.x, dy: ny - r.y };
  };
  const apply = ({ dx, dy }) => {
    starts.forEach(s => { s.g.x = s.x + dx; s.g.y = s.y + dy; });
    if (!isContainer(item)) snapToVpcEdge(item);   // 경계선 근처면 바로 붙어 보이게
  };
  const movedIds = group.filter(g => !isContainer(g)).map(g => g.id);

  let moved = false;
  el.setPointerCapture(e.pointerId);
  const move = ev => {
    moved = true;
    el.classList.add('dragging');
    apply(delta(ev, false));
    updatePositions();
  };
  const end = ev => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
    el.classList.remove('dragging');
    if (ev.type === 'pointerup' && moved) {
      apply(delta(ev, true));
      commit(before, item.id, movedIds);
    } else if (moved) {
      restoreSnapshot(before);
      render();
    }
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ----- 영역 크기 조절 (corner: 'br' 우하단 / 'tl' 좌상단 손잡이) -----
function startResize(e, c, handle, corner) {
  e.preventDefault();
  e.stopPropagation();
  select(c.id);

  const before = takeSnapshot();
  const p0 = clientToWorld(e.clientX, e.clientY);
  const x0 = c.x, y0 = c.y, w0 = c.width, h0 = c.height;
  const right = x0 + w0, bottom = y0 + h0;
  const tl = corner === 'tl';
  // VPC 경계선에 붙은 박스는 움직이는 쪽 경계선을 따라 함께 움직인다
  const riders = c.type !== 'vpc' ? [] : state.nodes
    .filter(n => n.parentContainer === c.id)
    .map(n => {
      const k = centerOf(n);
      return { n, x: n.x, y: n.y,
        sideX: tl ? k.x === x0 : k.x === right,
        sideY: tl ? k.y === y0 : k.y === bottom };
    })
    .filter(r => r.sideX || r.sideY);
  const riderIds = riders.map(r => r.n.id);
  // 경계선 박스는 따라 움직이는 방향의 한계 계산에서만 뺀다 (다른 방향 경계가 박스를 지나치지 않게)
  const skipX = new Set(riders.filter(r => r.sideX).map(r => r.n.id));
  const skipY = new Set(riders.filter(r => r.sideY).map(r => r.n.id));
  // 경계선 박스가 캔버스 밖으로 나가지 않도록 경계가 갈 수 있는 범위를 줄인다
  const padX = skipX.size ? NODE_W / 2 : 0, padY = skipY.size ? NODE_H / 2 : 0;
  const W = $world.clientWidth, H = $world.clientHeight;

  // 크기 한계: 안에 든 항목보다 작아지지 않게
  let minX, minY, maxX, maxY, min, maxW, maxH;
  if (tl) {
    const def = AREA_MAP[c.type];
    const d = getDescendants(c.id);
    let lx = right - def.minW, ly = bottom - def.minH;
    [...d.containers, ...d.nodes].forEach(item => {
      const r = rectOf(item);
      if (!skipX.has(item.id)) lx = Math.min(lx, r.x);
      if (!skipY.has(item.id)) ly = Math.min(ly, r.y);
    });
    maxX = Math.floor(lx / GRID) * GRID;
    maxY = Math.floor(ly / GRID) * GRID;
    minX = Math.ceil(padX / GRID) * GRID;
    minY = Math.ceil(padY / GRID) * GRID;
  } else {
    min = minSizeOf(c, skipX, skipY);
    maxW = Math.floor((W - padX - c.x) / GRID) * GRID;
    maxH = Math.floor((H - padY - c.y) / GRID) * GRID;
  }

  handle.setPointerCapture(e.pointerId);
  const move = ev => {
    const p = clientToWorld(ev.clientX, ev.clientY);
    if (tl) {
      c.x = clamp(snap(x0 + p.x - p0.x), Math.min(minX, x0), maxX);
      c.y = clamp(snap(y0 + p.y - p0.y), Math.min(minY, y0), maxY);
      c.width  = right - c.x;
      c.height = bottom - c.y;
    } else {
      c.width  = clamp(snap(w0 + p.x - p0.x), min.w, Math.max(maxW, w0));
      c.height = clamp(snap(h0 + p.y - p0.y), min.h, Math.max(maxH, h0));
    }
    riders.forEach(r => {
      if (r.sideX) r.n.x = r.x + (tl ? c.x - x0 : c.width - w0);
      if (r.sideY) r.n.y = r.y + (tl ? c.y - y0 : c.height - h0);
    });
    updatePositions();
  };
  const end = ev => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    if (ev.type === 'pointerup') commit(before, c.id, riderIds);
    else { restoreSnapshot(before); render(); }
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

