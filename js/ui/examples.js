// @ts-check
// js/ui/examples.js — UI-13 [불러오기 ▾] 메뉴·예시 구성

/* ---------------------------------------------------------
   UI-13. [불러오기 ▾] 메뉴: 기본 틀 / 예시 구성 (데이터: js/data/examples.js)
   예시는 기본 틀(캔버스 한가운데)을 만든 뒤 그 VPC 위치를 기준으로 박스·연결을 놓는다.
   --------------------------------------------------------- */
const $btnLoad = document.getElementById('btn-load');
const $loadMenu = document.getElementById('load-menu');
const $fileOpen = /** @type {HTMLInputElement} */ (document.getElementById('file-open'));

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
  loadSpec(key === 'fix' ? exampleFixSpec(picks) : EXAMPLE_SPECS[key], ex.toast);
}

// 기본 3-Tier에 실수를 넣은 구성 데이터. picks: 넣을 실수 key 목록 (없으면 랜덤 2개). 고치기 미션도 함께 쓴다
function exampleFixSpec(picks) {
  const chosen = picks || pickRandom(EXAMPLE_MISTAKES.map(m => m.key), EXAMPLE_MISTAKE_COUNT);
  const ms = EXAMPLE_MISTAKES.filter(m => chosen.includes(m.key));
  const nodes = EXAMPLE_BASIC.nodes.map(([k, t, x, y]) => {
    const mv = ms.find(m => m.move && m.move[k]);
    return mv ? [k, t, ...mv.move[k]] : [k, t, x, y];
  });
  return { nodes, edges: [...EXAMPLE_BASIC.edges, ...ms.flatMap(m => m.edges || [])] };
}

// 구성 데이터(js/data/examples.js의 형식: nodes·edges·asg)를 기본 틀 위에 놓는다. 놓았으면 true
// 예시와 미션 시작 구성(js/ui/mission.js)이 함께 쓴다
function loadSpec(spec, toast) {
  const { nodes, edges } = spec;
  const o = loadTemplate();
  if (!o) return false;   // 기존 내용을 지울지 묻는 창에서 취소
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
  if (!commit(before, null)) return false;   // 예시가 배치 규칙에 어긋나면 기본 틀만 남김 (테스트가 막아 둠)
  fitView();
  showToast(toast);
  return true;
}

// 캔버스의 모든 박스·영역이 한 화면에 들어오도록 줌(단계 중 가장 큰 것, 최소 60%)을 맞추고 가운데로 이동
// extraLeft: 왼쪽에 더 보여 줄 여백 (미션 1: 사용자를 놓을 VPC 왼쪽 빈 곳)
function fitView(extraLeft = 0) {
  const items = [...state.containers, ...state.nodes].map(rectOf);
  if (!items.length) return;
  const M = 40;   // 둘레 여백
  const x1 = Math.min(...items.map(r => r.x)) - M - extraLeft, y1 = Math.min(...items.map(r => r.y)) - M;
  const x2 = Math.max(...items.map(r => r.x + r.w)) + M, y2 = Math.max(...items.map(r => r.y + r.h)) + M;
  const fit = Math.min($wrap.clientWidth / (x2 - x1), $wrap.clientHeight / (y2 - y1));
  setZoom([...ZOOM_STEPS].reverse().find(s => s <= Math.min(fit, 1)) || ZOOM_STEPS[0]);
  $wrap.scrollTo((x1 + x2) / 2 * zoom - $wrap.clientWidth / 2, (y1 + y2) / 2 * zoom - $wrap.clientHeight / 2);
}

// ----- 메뉴 -----
function buildLoadMenu() {
  $loadMenu.innerHTML = EXAMPLES.map((ex, i) =>
    `<button class="load-item" data-key="${ex.key}"${ex.key === 'template' ? ' id="btn-template"' : ''}>` +
    `<b>${ex.name}</b><span>${ex.desc}</span></button>` + (i === 0 ? '<div class="load-sep"></div>' : '')).join('') +
    // 39번: 파일에서 열기 (맨 아래)
    '<div class="load-sep"></div><button class="load-item" id="btn-file-open"><b>파일에서 열기…</b>' +
    '<span>[파일로 저장]한 구성 파일(.json)을 열어요</span></button>';
  $loadMenu.querySelectorAll('.load-item[data-key]').forEach(b => b.addEventListener('click', () => {
    setLoadMenu(false);
    loadExample(b.getAttribute('data-key'));
  }));
  document.getElementById('btn-file-open').addEventListener('click', () => {
    setLoadMenu(false);
    $fileOpen.value = '';   // 같은 파일을 다시 골라도 열리게
    $fileOpen.click();
  });
}
// 파일을 고르면 읽어서 연다 (js/ui/storage.js의 importData)
$fileOpen.addEventListener('change', () => {
  const file = $fileOpen.files && $fileOpen.files[0];
  if (!file) return;
  file.text().then(importData, () => showToast('파일을 읽지 못했어요.', 'warn'));
});
document.getElementById('btn-file-save').addEventListener('click', () => saveToFile());
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

// ----- 기본 틀 (VPC 1개 + AZ 2개 + AZ별 퍼블릭/프라이빗/DB 서브넷) -----
const TEMPLATE_VPC = { w: 1000, h: 660 };   // 기본 틀 VPC 크기
const TEMPLATE_USER_GAP = 200;              // VPC 왼쪽에 사용자 박스를 놓을 자리

// origin: VPC 왼쪽 위 위치. 없으면 캔버스 한가운데 (사방에 여백이 있어 배치하기 편함)
// 만든 VPC 왼쪽 위 위치를 돌려준다 (예시 구성이 이 위치 기준으로 놓임). 묻는 창에서 취소하면 null
function loadTemplate(origin) {
  const hasContent = state.nodes.length + state.containers.length > 0;
  if (hasContent && !confirm('캔버스의 기존 내용을 모두 지우고 기본 틀을 만들까요?')) return null;

  state.nodes = [];
  state.edges = [];
  state.containers = [];
  selectedId = null;
  cancelPendingConnect();

  const make =(type, x, y, width, height, label) => state.containers.push({
    id: newId('c'), type, x, y, width, height, parentContainer: null,
    label: label || AREA_MAP[type].name,
  });
  const o = origin || {
    x: snap((($world.offsetWidth - TEMPLATE_VPC.w) + TEMPLATE_USER_GAP) / 2),
    y: snap(($world.offsetHeight - TEMPLATE_VPC.h) / 2),
  };
  make('vpc', o.x, o.y, TEMPLATE_VPC.w, TEMPLATE_VPC.h);
  [{ letter: 'A', x: o.x + 40 }, { letter: 'B', x: o.x + 520 }].forEach(({ letter, x }) => {
    make('az', x, o.y + 60, 440, 560, '가용 영역 ' + letter);
    make('public',  x + 20, o.y + 120, 400, 140);
    make('private', x + 20, o.y + 280, 400, 140);
    make('db',      x + 20, o.y + 440, 400, 140);
  });
  recomputeParents();
  render();
  // 사용자 자리까지 포함한 기본 틀의 가운데가 화면 가운데에 오도록 이동
  const cx = o.x - TEMPLATE_USER_GAP / 2 + TEMPLATE_VPC.w / 2, cy = o.y + TEMPLATE_VPC.h / 2;
  $wrap.scrollTo(cx * zoom - $wrap.clientWidth / 2, cy * zoom - $wrap.clientHeight / 2);
  showToast('기본 틀을 만들었어요. 사용자는 VPC 왼쪽 바깥에 놓아보세요.');
  return o;
}
