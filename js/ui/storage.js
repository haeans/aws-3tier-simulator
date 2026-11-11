// @ts-check
// js/ui/storage.js — UI-14 저장·불러오기(브라우저 localStorage)·화면 설정·실행 취소 (R5에서 render.js에서 옮김)

// ----- 저장 / 불러오기 (브라우저 localStorage) -----
const STORAGE_KEY = 'aws-3tier-simulator:v1';
const SAVE_VERSION = 1;   // 저장 형식 번호 (형식을 바꿀 때만 올리고 migrateSaved에 고치는 단계를 더한다)
let lastSaved = null;
let savedScroll = null;   // 불러온 스크롤 위치 (시작 시 한 번 적용)
let removedAsgBoxes = 0;  // 불러올 때 지운 예전 Auto Scaling 박스 수 (시작 시 안내)

function saveState() {
  const scroll = { x: $wrap.scrollLeft, y: $wrap.scrollTop };   // 보고 있던 캔버스 시점
  const data = JSON.stringify({ version: SAVE_VERSION, idSeq, zoom, scroll, state });
  if (data === lastSaved) return;
  try {
    localStorage.setItem(STORAGE_KEY, data);
    lastSaved = data;
  } catch (e) { /* 저장소를 쓸 수 없는 환경이면 저장 생략 */ }
}

// 화면 설정 (결과 패널 접힘·높이, 설명 패널 접힘). 배치와 따로 저장하고 되돌리기 기록에는 넣지 않는다.
const UI_PREFS_KEY = 'aws-3tier-simulator:ui';
const uiPrefs = { resultFolded: false, resultHeight: 0, infoFolded: false };   // resultHeight 0 = 내용만큼(기본)

function saveUiPrefs() {
  try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs)); } catch (e) { /* 저장소를 쓸 수 없으면 생략 */ }
}

function loadUiPrefs() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(UI_PREFS_KEY)); } catch (e) { /* 없으면 기본값 */ }
  if (!data) return;
  uiPrefs.resultFolded = data.resultFolded === true;
  uiPrefs.resultHeight = Number(data.resultHeight) > 0 ? Number(data.resultHeight) : 0;
  uiPrefs.infoFolded = data.infoFolded === true;
}

// 예전 저장 형식을 지금 형식으로 고친다 (R5: 형식 고치기는 모두 여기에 모은다)
// version: 저장할 때 적은 형식 번호 (없으면 1). 저장 형식을 바꾸면 SAVE_VERSION을 올리고 여기에 단계를 더한다
// 돌려주는 값: { nodes, containers, edges, removedAsgBoxes }
function migrateSaved(s, version) {
  const list = v => (Array.isArray(v) ? v : []);
  let removed = 0;
  if (version <= 1) {
    // v1.12부터 Auto Scaling은 박스가 아니라 그룹 영역이다. 예전 박스는 지우고 시작할 때 안내한다.
    removed = list(s.nodes).filter(n => n && n.type === 'autoscaling').length;
  }
  // 알 수 없는 항목은 버린다 (없어진 서비스·영역, 양 끝이 없는 연결선)
  const nodes = list(s.nodes).filter(n => n && SVC_MAP[n.type]);
  const containers = list(s.containers).filter(c => c && AREA_MAP[c.type]);
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = list(s.edges).filter(ed => ed && nodeIds.has(ed.from) && nodeIds.has(ed.to));
  return { nodes, containers, edges, removedAsgBoxes: removed };
}

// 저장된 배치를 불러온다. 알 수 없는 항목은 버리고, 불러온 항목 수를 돌려준다.
function loadSaved() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return 0; }
  if (!data || !data.state) return 0;
  const version = Number(data.version) || 1;
  const { nodes, containers, edges, removedAsgBoxes: removed } = migrateSaved(data.state, version);
  removedAsgBoxes = removed;
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


// ----- 실행 취소 / 다시 실행 -----
// render()가 끝날 때마다 캔버스 상태를 기록한다. 바뀌었으면 바뀌기 전 상태를 되돌리기 목록에 쌓는다.
// (규칙 위반으로 되돌려진 동작은 상태가 같으므로 쌓이지 않는다)
// 기록은 이 창을 열어 둔 동안만 유지된다. 새로고침하면 처음부터 다시 기록한다.
const HISTORY_LIMIT = 50;
const undoStack = [];
const redoStack = [];
let historyLast = null;   // 마지막으로 기록한 상태 (JSON 문자열)
let pointerHeld = false;  // 마우스를 누르고 있는 동안(드래그 중)은 되돌리지 않음

const stateJSON = () => JSON.stringify({ nodes: state.nodes, containers: state.containers, edges: state.edges });

function recordHistory() {
  const cur = stateJSON();
  if (historyLast !== null && cur !== historyLast) {
    undoStack.push(historyLast);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;   // 새 동작을 하면 "다시 실행" 목록은 비운다
  }
  historyLast = cur;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  /** @type {HTMLButtonElement} */ (document.getElementById('btn-undo')).disabled = !undoStack.length;
  /** @type {HTMLButtonElement} */ (document.getElementById('btn-redo')).disabled = !redoStack.length;
}

// from 목록에서 상태 하나를 꺼내 적용하고, 지금 상태는 to 목록에 넣는다
function stepHistory(from, to, emptyMsg) {
  if (pointerHeld) return;
  if (!from.length) { showToast(emptyMsg); return; }
  to.push(historyLast);
  historyLast = from.pop();
  const s = JSON.parse(historyLast);
  state.nodes = s.nodes;
  state.containers = s.containers;
  state.edges = s.edges;
  selectedId = null;
  cancelPendingConnect();
  render();   // historyLast와 같으므로 새로 쌓이지 않음
}

const undo = () => stepHistory(undoStack, redoStack, '더 되돌릴 작업이 없어요.');
const redo = () => stepHistory(redoStack, undoStack, '다시 실행할 작업이 없어요.');
