// @ts-check
// js/ui/edges.js — UI-5 연결선 (연결점 끌기·직각 경로·손잡이·그리기)

/* ---------------------------------------------------------
   UI-5. 연결선 (연결점 끌기·직각 경로·손잡이·그리기)
   --------------------------------------------------------- */

// ----- 연결점으로 연결 (끌어 놓기, 또는 클릭 → 도착 박스 클릭) -----
let connectCleanup = null;   // 연결 중에 걸어 둔 이벤트를 떼는 함수

function cancelPendingConnect() {
  if (connectCleanup) { connectCleanup(); connectCleanup = null; }
  if (!connectFrom) return;
  connectFrom = null;
  connectFromSide = null;
  elMap.forEach(el => el.classList.remove('connect-from', 'connect-target'));
  document.body.classList.remove('connecting');
  $tempEdge.setAttribute('visibility', 'hidden');
}

// 포인터 아래의 박스와 연결점(변) 찾기
function nodeAtPoint(cx, cy) {
  const target = document.elementFromPoint(cx, cy);
  const el = target && target.closest('#node-layer .node');
  if (!el) return null;
  const anchor = target.closest('.anchor');
  return { id: el.getAttribute('data-id'), side: anchor ? anchor.getAttribute('data-side') : null };
}

// 연결 만들기. 도착이 연결점이면 양 끝 변을 그대로 쓰고, 박스 몸통이면 양 끝 모두 자동(박스를 피하는 경로)
function finishConnect(from, side, hit) {
  cancelPendingConnect();
  if (!hit || hit.id === from) return;
  const dup = state.edges.some(ed =>
    (ed.from === from && ed.to === hit.id) || (ed.from === hit.id && ed.to === from));
  if (dup) { showToast('이미 연결된 박스예요.'); return; }
  state.edges.push({ id: newId('e'), from, to: hit.id,
    fromSide: hit.side ? side : null, toSide: hit.side, mid: null });
  render();
}

// 박스의 연결점을 누르면 연결 시작 (종류와 관계없이 연결 허용)
// - 끌어서 다른 박스에 놓으면 연결
// - 움직이지 않고 떼면 대기 → 다음에 누른 박스와 연결. 빈 곳·같은 박스를 누르거나 Esc면 취소
//   (대기 중에도 휠·스페이스바+끌기로 화면을 옮길 수 있어 멀리 있는 박스도 이을 수 있다)
function startConnectDrag(e, id, side) {
  e.preventDefault();
  e.stopPropagation();
  cancelPendingConnect();
  connectFrom = id;
  connectFromSide = side;
  elMap.get(id).classList.add('connect-from');
  document.body.classList.add('connecting');
  const sx = e.clientX, sy = e.clientY;
  let moved = false;
  let over = null;
  const move = ev => {
    if (!connectFrom) return;
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true;
    const from = findNode(connectFrom);
    const c = anchorPoint(from, side);
    const p = clientToWorld(ev.clientX, ev.clientY);
    $tempEdge.setAttribute('x1', String(c.x));
    $tempEdge.setAttribute('y1', String(c.y));
    $tempEdge.setAttribute('x2', String(p.x));
    $tempEdge.setAttribute('y2', String(p.y));
    $tempEdge.setAttribute('visibility', 'visible');
    const hit = nodeAtPoint(ev.clientX, ev.clientY);
    const next = hit && hit.id !== connectFrom ? hit.id : null;
    if (next !== over) {
      if (over && elMap.get(over)) elMap.get(over).classList.remove('connect-target');
      if (next) elMap.get(next).classList.add('connect-target');
      over = next;
    }
  };
  const up = ev => {
    if (!connectFrom) return;
    if (ev.type === 'pointerup' && !moved) {   // 클릭만 함 → 도착 박스를 누를 때까지 대기
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.addEventListener('pointerdown', down, true);
      showToast('연결할 박스를 클릭하세요. (Esc: 취소)');
      return;
    }
    finishConnect(id, side, ev.type === 'pointerup' ? nodeAtPoint(ev.clientX, ev.clientY) : null);
  };
  // 대기 중 다음 누름: 박스면 연결(박스 이동은 막음), 그 밖이면 취소. 스페이스바+끌기는 화면 이동이라 대기 유지
  const down = ev => {
    if (spaceHeld || ev.button !== 0) return;
    const hit = nodeAtPoint(ev.clientX, ev.clientY);
    if (hit && hit.id !== id) {
      ev.preventDefault();
      ev.stopPropagation();
      finishConnect(id, side, hit);
    } else {
      if (hit) { ev.preventDefault(); ev.stopPropagation(); }   // 같은 박스를 다시 누르면 취소만
      cancelPendingConnect();
    }
  };
  connectCleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('pointerdown', down, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// ----- 연결선 경로 (직각) -----
// 연결선 데이터: fromSide/toSide = 연결 변(null이면 자동), mid = 사용자가 옮긴 경로 (null이면 자동)
//   mid = { x, y }: 가운데 손잡이를 놓은 점. 선이 이 점을 지나가도록 직각으로 꺾는다 (v1.41~)
//   mid = { axis, value }: 예전 저장 형식 (가운데 구간 위치만). 그대로 읽어 그린다
const isViaMid = mid => !!mid && typeof mid.x === 'number' && typeof mid.y === 'number';
const SIDES = ['top', 'right', 'bottom', 'left'];
const SIDE_DIR = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
const STUB = 20;      // 박스 변에서 수직으로 먼저 나가는 길이
const EDGE_GAP = 3;   // 화살표 끝과 박스 사이 여백
const isHorizSide = s => s === 'left' || s === 'right';

// 박스 변 중앙의 연결점 (gap만큼 바깥). off: 변을 따라 옮기는 거리 (한 변에 선이 여러 개일 때)
function anchorPoint(node, side, gap = 0, off = 0) {
  const c = centerOf(node), d = SIDE_DIR[side];
  const p = { x: c.x + d.x * (NODE_W / 2 + gap), y: c.y + d.y * (NODE_H / 2 + gap) };
  if (isHorizSide(side)) p.y += off; else p.x += off;
  return p;
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
  // 손잡이를 놓은 점(via)이 있으면, 사용자가 정하지 않은 연결 변은 네 변 중 가장 자연스러운 것을 고른다
  // (박스를 가로지르지 않고, 되돌아가지 않고, 짧고 덜 꺾이는 경로)
  if (isViaMid(ed.mid)) {
    let best = null;
    for (const sa of ed.fromSide ? [ed.fromSide] : SIDES) {
      for (const sb of ed.toSide ? [ed.toSide] : SIDES) {
        const r = routeFor(a, b, sa, sb, ed.mid);
        if (!best || r.score < best.score) best = r;
      }
    }
    return best;
  }
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
// offA/offB: 연결점을 변을 따라 옮기는 거리 (spreadPorts가 정함)
function routeFor(a, b, sa, sb, mid, offA = 0, offB = 0) {
  const da = SIDE_DIR[sa], db = SIDE_DIR[sb];
  const S = anchorPoint(a, sa, EDGE_GAP, offA), E = anchorPoint(b, sb, EDGE_GAP, offB);
  // 마주 보는 두 변 사이가 짧은 선 두 개보다 좁으면(예: VPC 경계의 IGW 바로 옆 LB) 짧은 선을 틈의 절반으로 줄인다.
  // 그대로 두면 두 짧은 선이 서로 지나쳐 경로가 빙 돌아간다
  let stub = STUB;
  if (da.x === -db.x && da.y === -db.y) {
    const gap = da.x ? (E.x - S.x) * da.x : (E.y - S.y) * da.y;
    if (gap > 0 && gap < 2 * STUB) stub = gap / 2;
  }
  const P = { x: S.x + da.x * stub, y: S.y + da.y * stub };
  const Q = { x: E.x + db.x * stub, y: E.y + db.y * stub };
  const ha = isHorizSide(sa), hb = isHorizSide(sb);
  if (isViaMid(mid)) return viaRoute(a, b, sa, sb, { S, P, Q, E, da, db, ha, hb }, mid, offA, offB);

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
  const fixed = !!(mid && mid.axis === axis);
  if (fixed) {
    m = mid.value;   // 사용자가 옮긴 경로는 그대로
  } else {
    m = avoidBoxes(m, build, skip);   // 자동 경로는 다른 박스를 피해서
  }

  const { pts, mids } = build(m);
  const handle = { x: (mids[0].x + mids[1].x) / 2, y: (mids[0].y + mids[1].y) / 2 };
  // 가운데 구간 범위 (겹침 간격 벌리기용). 구간이 시작·끝 짧은 선과 이어져 있으면(ㄱ자 등) 옮기지 않는다.
  const other = axis === 'x' ? 'y' : 'x';
  const same = (p, q) => p.x === q.x && p.y === q.y;
  const seg = {
    lo: Math.min(mids[0][other], mids[1][other]),
    hi: Math.max(mids[0][other], mids[1][other]),
    free: !fixed && !same(mids[0], P) && !same(mids[1], Q),
  };
  return { points: simplifyPoints(pts), axis, m, handle, sa, sb, offA, offB, seg, crossings: crossingCount(pts, skip) };
}

// 사용자가 놓은 점 W를 지나가는 직각 경로. 후보 중 박스를 덜 가로지르고, 되돌아가지 않고, 덜 꺾이는 것을 고른다.
// - 한 줄: W가 두 끝 사이에 있으면 가운데 구간 하나가 W를 지남 (지금까지의 모양과 같음)
// - 모서리: W에서 꺾임. 가로로 들어와 세로로 나가거나, 세로로 들어와 가로로 나감 (박스 아래로 돌아가는 U자 등)
function viaRoute(a, b, sa, sb, g, W, offA, offB) {
  const { S, P, Q, E, da, db, ha, hb } = g;
  const cands = [
    [P, { x: P.x, y: W.y }, W, { x: W.x, y: Q.y }, Q],   // 세로 → W → 세로 (W에서 가로 구간)
    [P, { x: W.x, y: P.y }, W, { x: Q.x, y: W.y }, Q],   // 가로 → W → 가로 (W에서 세로 구간)
  ];
  const between = (v, p, q) => v >= Math.min(p, q) && v <= Math.max(p, q);
  if (ha && hb && between(W.y, P.y, Q.y)) cands.unshift([P, { x: W.x, y: P.y }, { x: W.x, y: Q.y }, Q]);
  if (!ha && !hb && between(W.x, P.x, Q.x)) cands.unshift([P, { x: P.x, y: W.y }, { x: Q.x, y: W.y }, Q]);
  const dir = (p, q) => ({ x: Math.sign(q.x - p.x), y: Math.sign(q.y - p.y) });
  const score = inner => {
    // 시작 짧은 선 다음 구간이 박스 쪽으로 되돌아가거나, 도착 짧은 선으로 반대쪽에서 들어오면 선이 겹쳐 보여 감점
    const nextOfP = inner.find(p => p.x !== P.x || p.y !== P.y);
    const prevOfQ = [...inner].reverse().find(p => p.x !== Q.x || p.y !== Q.y);
    const first = nextOfP ? dir(P, nextOfP) : { x: 0, y: 0 };
    const last = prevOfQ ? dir(prevOfQ, Q) : { x: 0, y: 0 };
    const back = (first.x === -da.x && first.y === -da.y ? 1 : 0) + (last.x === db.x && last.y === db.y ? 1 : 0);
    const all = simplifyPoints([S, ...inner, E]);
    const len = all.slice(1).reduce((sum, q, i) => sum + Math.abs(q.x - all[i].x) + Math.abs(q.y - all[i].y), 0);
    // 양 끝 박스까지 포함해 가로지르는 박스 수 > 되돌아감 > 꺾이는 수 > 길이 순으로 중요
    return crossingCount(simplifyPoints(inner), []) * 1000 + back * 300 + all.length * 20 + len / 20;
  };
  let best = cands[0], bestScore = score(best);
  cands.slice(1).forEach(c => { const s = score(c); if (s < bestScore) { best = c; bestScore = s; } });
  const pts = simplifyPoints([S, ...best, E]);
  const skip = [a.id, b.id];
  return { points: pts, axis: 'free', m: 0, handle: { x: W.x, y: W.y }, sa, sb, offA, offB,
    seg: { lo: 0, hi: 0, free: false },   // 사용자가 옮긴 선은 겹침 벌리기에서 움직이지 않음
    crossings: crossingCount(pts, skip), score: bestScore };
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

// 한 박스의 같은 변에 연결선이 여러 개면 연결점을 변을 따라 PORT_GAP씩 나눠 놓는다.
// 선끼리 엇갈리지 않도록 상대 박스가 있는 쪽 순서대로 놓는다. (그리기용, 저장 데이터는 바꾸지 않음)
const PORT_GAP = 12;
function spreadPorts(routes) {
  const ports = new Map();   // "박스 id:변" → 그 변을 쓰는 선 끝 목록
  routes.forEach((r, ed) => {
    [[ed.from, r.sa, ed.to, 'offA'], [ed.to, r.sb, ed.from, 'offB']].forEach(([id, side, otherId, key]) => {
      const k = `${id}:${side}`;
      if (!ports.has(k)) ports.set(k, []);
      ports.get(k).push({ ed, side, other: centerOf(findNode(otherId)), key });
    });
  });
  const offs = new Map();   // 연결선 → { offA, offB }
  ports.forEach(list => {
    if (list.length < 2) return;
    const along = isHorizSide(list[0].side) ? 'y' : 'x';
    const len = along === 'y' ? NODE_H : NODE_W;
    const gap = Math.min(PORT_GAP, (len - 16) / (list.length - 1));   // 변 끝 8px 안쪽까지만
    list.sort((p, q) => p.other[along] - q.other[along]);
    list.forEach((p, i) => {
      if (!offs.has(p.ed)) offs.set(p.ed, { offA: 0, offB: 0 });
      offs.get(p.ed)[p.key] = (i - (list.length - 1) / 2) * gap;
    });
  });
  offs.forEach((o, ed) => {
    const r = routes.get(ed);
    routes.set(ed, routeFor(findNode(ed.from), findNode(ed.to), r.sa, r.sb, ed.mid, o.offA, o.offB));
  });
}

// 두 선분이 같은 줄에서 일부라도 겹치는지 (닿기만 하는 것은 제외)
function segsOverlap(p1, q1, p2, q2) {
  const span = (a, b, c, d) => Math.min(Math.max(a, b), Math.max(c, d)) - Math.max(Math.min(a, b), Math.min(c, d));
  if (p1.y === q1.y && p2.y === q2.y && Math.abs(p1.y - p2.y) < 0.5) return span(p1.x, q1.x, p2.x, q2.x) > 1;
  if (p1.x === q1.x && p2.x === q2.x && Math.abs(p1.x - p2.x) < 0.5) return span(p1.y, q1.y, p2.y, q2.y) > 1;
  return false;
}

// 선의 시작·끝 구간이 다른 선과 같은 줄에서 겹치면 (줄 맞춰 놓인 박스끼리 흔함),
// 그 끝의 연결점을 변을 따라 옮겨 비켜 간다. 겹친 채로 두면 연결하지 않은 박스가 이어진 것처럼 보인다.
function spreadLegs(routes) {
  const hitsOther = (p, q, self) => [...routes].some(([ed, r]) => ed !== self &&
    r.points.slice(1).some((b, i) => segsOverlap(p, q, r.points[i], b)));
  const legOf = (pts, key) => key === 'offA' ? [pts[0], pts[1]] : [pts[pts.length - 2], pts[pts.length - 1]];
  [...routes.keys()].forEach(ed => {
    ['offA', 'offB'].forEach(key => {
      const r = routes.get(ed);
      const [p, q] = legOf(r.points, key);
      if (!hitsOther(p, q, ed)) return;
      const limit = (isHorizSide(key === 'offA' ? r.sa : r.sb) ? NODE_H : NODE_W) / 2 - 8;
      for (const d of [PORT_GAP, -PORT_GAP, 2 * PORT_GAP, -2 * PORT_GAP]) {
        const o = { offA: r.offA, offB: r.offB };
        o[key] += d;
        if (Math.abs(o[key]) > limit) continue;
        const moved = routeFor(findNode(ed.from), findNode(ed.to), r.sa, r.sb, ed.mid, o.offA, o.offB);
        if (moved.crossings > r.crossings) continue;
        const [mp, mq] = legOf(moved.points, key);
        if (hitsOther(mp, mq, ed)) continue;
        routes.set(ed, moved);
        return;
      }
    });
  });
}

// 여러 연결선의 가운데 구간이 같은 줄에서 겹치면, 뒤의 선을 EDGE_SPREAD씩 옆으로 벌린다 (+1칸, -1칸, +2칸 …)
// 사용자가 옮긴 선은 움직이지 않고 먼저 자리를 차지한다. 벌려서 박스를 더 가로지르게 되면 그 칸은 쓰지 않는다.
// routes: 연결선 → 경로 (벌린 선은 새 경로로 바뀜). 그리기용이며 저장 데이터(mid)는 바꾸지 않는다.
const EDGE_SPREAD = 8;
function spreadOverlaps(routes) {
  const groups = new Map();   // 같은 줄(방향 + 위치)에 있는 가운데 구간끼리 모음
  routes.forEach((r, ed) => {
    if (r.seg.hi - r.seg.lo < 1) return;
    const key = `${r.axis}:${Math.round(r.m)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ed, r });
  });
  groups.forEach(list => {
    if (list.length < 2) return;
    list.sort((p, q) => (Number(p.r.seg.free) - Number(q.r.seg.free)) || (p.r.seg.lo - q.r.seg.lo));
    const lanes = [];   // 칸별로 차지한 구간 목록
    const fits = (k, seg) => !(lanes[k] || []).some(s => s.lo < seg.hi - 1 && seg.lo < s.hi - 1);
    const take = (k, seg) => (lanes[k] = lanes[k] || []).push(seg);
    list.forEach(({ ed, r }) => {
      if (!r.seg.free || fits(0, r.seg)) { take(0, r.seg); return; }
      for (let k = 1; k <= 6; k++) {
        if (!fits(k, r.seg)) continue;
        const off = Math.ceil(k / 2) * EDGE_SPREAD * (k % 2 ? 1 : -1);
        const moved = routeFor(findNode(ed.from), findNode(ed.to), r.sa, r.sb, { axis: r.axis, value: r.m + off }, r.offA, r.offB);
        if (moved.crossings > r.crossings) continue;
        routes.set(ed, moved);
        take(k, r.seg);
        return;
      }
    });
  });
}

const pathD = pts =>pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');

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
// 가운데 손잡이를 아무 방향으로 끌면 선이 그 점을 지나가도록 직각으로 다시 그린다
function startMidDrag(e, ed) {
  e.preventDefault();
  e.stopPropagation();
  let changed = false;
  const sx = e.clientX, sy = e.clientY;
  // 연결 변은 고정하지 않는다: 사용자가 정하지 않은 변은 놓은 점에 맞춰 자동으로 고른다 (edgeRoute)
  const move = ev => {
    if (!changed && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;   // 클릭만(더블클릭 포함)이면 그대로
    const p = clientToWorld(ev.clientX, ev.clientY);
    const half = GRID / 2;
    const w = { x: Math.round(p.x / half) * half, y: Math.round(p.y / half) * half };
    if (isViaMid(ed.mid) && ed.mid.x === w.x && ed.mid.y === w.y) return;
    ed.mid = w;
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
  $edgeG.querySelectorAll('.edge').forEach(p => p.classList.toggle('hl', p.getAttribute('data-id') === id));
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
  const routes = new Map();
  state.edges.forEach(ed => { if (findNode(ed.from) && findNode(ed.to)) routes.set(ed, edgeRoute(ed)); });
  spreadPorts(routes);
  spreadLegs(routes);
  spreadOverlaps(routes);
  // 검증 후: 사용자와 이어진 선은 요청이 흘러가는 쪽에만 화살표 (reverse면 from 쪽이 도착점, Route 53·WAF 선은 양쪽)
  const flowDir = validation && validation.flow ? new Map(validation.flow.map(f => [f.id, f.roundTrip || f.inspect ? null : f.reverse])) : null;
  state.edges.forEach(ed => {
    const route = routes.get(ed);
    if (!route) return;
    const d = pathD(route.points);
    const sel = ed.id === selectedId;
    const marker = `url(#${sel ? 'arrow-sel' : 'arrow'})`;
    const dir = flowDir && flowDir.has(ed.id) ? flowDir.get(ed.id) : null;   // null = 양쪽 화살표
    const line = svgEl('path', { d, class: 'edge' + (sel ? ' selected' : ''), 'data-id': ed.id });
    if (dir !== false) line.setAttribute('marker-start', marker);
    if (dir !== true) line.setAttribute('marker-end', marker);
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
      if (ed.id === selectedId) {
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
    if (!sel) return;

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
    const mh = svgEl('g', { class: 'edge-handle mid-free' });
    mh.append(svgEl('circle', { cx: hx, cy: hy, r: 11, class: 'handle-hit' }),
              svgEl('rect', { x: hx - 5, y: hy - 5, width: 10, height: 10, rx: 2, class: 'handle-shape' }));
    mh.addEventListener('pointerdown', ev => startMidDrag(ev, ed));
    mh.addEventListener('dblclick', () => { ed.mid = null; ed.fromSide = null; ed.toSide = null; render(); });   // 완전 자동으로
    $handleG.appendChild(mh);
  });
}

