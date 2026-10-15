// @ts-check
// js/ui/core.js — UI-1 상태·공통 유틸, UI-2 소속 판정·동작 검사
/* =========================================================
   UI·드래그 로직 (js/ui/, js/main.js)
   UI-1·2 core.js      상태·공통 유틸, 소속 판정·동작 검사
   UI-3   palette.js   팔레트·설명 툴팁
   UI-4   edit.js      추가·삭제·선택·이동·크기 조절
   UI-5   edges.js     연결선
   UI-6·7 render.js    그리기, 줌·저장·실행 취소
   UI-8   result.js    검증 결과 표시·동적 흐름
   UI-10  info.js      서비스 설명 패널
   UI-11  simulate.js  성능 시뮬레이션 패널·박스 사용률
   UI-9   main.js      기본 틀·이벤트·시작
   ========================================================= */

/* ---------------------------------------------------------
   UI-1. 상태·공통 유틸
   --------------------------------------------------------- */

// ----- 캔버스 상태 -----
const state = {
  nodes: [],       // { id, type, x, y, parentContainer }
  containers: [],  // { id, type, x, y, width, height, parentContainer, label }
  edges: [],       // { id, from, to, fromSide, toSide, mid } - 연결 변·경로는 null이면 자동 (UI-5 참고)
};
let idSeq = 1;
const newId = prefix => `${prefix}${idSeq++}`;   // n=서비스, c=영역, e=연결선
let selectedId = null;
let connectMode = false;   // 연결 모드 켜짐 여부
let connectFrom = null;    // 연결 시작 박스 id
let connectFromSide = null; // 연결 시작 변 (연결점을 직접 골랐을 때)
const elMap = new Map();   // id → DOM 요소
let validation = null;     // 마지막 검증 결과 { sig, status, issues, nodeLevels }
let resultNote = '아직 검증하지 않았어요.';   // 검증 결과가 없을 때 보여줄 문구
let zoom = 1;              // 캔버스 배율

// ----- DOM 참조 -----
const $palette   = document.getElementById('palette');
const $wrap      = document.getElementById('canvas-wrap');
const $world     = document.getElementById('world');
const $areaLayer = document.getElementById('area-layer');
const $edgeG     = document.getElementById('edge-g');
const $tempEdge  = document.getElementById('temp-edge');
const $handleG   = document.getElementById('handle-g');
const $nodeLayer = document.getElementById('node-layer');
const $emptyHint = document.getElementById('empty-hint');
const $toast     = document.getElementById('toast');
const $btnConnect = document.getElementById('btn-connect');
const $result    = document.getElementById('result');
const $sizer     = document.getElementById('world-sizer');
const $zoomLabel = document.getElementById('zoom-reset');

const LOCK_SVG = '<svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">' +
  '<rect x="1" y="5" width="9" height="7" rx="1.2" fill="currentColor"/>' +
  '<path d="M3 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';

// ----- 유틸 -----
const snap = v => Math.round(v / GRID) * GRID;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const findNode = id => state.nodes.find(n => n.id === id);
const findContainer = id => state.containers.find(c => c.id === id);
const isContainer = item => item.width !== undefined;

// 화면 좌표 → 캔버스(world) 좌표 (스크롤·줌 반영)
function clientToWorld(cx, cy) {
  const r = $world.getBoundingClientRect();
  return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom };
}
// 캔버스(world) 좌표 → 화면 좌표
function worldToClient(wx, wy) {
  const r = $world.getBoundingClientRect();
  return { x: r.left + wx * zoom, y: r.top + wy * zoom };
}

// 포인터가 캔버스 보이는 영역 안에 있는지
function isOverCanvas(cx, cy) {
  const r = $wrap.getBoundingClientRect();
  return cx >= r.left && cx <= r.left + $wrap.clientWidth &&
         cy >= r.top  && cy <= r.top + $wrap.clientHeight;
}

// 좌상단 좌표를 격자에 스냅하고 캔버스 범위 안으로 맞춤
function fitRect(x, y, w, h) {
  return {
    x: clamp(snap(x), 0, $world.clientWidth - w),
    y: clamp(snap(y), 0, $world.clientHeight - h),
  };
}

function rectOf(item) {
  return isContainer(item)
    ? { x: item.x, y: item.y, w: item.width, h: item.height }
    : { x: item.x, y: item.y, w: NODE_W, h: NODE_H };
}
function centerOf(item) {
  const r = rectOf(item);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
function inRect(r, p) {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}
// 테두리 위의 점도 안으로 보는 판정 (VPC 경계선에 걸친 박스용)
function inRectInclusive(r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
// 두 사각형이 겹치는지 (변이 맞닿기만 한 경우는 겹침 아님)
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// 상태 스냅샷 (동작이 규칙에 어긋나면 되돌리기용)
const takeSnapshot = () => JSON.parse(JSON.stringify(state));
function restoreSnapshot(s) {
  state.nodes = s.nodes;
  state.containers = s.containers;
  state.edges = s.edges;
}

// 안내 메시지 잠깐 표시
let toastTimer = null;
function showToast(msg, kind = '') {
  $toast.textContent = msg;
  $toast.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.className = 'toast ' + kind; }, kind === 'warn' ? 3200 : 2200);
}

/* ---------------------------------------------------------
   UI-2. 소속 판정·동작 검사 (규칙 위반이면 되돌리기)
   --------------------------------------------------------- */

// ----- 소속 판정 -----
// 점 p를 품는 가장 안쪽 영역. self(영역)를 판정할 때는 자신보다 큰 영역만 후보로 본다.
// 서비스 박스의 중심이 VPC 경계선 위에 있으면 그 VPC 소속(서브넷 밖)으로 본다.
// 덧씌우는 영역(Auto Scaling 그룹)은 다른 항목의 소속 후보가 아니고, 자신은 VPC에만 소속된다.
function innermostContainer(p, self) {
  const selfArea = self ? self.width * self.height : Infinity;
  const selfRank = self ? AREA_MAP[self.type].rank : Infinity;
  const selfOverlay = !!(self && AREA_MAP[self.type].overlay);
  let best = null, bestArea = Infinity;
  for (const k of state.containers) {
    if (k === self || AREA_MAP[k.type].overlay) continue;
    if (selfOverlay && k.type !== 'vpc') continue;
    const hit = (!self && k.type === 'vpc') ? inRectInclusive(rectOf(k), p) : inRect(rectOf(k), p);
    if (!hit) continue;
    const area = k.width * k.height;
    const rank = AREA_MAP[k.type].rank;
    if (self && !(area > selfArea || (area === selfArea && rank < selfRank))) continue;
    if (area < bestArea || (area === bestArea && rank > AREA_MAP[best.type].rank)) {
      best = k;
      bestArea = area;
    }
  }
  return best;
}

// 모든 영역·박스의 소속(parentContainer)을 중심점 기준으로 다시 계산
function recomputeParents() {
  state.containers.forEach(c => {
    const p = innermostContainer(centerOf(c), c);
    c.parentContainer = p ? p.id : null;
  });
  state.nodes.forEach(n => {
    const p = innermostContainer(centerOf(n), null);
    n.parentContainer = p ? p.id : null;
  });
}

// 영역 안에 들어 있는 하위 영역·박스 전체
function getDescendants(cid) {
  const containers = [], nodes = [];
  const walk = id => {
    state.containers.forEach(c => {
      if (c.parentContainer === id) { containers.push(c); walk(c.id); }
    });
    state.nodes.forEach(n => { if (n.parentContainer === id) nodes.push(n); });
  };
  walk(cid);
  return { containers, nodes };
}

// 영역 크기 조절 최솟값: 기본 최소 크기와 안에 든 항목을 모두 덮는 크기 중 큰 값
// (skipX/skipY: 해당 방향 경계선을 따라 함께 움직이는 박스라 그 방향 계산에서만 뺄 id)
function minSizeOf(c, skipX = new Set(), skipY = new Set()) {
  const def = AREA_MAP[c.type];
  let w = def.minW, h = def.minH;
  const d = getDescendants(c.id);
  [...d.containers, ...d.nodes].forEach(item => {
    const r = rectOf(item);
    if (!skipX.has(item.id)) w = Math.max(w, r.x + r.w - c.x);
    if (!skipY.has(item.id)) h = Math.max(h, r.y + r.h - c.y);
  });
  return { w: Math.ceil(w / GRID) * GRID, h: Math.ceil(h / GRID) * GRID };
}

// 움직인 박스(movedIds)가 다른 박스와 겹치는지 검사. 원래 있던 박스가 우선.
// 함께 움직인 박스끼리는 이번 동작으로 새로 겹치게 된 경우만 본다 (VPC 경계선 박스가 서로 다른 경계를 따라 움직인 경우 등).
function findOverlap(before, actedId, movedIds) {
  const moved = new Set(movedIds);
  const prev = new Map(before.nodes.map(n => [n.id, n]));
  const newlyOverlap = (m, n) => {
    if (!rectsOverlap(rectOf(m), rectOf(n))) return false;
    if (!moved.has(n.id)) return true;
    const pm = prev.get(m.id), pn = prev.get(n.id);
    return !(pm && pn && rectsOverlap(rectOf(pm), rectOf(pn)));
  };
  for (const m of state.nodes) {
    if (!moved.has(m.id)) continue;
    const hit = state.nodes.find(n => n !== m && newlyOverlap(m, n));
    if (!hit) continue;
    const other = SVC_MAP[hit.type].name;
    return m.id === actedId
      ? `${other} 박스와 겹쳐요. 빈 곳에 놓아주세요.`
      : `그렇게 하면 ${SVC_MAP[m.type].name} 박스가 ${other} 박스와 겹쳐요. 빈 곳으로 옮겨주세요.`;
  }
  return null;
}

// 같은 단계 영역(VPC끼리, AZ끼리, 서브넷끼리)이 일부라도 겹치는지 검사.
// 이번 동작으로 새로 생기거나 위치·크기가 바뀐 영역만 대상으로 한다.
const RANK_NAME = ['VPC', 'AZ(가용 영역)', '서브넷', 'Auto Scaling 그룹'];
function findAreaOverlap(before) {
  const prev = new Map(before.containers.map(c => [c.id, c]));
  const changed = new Set(state.containers.filter(c => {
    const p = prev.get(c.id);
    return !p || p.x !== c.x || p.y !== c.y || p.width !== c.width || p.height !== c.height;
  }).map(c => c.id));
  for (const c of state.containers) {
    if (!changed.has(c.id)) continue;
    const rank = AREA_MAP[c.type].rank;
    const hit = state.containers.find(k => k !== c && !changed.has(k.id) &&
      AREA_MAP[k.type].rank === rank && rectsOverlap(rectOf(c), rectOf(k)));
    if (hit) return `${RANK_NAME[rank]}끼리는 겹칠 수 없어요. 겹치지 않는 곳에 놓아주세요.`;
  }
  return null;
}

// 동작 마무리: 소속 재계산 → 규칙 위반이나 겹침이면 원래 상태로 되돌림
// movedIds: 이번 동작으로 위치가 바뀐 서비스 박스 id 목록 (겹침 검사 대상)
function commit(before, actedId, movedIds = []) {
  recomputeParents();
  const violation = findViolation(actedId) || findAreaOverlap(before) || findOverlap(before, actedId, movedIds);
  if (violation) {
    restoreSnapshot(before);
    render();
    showToast(violation, 'warn');
    return false;
  }
  render();
  return true;
}

