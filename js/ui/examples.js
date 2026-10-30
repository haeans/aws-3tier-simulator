// @ts-check
// js/ui/examples.js — UI-13 [불러오기 ▾] 메뉴·예시 구성

/* ---------------------------------------------------------
   UI-13. [불러오기 ▾] 메뉴: 기본 틀 / 예시 구성 (데이터: js/data/examples.js)
   예시는 기본 틀(캔버스 한가운데)을 만든 뒤 그 VPC 위치를 기준으로 박스·연결을 놓는다.
   --------------------------------------------------------- */
const $btnLoad = document.getElementById('btn-load');
const $loadMenu = document.getElementById('load-menu');

// 목록에서 서로 다른 것 n개를 랜덤으로
function pickRandom(list, n) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

// 예시 구성 불러오기. picks: "고쳐 보세요"에 넣을 실수 key 목록 (없으면 랜덤. 테스트에서 고정할 때 씀)
function loadExample(key, picks) {
  if (key === 'template') { loadTemplate(); return; }
  const ex = EXAMPLES.find(e => e.key === key);
  if (!ex) return;
  const spec = key === 'ha' ? EXAMPLE_HA : EXAMPLE_BASIC;
  let nodes = spec.nodes, edges = spec.edges;
  if (key === 'fix') {
    const chosen = picks || pickRandom(EXAMPLE_MISTAKES.map(m => m.key), EXAMPLE_MISTAKE_COUNT);
    const ms = EXAMPLE_MISTAKES.filter(m => chosen.includes(m.key));
    nodes = nodes.map(([k, t, x, y]) => {
      const mv = ms.find(m => m.move && m.move[k]);
      return mv ? [k, t, ...mv.move[k]] : [k, t, x, y];
    });
    edges = [...edges, ...ms.flatMap(m => m.edges || [])];
  }
  const o = loadTemplate();
  if (!o) return;   // 기존 내용을 지울지 묻는 창에서 취소
  const before = takeSnapshot();
  const ids = {};
  nodes.forEach(([k, type, x, y]) => {
    const pos = fitRect(o.x + x - NODE_W / 2, o.y + y - NODE_H / 2, NODE_W, NODE_H);
    const node = { id: newId('n'), type, x: pos.x, y: pos.y, parentContainer: null };
    state.nodes.push(node);
    snapToVpcEdge(node);
    ids[k] = node.id;
  });
  edges.forEach(([a, b]) => state.edges.push({ id: newId('e'), from: ids[a], to: ids[b], fromSide: null, toSide: null, mid: null }));
  if (spec.asg) {
    state.containers.push({ id: newId('c'), type: 'asg', x: o.x + spec.asg.x, y: o.y + spec.asg.y,
      width: spec.asg.width, height: spec.asg.height, parentContainer: null, label: AREA_MAP.asg.name });
  }
  if (!commit(before, null)) return;   // 예시가 배치 규칙에 어긋나면 기본 틀만 남김 (테스트가 막아 둠)
  fitView();
  showToast(ex.toast);
}

// 캔버스의 모든 박스·영역이 한 화면에 들어오도록 줌(단계 중 가장 큰 것, 최소 60%)을 맞추고 가운데로 이동
function fitView() {
  const items = [...state.containers, ...state.nodes].map(rectOf);
  if (!items.length) return;
  const M = 40;   // 둘레 여백
  const x1 = Math.min(...items.map(r => r.x)) - M, y1 = Math.min(...items.map(r => r.y)) - M;
  const x2 = Math.max(...items.map(r => r.x + r.w)) + M, y2 = Math.max(...items.map(r => r.y + r.h)) + M;
  const fit = Math.min($wrap.clientWidth / (x2 - x1), $wrap.clientHeight / (y2 - y1));
  setZoom([...ZOOM_STEPS].reverse().find(s => s <= Math.min(fit, 1)) || ZOOM_STEPS[0]);
  $wrap.scrollTo((x1 + x2) / 2 * zoom - $wrap.clientWidth / 2, (y1 + y2) / 2 * zoom - $wrap.clientHeight / 2);
}

// ----- 메뉴 -----
function buildLoadMenu() {
  $loadMenu.innerHTML = EXAMPLES.map((ex, i) =>
    `<button class="load-item" data-key="${ex.key}"${ex.key === 'template' ? ' id="btn-template"' : ''}>` +
    `<b>${ex.name}</b><span>${ex.desc}</span></button>` + (i === 0 ? '<div class="load-sep"></div>' : '')).join('');
  $loadMenu.querySelectorAll('.load-item').forEach(b => b.addEventListener('click', () => {
    setLoadMenu(false);
    loadExample(b.getAttribute('data-key'));
  }));
}
function setLoadMenu(open) {
  $loadMenu.hidden = !open;
  $btnLoad.classList.toggle('active', open);
}
$btnLoad.addEventListener('click', () => setLoadMenu($loadMenu.hidden));
// 메뉴 밖을 누르거나 Esc를 누르면 닫음
document.addEventListener('pointerdown', e => {
  if (!$loadMenu.hidden && !/** @type {Element} */ (e.target).closest('.load-wrap')) setLoadMenu(false);
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$loadMenu.hidden) setLoadMenu(false); });
