// @ts-check
// js/main.js — UI-9 기본 틀·이벤트 바인딩·시작 (가장 마지막에 불러와야 함)

/* ---------------------------------------------------------
   UI-9. 기본 틀·이벤트 바인딩·시작
   --------------------------------------------------------- */

// ----- 기본 틀 (VPC 1개 + AZ 2개 + AZ별 퍼블릭/프라이빗/DB 서브넷) -----
function loadTemplate() {
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
  make('vpc', 280, 80, 1000, 660);
  [{ letter: 'A', x: 320 }, { letter: 'B', x: 800 }].forEach(({ letter, x }) => {
    make('az', x, 140, 440, 560, '가용 영역 ' + letter);
    make('public',  x + 20, 200, 400, 140);
    make('private', x + 20, 360, 400, 140);
    make('db',      x + 20, 520, 400, 140);
  });
  recomputeParents();
  render();
  $wrap.scrollTo(0, 0);
  showToast('기본 틀을 만들었어요. 사용자는 VPC 왼쪽 바깥에 놓아보세요.');
}

// ----- 이벤트 바인딩 -----
// 빈 캔버스 클릭 → 선택 해제 / 연결 대기 취소
$world.addEventListener('pointerdown', e => {
  cancelPendingConnect();
  if (e.shiftKey && e.button === 0 && !connectMode) { startMarquee(e); return; }   // Shift+드래그: 범위 선택
  select(null);
});

// 연결선 위가 아니면 강조 해제 (선이 다시 그려져 pointerleave를 놓친 경우 대비)
$world.addEventListener('pointermove', e => {
  if (hoverEdgeId && !/** @type {Element} */ (e.target).closest('.edge-hit, .edge-handle')) setHoverEdge(null);
});

// 연결 대기 중이면 포인터까지 점선 표시
$world.addEventListener('pointermove', e => {
  if (!connectMode || !connectFrom) return;
  const from = findNode(connectFrom);
  if (!from) return;
  const c = connectFromSide ? anchorPoint(from, connectFromSide) : centerOf(from);
  const p = clientToWorld(e.clientX, e.clientY);
  $tempEdge.setAttribute('x1', String(c.x));
  $tempEdge.setAttribute('y1', String(c.y));
  $tempEdge.setAttribute('x2', String(p.x));
  $tempEdge.setAttribute('y2', String(p.y));
  $tempEdge.setAttribute('visibility', 'visible');
});

// Delete / Backspace → 선택 항목 삭제, Esc → 연결 대기 취소 → 연결 모드 끄기 → 선택 해제
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
    else if (connectMode) setConnectMode(false);
    else select(null);
  }
});

$btnConnect.addEventListener('click', () => setConnectMode(!connectMode));
document.getElementById('btn-template').addEventListener('click', loadTemplate);
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
