// @ts-check
// js/main.js — UI-9 기본 틀·이벤트 바인딩·시작 (가장 마지막에 불러와야 함)

/* ---------------------------------------------------------
   UI-9. 기본 틀·이벤트 바인딩·시작
   --------------------------------------------------------- */

// ----- 기본 틀 (VPC 1개 + AZ 2개 + AZ별 퍼블릭/프라이빗/DB 서브넷) -----
const TEMPLATE_VPC = { w: 1000, h: 660 };   // 기본 틀 VPC 크기
const TEMPLATE_USER_GAP = 200;              // VPC 왼쪽에 사용자 박스를 놓을 자리

// origin: VPC 왼쪽 위 위치. 없으면 캔버스 한가운데 (사방에 여백이 있어 배치하기 편함)
function loadTemplate(origin) {
  const hasContent = state.nodes.length + state.containers.length > 0;
  if (hasContent && !confirm('캔버스의 기존 내용을 모두 지우고 기본 틀을 만들까요?')) return;

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
}

// ----- 이벤트 바인딩 -----
// 빈 캔버스 클릭 → 선택 해제. 흰 배경(영역 밖)을 끌면 화면 이동
$world.addEventListener('pointerdown', e => {
  if (e.shiftKey && e.button === 0) { startMarquee(e); return; }   // Shift+드래그: 범위 선택
  select(null);
  if (e.button === 0 && e.target === $world) startPan(e);
});
// 줌을 줄여 캔버스 바깥 여백이 보일 때도 그 여백을 끌면 화면 이동
$wrap.addEventListener('pointerdown', e => {
  if (e.button === 0 && (e.target === $wrap || e.target === $sizer)) { select(null); startPan(e); }
});
// 스페이스바를 누른 채 끌면 박스·영역 위에서도 화면 이동 (다른 동작보다 먼저 가로챔)
$wrap.addEventListener('pointerdown', e => {
  if (!spaceHeld || e.button !== 0) return;
  e.stopPropagation();
  startPan(e);
}, true);
const isTyping = t => /** @type {Element} */ (t).closest('input, textarea, select');
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || isTyping(e.target)) return;
  e.preventDefault();   // 페이지 스크롤·눌려 있던 버튼이 다시 눌리는 것 막기
  if (!spaceHeld) { spaceHeld = true; document.body.classList.add('space-pan'); hideTooltip(); }
});
document.addEventListener('keyup', e => {
  if (e.code !== 'Space') return;
  if (!isTyping(e.target)) e.preventDefault();
  spaceHeld = false;
  document.body.classList.remove('space-pan');
});
window.addEventListener('blur', () => { spaceHeld = false; document.body.classList.remove('space-pan'); });

// 연결선 위가 아니면 강조 해제 (선이 다시 그려져 pointerleave를 놓친 경우 대비)
$world.addEventListener('pointermove', e => {
  if (hoverEdgeId && !/** @type {Element} */ (e.target).closest('.edge-hit, .edge-handle')) setHoverEdge(null);
});

// Delete / Backspace → 선택 항목 삭제, Esc → 끌던 연결 취소 → 선택 해제
document.addEventListener('keydown', e => {
  if (/** @type {Element} */ (e.target).closest('input, textarea')) return;
  // Ctrl+Z → 되돌리기, Ctrl+Y / Ctrl+Shift+Z → 다시 실행 (한글 입력 상태에서도 되도록 키 위치로 판단)
  if (e.ctrlKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {
    e.preventDefault();
    if (e.code === 'KeyY' || e.shiftKey) redo(); else undo();
    return;
  }
  if (simFaultMode && resultTab === 'sim') {   // 장애 넣기 중: 지우기·되돌리기 대신 Esc로 모드 끄기만
    if (e.key === 'Escape') setSimFaultMode(false);
    else if (e.key === 'Delete' || e.key === 'Backspace') showToast('장애 넣기 중에는 지울 수 없어요. Esc로 장애 넣기를 끈 뒤 지워주세요.', 'warn');
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
    e.preventDefault();
    deleteSelected();
  } else if (e.key === 'Escape') {
    if (connectFrom) cancelPendingConnect();
    else select(null);
  }
});

document.getElementById('btn-template').addEventListener('click', () => loadTemplate());
document.getElementById('btn-validate').addEventListener('click', runValidation);
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
// 마우스를 누르고 있는 동안(드래그 중)에는 되돌리기를 막기 위해 누름 상태를 기록
window.addEventListener('pointerdown', () => { pointerHeld = true; }, true);
['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, () => { pointerHeld = false; }, true));

// 초기화
document.getElementById('btn-reset').addEventListener('click', () => {
  const count = state.nodes.length + state.containers.length;
  if (!count) { showToast('캔버스가 이미 비어 있어요.'); return; }
  if (!confirm('캔버스의 모든 내용을 지울까요?')) return;
  state.nodes = [];
  state.containers = [];
  state.edges = [];
  selectedId = null;
  cancelPendingConnect();
  render();
  showToast('캔버스를 초기화했어요.');
});

// 스크롤하는 동안만 스크롤바 표시 (멈추고 1초 뒤 숨김)
document.querySelectorAll('.autohide-scroll').forEach(el => {
  let timer = null;
  el.addEventListener('scroll', () => {
    el.classList.add('scrolling');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('scrolling'), 1000);
  }, { passive: true });
});

// 결과 패널 위 경계선: 끌면 높이 조절, 두 번 누르면 내용만큼(기본)으로
const $resultGrip = /** @type {HTMLElement} */ (document.querySelector('#result-grip > div'));
$resultGrip.addEventListener('pointerdown', e => { if (e.button === 0) startResultResize(e); });
$resultGrip.addEventListener('dblclick', () => { uiPrefs.resultHeight = 0; saveUiPrefs(); applyResultSize(); });

// 줌: 버튼 / Ctrl+휠
document.getElementById('zoom-in').addEventListener('click', () => stepZoom(1));
document.getElementById('zoom-out').addEventListener('click', () => stepZoom(-1));
$zoomLabel.addEventListener('click', () => setZoom(1));
let wheelAcc = 0;   // 터치패드처럼 작은 휠 값이 연달아 올 때 모아서 한 단계씩
$wrap.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) < 40) return;
  stepZoom(wheelAcc < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
  wheelAcc = 0;
}, { passive: false });

// ----- 시작 -----
buildPalette();
loadUiPrefs();
const restored = loadSaved();
applyZoom();
if (savedScroll) {   // render()가 저장하기 전에 시점부터 복원
  $wrap.scrollLeft = Number(savedScroll.x) || 0;
  $wrap.scrollTop  = Number(savedScroll.y) || 0;
}
render();
// 스크롤(보고 있던 시점)이 바뀌면 잠시 뒤 저장
let scrollSaveTimer = null;
$wrap.addEventListener('scroll', () => {
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(saveState, 300);
});
if (removedAsgBoxes) {
  showToast(`Auto Scaling이 박스에서 그룹 영역으로 바뀌어, 예전 Auto Scaling 박스 ${removedAsgBoxes}개를 지웠어요. ` +
    '왼쪽 [영역]에서 Auto Scaling 그룹을 끌어다 EC2를 감싸 주세요.', 'warn');
} else if (restored) showToast('이전에 작업하던 배치를 불러왔어요.');
