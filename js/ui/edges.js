// js/ui/edges.js — UI-5 연결선 (연결 모드·직각 경로·손잡이·그리기)

/* ---------------------------------------------------------
   UI-5. 연결선 (연결 모드·직각 경로·손잡이·그리기)
   --------------------------------------------------------- */

// ----- 연결 모드 -----
function setConnectMode(on) {
  connectMode = on;
  cancelPendingConnect();
  $btnConnect.classList.toggle('active', on);
  $btnConnect.textContent = on ? '연결 모드 켜짐' : '연결 모드';
  document.body.classList.toggle('connect-mode', on);
  render();
  if (on) showToast('시작 박스를 클릭한 뒤 도착 박스를 클릭하세요. (Esc: 취소)');
}

function cancelPendingConnect() {
  if (!connectFrom) return;
  connectFrom = null;
  connectFromSide = null;
  elMap.forEach(el => el.classList.remove('connect-from'));
  $tempEdge.setAttribute('visibility', 'hidden');
}

// 연결 모드에서 박스 클릭 처리 (종류와 관계없이 연결 허용)
// side: 연결점(변 중앙)을 눌렀으면 그 변, 박스 몸통을 눌렀으면 null(자동)
function handleConnectClick(id, side) {
  if (!connectFrom) {
    connectFrom = id;
    connectFromSide = side;
    elMap.get(id).classList.add('connect-from');
    return;
  }
  if (connectFrom === id) { cancelPendingConnect(); return; }
  const from = connectFrom, fromSide = connectFromSide;
  const dup = state.edges.some(ed =>
    (ed.from === from && ed.to === id) || (ed.from === id && ed.to === from));
  cancelPendingConnect();
  if (dup) { showToast('이미 연결된 박스예요.'); return; }
  state.edges.push({ id: newId('e'), from, to: id, fromSide, toSide: side, mid: null });
  render();
}

// ----- 연결선 경로 (직각) -----
// 연결선 데이터: fromSide/toSide = 연결 변(null이면 자동), mid = 가운데 구간 위치 { axis, value } (null이면 자동)
const SIDES = ['top', 'right', 'bottom', 'left'];
const SIDE_DIR = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
const STUB = 20;      // 박스 변에서 수직으로 먼저 나가는 길이
const EDGE_GAP = 3;   // 화살표 끝과 박스 사이 여백
const isHorizSide = s => s === 'left' || s === 'right';

// 박스 변 중앙의 연결점 (gap만큼 바깥)
function anchorPoint(node, side, gap = 0) {
  const c = centerOf(node), d = SIDE_DIR[side];
  return { x: c.x + d.x * (NODE_W / 2 + gap), y: c.y + d.y * (NODE_H / 2 + gap) };
}

// 두 박스의 위치로 자연스러운 연결 변을 고른다
function autoSides(a, b) {
  const ca = centerOf(a), cb = centerOf(b);
  const dx = cb.x - ca.x, dy = cb.y - ca.y;
  if (Math.abs(dx) - NODE_W >= Math.abs(dy) - NODE_H) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

// 같은 쪽을 보는 변끼리 연결할 때 두 박스를 피해 돌아가는 위치
function detour(a, b, axis) {
  const ra = rectOf(a), rb = rectOf(b);
  const pos = axis === 'y' ? 'y' : 'x', size = axis === 'y' ? 'h' : 'w';
  if (ra[pos] + ra[size] + 2 * STUB <= rb[pos]) return (ra[pos] + ra[size] + rb[pos]) / 2;
  if (rb[pos] + rb[size] + 2 * STUB <= ra[pos]) return (rb[pos] + rb[size] + ra[pos]) / 2;
  return Math.max(ra[pos] + ra[size], rb[pos] + rb[size]) + STUB * 1.5;
}

// 꺾이는 점 목록에서 중복 점과 같은 방향으로 이어지는 중간 점을 정리
function simplifyPoints(pts) {
  const out = [];
  pts.forEach(p => {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    out.push(p);
  });
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    const forward = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0;
    if (collinear && forward) out.splice(i, 1);
  }
  return out;
}

// 연결선 경로 계산 → { points, axis, m, handle(가운데 손잡이 위치), sa, sb(실제 쓴 연결 변) }
// 연결 변과 경로가 모두 자동이면, 다른 박스를 가로지르지 않는 연결 변 조합을 찾는다.
function edgeRoute(ed) {
  const a = findNode(ed.from), b = findNode(ed.to);
  const [autoA, autoB] = autoSides(a, b);
  if (ed.fromSide || ed.toSide || ed.mid) {
    return routeFor(a, b, ed.fromSide || autoA, ed.toSide || autoB, ed.mid);
  }
  // 기본 조합 → ㄷ자로 돌아가는 조합 → ㄱ자 조합 순으로 시도
  const horiz = isHorizSide(autoA);
  const [p1, p2] = horiz ? ['top', 'bottom'] : ['left', 'right'];
  const candidates = [[autoA, autoB], [p1, p1], [p2, p2], [autoA, p1], [autoA, p2], [p1, autoB], [p2, autoB]];
  let best = null;
  for (const [sa, sb] of candidates) {
    const r = routeFor(a, b, sa, sb, null);
    if (!best || r.crossings < best.crossings) best = r;
    if (!r.crossings) break;
  }
  return best;
}

// 정해진 연결 변(sa, sb)으로 경로 계산. mid가 없으면 가운데 구간을 옮겨 가며 박스를 피한다.
function routeFor(a, b, sa, sb, mid) {
  const da = SIDE_DIR[sa], db = SIDE_DIR[sb];
  const S = anchorPoint(a, sa, EDGE_GAP), E = anchorPoint(b, sb, EDGE_GAP);
  const P = { x: S.x + da.x * STUB, y: S.y + da.y * STUB };
  const Q = { x: E.x + db.x * STUB, y: E.y + db.y * STUB };
  const ha = isHorizSide(sa), hb = isHorizSide(sb);

  // axis: 가운데 구간이 세로선이면 'x'(x 위치로 조절), 가로선이면 'y'
  let axis, m;
  if (ha && hb) {
    if (da.x === db.x)               { axis = 'x'; m = da.x > 0 ? Math.max(P.x, Q.x) : Math.min(P.x, Q.x); }
    else if (da.x * (Q.x - P.x) >= 0) { axis = 'x'; m = (P.x + Q.x) / 2; }
    else                              { axis = 'y'; m = detour(a, b, 'y'); }
  } else if (!ha && !hb) {
    if (da.y === db.y)               { axis = 'y'; m = da.y > 0 ? Math.max(P.y, Q.y) : Math.min(P.y, Q.y); }
    else if (da.y * (Q.y - P.y) >= 0) { axis = 'y'; m = (P.y + Q.y) / 2; }
    else                              { axis = 'x'; m = detour(a, b, 'x'); }
  } else if (ha) {   // 시작은 가로 변, 도착은 세로 변 → ㄱ자
    axis = 'x';
    m = (da.x * (Q.x - P.x) >= 0 && db.y * (P.y - Q.y) >= 0) ? Q.x : P.x;
  } else {           // 시작은 세로 변, 도착은 가로 변 → ㄴ자
    axis = 'y';
    m = (da.y * (Q.y - P.y) >= 0 && db.x * (P.x - Q.x) >= 0) ? Q.y : P.y;
  }
  const build = mv => {
    const mids = axis === 'x'
      ? [{ x: mv, y: P.y }, { x: mv, y: Q.y }]
      : [{ x: P.x, y: mv }, { x: Q.x, y: mv }];
    return { pts: [S, P, ...mids, Q, E], mids };
  };
  const skip = [a.id, b.id];
  if (mid && mid.axis === axis) {
    m = mid.value;   // 사용자가 옮긴 경로는 그대로
  } else {
    m = avoidBoxes(m, build, skip);   // 자동 경로는 다른 박스를 피해서
  }

  const { pts, mids } = build(m);
  const handle = { x: (mids[0].x + mids[1].x) / 2, y: (mids[0].y + mids[1].y) / 2 };
  return { points: simplifyPoints(pts), axis, m, handle, sa, sb, crossings: crossingCount(pts, skip) };
}

// 경로가 다른 서비스 박스를 몇 번 가로지르는지 (박스 둘레 여백 포함)
const AVOID_MARGIN = 6;
function crossingCount(pts, skipIds) {
  let count = 0;
  state.nodes.forEach(n => {
    if (skipIds.includes(n.id)) return;
    const r = rectOf(n);
    const x1 = r.x - AVOID_MARGIN, x2 = r.x + r.w + AVOID_MARGIN;
    const y1 = r.y - AVOID_MARGIN, y2 = r.y + r.h + AVOID_MARGIN;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const hit = p.y === q.y
        ? p.y > y1 && p.y < y2 && Math.max(p.x, q.x) > x1 && Math.min(p.x, q.x) < x2
        : p.x > x1 && p.x < x2 && Math.max(p.y, q.y) > y1 && Math.min(p.y, q.y) < y2;
      if (hit) { count++; break; }
    }
  });
  return count;
}

// 가운데 구간 위치(m)를 기본값에서 조금씩 옮겨 보며 박스를 가로지르지 않는 위치를 찾는다.
// 완전히 피할 수 없으면 가장 적게 가로지르는 위치를 쓴다.
function avoidBoxes(m0, build, skipIds) {
  let best = m0, bestCount = crossingCount(build(m0).pts, skipIds);
  for (let k = 1; k <= 40 && bestCount > 0; k++) {
    for (const mv of [m0 + k * GRID / 2, m0 - k * GRID / 2]) {
      const c = crossingCount(build(mv).pts, skipIds);
      if (c < bestCount) { best = mv; bestCount = c; if (!c) break; }
    }
  }
  return best;
}

const pathD = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');

// 연결선 끝 손잡이를 끌어 같은 박스의 다른 변으로 옮기기
function startEndpointDrag(e, ed, end) {
  e.preventDefault();
  e.stopPropagation();
  const node = findNode(end === 'from' ? ed.from : ed.to);
  const key = end === 'from' ? 'fromSide' : 'toSide';
  const otherKey = end === 'from' ? 'toSide' : 'fromSide';
  const cur = edgeRoute(ed);   // 반대쪽 끝은 지금 보이는 변으로 고정 (자동 경로가 다른 변을 골랐을 수 있음)
  const move = ev => {
    const p = clientToWorld(ev.clientX, ev.clientY);
    let best = null, bestD = Infinity;
    SIDES.forEach(s => {
      const q = anchorPoint(node, s);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; best = s; }
    });
    if (ed[key] !== best) {
      if (!ed[otherKey]) ed[otherKey] = end === 'from' ? cur.sb : cur.sa;
      ed[key] = best;
      ed.mid = null;   // 변이 바뀌면 경로는 자동으로
      changed = true;
      renderEdges();
    }
  };
  let changed = false;
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (changed) render();   // 클릭만 했으면 다시 그리지 않음 (더블클릭 인식용)
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// 가운데 손잡이를 끌어 경로(가운데 구간)를 평행 이동
function startMidDrag(e, ed, axis) {
  e.preventDefault();
  e.stopPropagation();
  let changed = false;
  const cur = edgeRoute(ed);   // 지금 보이는 연결 변을 고정해야 옮긴 경로가 유지됨
  const move = ev => {
    const p = clientToWorld(ev.clientX, ev.clientY);
    const value = Math.round(p[axis] / (GRID / 2)) * (GRID / 2);
    if (ed.mid && ed.mid.axis === axis && ed.mid.value === value) return;
    if (!ed.fromSide) ed.fromSide = cur.sa;
    if (!ed.toSide) ed.toSide = cur.sb;
    ed.mid = { axis, value };
    changed = true;
    renderEdges();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (changed) render();   // 클릭만 했으면 다시 그리지 않음 (더블클릭 인식용)
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// ----- 연결선 그리기 -----
const edgePoints = new Map();   // 연결선 id → 지금 그려진 경로 점 (동적 흐름용)
let hoverEdgeId = null;   // 마우스를 올린 연결선
const $edgeLayer = document.getElementById('edge-layer');

// 연결선 강조: 해당 선과 양 끝 박스를 돋보이게 하고 나머지 선은 흐리게
function setHoverEdge(id) {
  if (hoverEdgeId === id) return;
  hoverEdgeId = id;
  $edgeLayer.classList.toggle('dimmed', !!id);
  const ed = id && state.edges.find(e => e.id === id);
  $edgeG.querySelectorAll('.edge').forEach(p => p.classList.toggle('hl', p.dataset.id === id));
  elMap.forEach((el, key) => el.classList.toggle('edge-end', !!ed && (key === ed.from || key === ed.to)));
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function renderEdges() {
  $edgeG.innerHTML = '';
  $handleG.innerHTML = '';
  edgePoints.clear();
  state.edges.forEach(ed => {
    const a = findNode(ed.from), b = findNode(ed.to);
    if (!a || !b) return;
    const route = edgeRoute(ed);
    const d = pathD(route.points);
    const sel = ed.id === selectedId;
    const marker = `url(#${sel ? 'arrow-sel' : 'arrow'})`;
    const line = svgEl('path', { d, class: 'edge' + (sel ? ' selected' : ''),
      'marker-start': marker, 'marker-end': marker, 'data-id': ed.id });
    const hit = svgEl('path', { d, class: 'edge-hit' });   // 클릭하기 쉽게 넓은 투명 선
    const pts = route.points;
    edgePoints.set(ed.id, pts);   // 동적 흐름 점이 따라갈 경로
    // 마우스를 올리면 이 선만 진하게, 나머지 선은 흐리게
    if (ed.id === hoverEdgeId) line.classList.add('hl');
    hit.addEventListener('pointerenter', () => setHoverEdge(ed.id));
    hit.addEventListener('pointerleave', () => setHoverEdge(null));
    hit.addEventListener('pointerdown', ev => {
      ev.stopPropagation();
      cancelPendingConnect();
      // 이미 선택된 선의 끝부분(화살촉 근처)을 잡으면 끝점 끌기로 처리
      if (ed.id === selectedId && !connectMode) {
        const p = clientToWorld(ev.clientX, ev.clientY);
        const dist = q => Math.hypot(q.x - p.x, q.y - p.y);
        const dFrom = dist(pts[0]), dTo = dist(pts[pts.length - 1]);
        if (Math.min(dFrom, dTo) <= 16) {
          startEndpointDrag(ev, ed, dTo <= dFrom ? 'to' : 'from');
          return;
        }
      }
      select(ed.id);
    });
    $edgeG.append(line, hit);
    if (!sel || connectMode) return;

    // 선택된 연결선: 양 끝(연결 변 바꾸기) + 가운데(경로 옮기기) 손잡이. 더블클릭하면 자동으로 되돌림.
    // 손잡이는 박스 위 레이어에 그려서 박스·다른 선에 가려지지 않게 한다.
    [['from', pts[0]], ['to', pts[pts.length - 1]]].forEach(([end, p]) => {
      const h = svgEl('g', { class: 'edge-handle' });
      h.append(svgEl('circle', { cx: p.x, cy: p.y, r: 11, class: 'handle-hit' }),
               svgEl('circle', { cx: p.x, cy: p.y, r: 5, class: 'handle-shape' }));
      h.addEventListener('pointerdown', ev => startEndpointDrag(ev, ed, end));
      h.addEventListener('dblclick', () => { ed[end === 'from' ? 'fromSide' : 'toSide'] = null; ed.mid = null; render(); });
      $handleG.appendChild(h);
    });
    const { x: hx, y: hy } = route.handle;
    const mh = svgEl('g', { class: `edge-handle mid-${route.axis}` });
    mh.append(svgEl('circle', { cx: hx, cy: hy, r: 11, class: 'handle-hit' }),
              svgEl('rect', { x: hx - 5, y: hy - 5, width: 10, height: 10, rx: 2, class: 'handle-shape' }));
    mh.addEventListener('pointerdown', ev => startMidDrag(ev, ed, route.axis));
    mh.addEventListener('dblclick', () => { ed.mid = null; ed.fromSide = null; ed.toSide = null; render(); });   // 완전 자동으로
    $handleG.appendChild(mh);
  });
}

