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

// 화면 설정 (결과 패널 접힘·높이, 설명 패널 접힘, 학습 패널). 배치와 따로 저장하고 되돌리기 기록에는 넣지 않는다.
const UI_PREFS_KEY = 'aws-3tier-simulator:ui';
// learnOpen·learnTab: 오른쪽 학습 패널을 열었는지, 고른 탭 'mission' | 'problem' (43번)
const uiPrefs = { resultFolded: false, resultHeight: 0, infoFolded: false, learnOpen: false, learnTab: 'mission' };   // resultHeight 0 = 내용만큼(기본)

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
  uiPrefs.learnOpen = data.learnOpen === true;
  uiPrefs.learnTab = data.learnTab === 'problem' ? 'problem' : 'mission';
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

// ----- 파일로 저장 / 파일에서 열기 (39번) -----
// 브라우저 저장소는 한 칸뿐이라, 구성을 파일로 내려받아 보관·공유하고 다시 열 수 있게 한다.
// 파일 내용: { app, version(저장 형식 번호), savedAt, state: { nodes, containers, edges } }
// 화면 시점(줌·스크롤)은 넣지 않는다. 열 때 구성이 한 화면에 들어오도록 맞춘다(fitView).
const FILE_APP = 'aws-3tier-simulator';   // 이 도구에서 저장한 파일인지 알아보는 표시

function exportData() {
  return JSON.stringify({ app: FILE_APP, version: SAVE_VERSION, savedAt: new Date().toISOString(),
    state: { nodes: state.nodes, containers: state.containers, edges: state.edges } }, null, 2);
}

// 파일 이름: aws-3tier-20261112-1530.json (저장한 날짜·시각)
function exportFileName(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `aws-3tier-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

function saveToFile() {
  if (!state.nodes.length && !state.containers.length) { showToast('저장할 내용이 없어요. 캔버스에 먼저 배치해 보세요.'); return; }
  const url = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`"${a.download}" 파일로 저장했어요. 브라우저의 내려받기 폴더를 확인해 보세요.`);
}

// 파일 내용(글자)을 캔버스에 연다. 열었으면 true.
// 파일은 사람이 고쳤을 수 있으므로 숫자·글자를 확인하고, 알 수 없는 항목은 버린다 (저장소에서 불러올 때와 같은 migrateSaved)
function importData(text) {
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* 아래에서 안내 */ }
  if (!data || data.app !== FILE_APP || !data.state) {
    showToast('이 도구에서 [파일로 저장]한 파일이 아니라서 열 수 없어요.', 'warn');
    return false;
  }
  const num = v => typeof v === 'number' && isFinite(v);
  const raw = data.state;
  const total = ['nodes', 'containers', 'edges'].reduce((n, k) => n + (Array.isArray(raw[k]) ? raw[k].length : 0), 0);
  const m = migrateSaved(raw, Number(data.version) || 1);
  const seenIds = new Set();
  const fresh = i => typeof i.id === 'string' && !seenIds.has(i.id) && !!seenIds.add(i.id);   // id가 글자이고 겹치지 않는 것만
  const nodes = m.nodes.filter(n => fresh(n) && num(n.x) && num(n.y));
  const containers = m.containers.filter(c => fresh(c) && num(c.x) && num(c.y) && num(c.width) && num(c.height) && c.width > 0 && c.height > 0);
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = m.edges.filter(ed => fresh(ed) && nodeIds.has(ed.from) && nodeIds.has(ed.to) && ed.from !== ed.to);
  containers.forEach(c => { c.label = String(c.label || AREA_MAP[c.type].name).slice(0, 40); });
  if (!nodes.length && !containers.length) {
    showToast('파일에 열 수 있는 박스나 영역이 없어요.', 'warn');
    return false;
  }
  const hasContent = state.nodes.length + state.containers.length > 0;
  if (hasContent && !confirm('캔버스의 기존 내용을 모두 지우고 파일의 구성을 열까요?')) return false;

  state.nodes = nodes;
  state.containers = containers;
  state.edges = edges;
  // 새 id가 파일의 id와 겹치지 않도록 번호 이어가기
  const maxId = Math.max(0, ...[...nodes, ...containers, ...edges].map(i => parseInt(i.id.slice(1), 10) || 0));
  idSeq = Math.max(idSeq, maxId + 1);
  selectedId = null;
  cancelPendingConnect();
  recomputeParents();
  render();
  fitView();
  const dropped = total - nodes.length - containers.length - edges.length;
  showToast(`파일을 열었어요 (박스 ${nodes.length}개, 영역 ${containers.length}개, 연결 ${edges.length}개).` +
    (dropped > 0 ? ` 알 수 없는 항목 ${dropped}개는 뺐어요.` : '') + ' 잘못 열었으면 [되돌리기]를 누르세요.');
  return true;
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
