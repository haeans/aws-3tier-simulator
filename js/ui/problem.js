// @ts-check
// js/ui/problem.js — UI-17 학습 패널 [문제] 탭: 면접식 설계 문제 목록·[제출] 채점·모범 답안 (43번)
// 문제 데이터는 js/data/problems.js, 채점은 js/rules/problems.js(gradeProblem). 패널 틀은 js/ui/learn.js

// 진행 상태: current = 풀고 있는 문제 key, passed = 통과한 문제 key 목록. 배치와 따로 저장한다
const PROBLEM_KEY = 'aws-3tier-simulator:problems';
const problemProgress = { current: null, passed: [] };
let problemListOpen = false;   // 푸는 중에 [문제 목록]을 눌러 목록을 보고 있는지
let problemResult = null;      // 마지막 [제출] 결과 { key, sig(제출할 때 구성), grade }. 구성이 바뀌면 지난 결과로 본다
let problemAnswerShown = null; // 모범 답안을 불러온 문제 key (설계 이유를 보여 줌. 문제를 바꾸면 지움)

function saveProblemProgress() {
  try { localStorage.setItem(PROBLEM_KEY, JSON.stringify(problemProgress)); } catch (e) { /* 저장소를 쓸 수 없으면 생략 */ }
}
function loadProblemProgress() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(PROBLEM_KEY)); } catch (e) { /* 없으면 처음부터 */ }
  if (!data) return;
  const known = k => PROBLEMS.some(p => p.key === k);
  problemProgress.current = known(data.current) ? data.current : null;
  problemProgress.passed = (Array.isArray(data.passed) ? data.passed : []).filter(known);
}

// 문제 시작. fresh: 기본 틀을 새로 만든다 (목록의 [시작]·[처음부터]). false면 지금 캔버스를 이어 쓴다 ([이어 하기])
function startProblem(key, fresh) {
  const p = PROBLEMS.find(x => x.key === key);
  if (!p) return;
  if (fresh && !loadTemplate()) return;   // 지울지 묻는 창에서 취소
  problemProgress.current = key;
  problemListOpen = false;
  problemResult = null;
  problemAnswerShown = null;
  saveProblemProgress();
  uiPrefs.learnOpen = true;
  uiPrefs.learnTab = 'problem';
  saveUiPrefs();
  render();
  if (fresh) {
    fitView(TEMPLATE_USER_GAP);   // 사용자를 놓을 VPC 왼쪽 빈 곳까지 보이게
    showToast(`문제 ${PROBLEMS.indexOf(p) + 1} "${p.title}"을 시작해요. 오른쪽 요구 사항을 보고 직접 설계한 뒤 [제출]하세요.`);
  }
}

// [제출]: 지금 캔버스를 채점한다. 모두 충족하면 통과로 기록
function submitProblem() {
  const p = PROBLEMS.find(x => x.key === problemProgress.current);
  if (!p) return;
  const grade = gradeProblem(p);
  problemResult = { key: p.key, sig: stateSig(), grade };
  if (grade.done && !problemProgress.passed.includes(p.key)) {
    problemProgress.passed.push(p.key);
    saveProblemProgress();
  }
  showToast(grade.done ? `문제 ${PROBLEMS.indexOf(p) + 1} "${p.title}" 통과! 모범 답안과도 비교해 보세요.`
    : `요구 사항 ${grade.doneCount}/${grade.reqs.length}개를 채웠어요. 못 채운 요구를 확인해 보세요.`, grade.done ? undefined : 'warn');
  renderLearn();
}

// [모범 답안 불러오기]: 내 설계를 지우고 모범 답안을 놓는다. 되돌리기 한 번으로 내 설계로 돌아온다
function loadProblemAnswer() {
  const p = PROBLEMS.find(x => x.key === problemProgress.current);
  if (!p) return;
  if (state.nodes.length + state.containers.length > 0 &&
      !confirm('모범 답안을 불러오면 지금 설계가 캔버스에서 지워져요. [↶ 되돌리기]를 누르면 내 설계로 돌아올 수 있어요. 불러올까요?')) return;
  // 기본 틀 → 모범 답안 두 단계가 되돌리기 기록에 남으므로, 사이의 "빈 기본 틀"은 기록에서 뺀다 (되돌리기 한 번 = 내 설계)
  const n = undoStack.length;
  state.nodes = []; state.edges = []; state.containers = [];   // 비워 두면 기본 틀이 다시 묻지 않는다 (render 전이라 기록에는 안 남음)
  if (!loadSpec(p.answer, '모범 답안을 불러왔어요. [↶ 되돌리기]를 누르면 내 설계로 돌아가요.')) return;
  if (undoStack.length === n + 2) undoStack.splice(n + 1, 1);
  problemAnswerShown = p.key;
  render();
}

// [문제] 탭 내용. box: 학습 패널 몸통 (맨 위에 한 줄 요약 .learn-msg)
function renderProblemPanel(box) {
  const cur = PROBLEMS.find(p => p.key === problemProgress.current);
  const msg = document.createElement('div');
  msg.className = 'learn-msg';
  box.appendChild(msg);
  const panel = document.createElement('div');
  panel.className = 'mission-panel problem-panel';
  box.appendChild(panel);
  if (!cur || problemListOpen) { renderProblemList(panel, msg); return; }

  const idx = PROBLEMS.indexOf(cur);
  const passed = problemProgress.passed.includes(cur.key);
  // 지난 제출 결과는 이 문제이고 그 뒤로 구성이 그대로일 때만 보여 준다
  const res = problemResult && problemResult.key === cur.key ? problemResult : null;
  const fresh = res && res.sig === stateSig();
  msg.textContent = `문제 ${idx + 1}/${PROBLEMS.length} · ${cur.title} (${PROBLEM_LEVELS[cur.level]}${passed ? ' · 통과' : ''})`;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const title = el('div', 'mission-title');
  title.appendChild(el('b', '', `문제 ${idx + 1}. ${cur.title}`));
  title.appendChild(el('span', '', cur.story));
  panel.appendChild(title);

  // 요구 사항: 제출 전에는 번호만, 제출 뒤(구성 그대로)에는 ✓/✗
  panel.appendChild(el('div', 'problem-sub', '요구 사항'));
  const list = el('ul', 'mission-goals problem-reqs');
  const texts = [PROBLEM_BASE_REQ.text, ...cur.reqs.map(r => r.text)];
  texts.forEach((t, i) => {
    const r = fresh ? res.grade.reqs[i] : null;
    const li = el('li', r ? (r.done ? 'done' : 'fail') : '');
    li.appendChild(el('i', '', r ? (r.done ? '✓' : '✗') : String(i + 1)));
    li.appendChild(el('span', '', t));
    list.appendChild(li);
  });
  panel.appendChild(list);

  if (problemAnswerShown === cur.key) panel.appendChild(el('div', 'problem-answer', `모범 답안: ${cur.answerNote}`));
  // 버튼은 요구 사항 바로 아래 (채점 결과가 길어져도 패널을 내리지 않고 누를 수 있게)
  const ctl = el('div', 'mission-ctl');
  const button = (id, text, primary, onClick, tip) => {
    const b = el('button', 'btn' + (primary ? ' primary' : ''), text);
    b.id = id;
    if (tip) b.title = tip;
    b.addEventListener('click', onClick);
    ctl.appendChild(b);
  };
  button('problem-submit', '제출', true, submitProblem, '지금 캔버스의 설계를 요구 사항과 비교해 채점해요');
  // 모범 답안은 한 번이라도 제출해 본 뒤에 연다 (먼저 스스로 설계해 보도록)
  if (res || passed) button('problem-answer', '모범 답안 불러오기', false, loadProblemAnswer, '캔버스를 모범 답안으로 바꿔요. [↶ 되돌리기]로 내 설계로 돌아와요');
  button('problem-list', '문제 목록', false, () => { problemListOpen = true; renderLearn(); });
  panel.appendChild(ctl);

  if (res && !fresh) panel.appendChild(el('div', 'problem-note', '구성이 바뀌었어요. 다시 [제출]하면 새로 채점해요.'));
  if (fresh) {
    const g = res.grade;
    panel.appendChild(el('div', g.done ? 'mission-done' : 'problem-score',
      g.done ? '✓ 통과! 모든 요구 사항을 채웠어요. 모범 답안과 비교해 다르게 한 점이 있는지 살펴보세요.'
        : `요구 사항 ${g.doneCount}/${g.reqs.length}개 충족. 아래는 모범 답안에는 있는데 내 설계에는 없는 것이에요.`));
    g.reqs.forEach((r, i) => {
      if (r.done) return;
      const block = el('div', 'problem-miss');
      block.appendChild(el('b', '', `✗ ${texts[i]}`));
      if (i === 0) block.appendChild(el('div', 'problem-miss-sub', '남은 오류·경고 ([검증하기]로 박스에서 확인)'));
      const ul = el('ul');
      r.missing.forEach(m => {
        const li = el('li');
        li.appendChild(el('b', '', m.name));
        li.appendChild(el('span', '', m.why));
        ul.appendChild(li);
      });
      block.appendChild(ul);
      panel.appendChild(block);
    });
  }

}

// 문제 목록: 난이도·통과 표시와 [시작] / [이어 하기]
function renderProblemList(panel, msg) {
  const passedCount = PROBLEMS.filter(p => problemProgress.passed.includes(p.key)).length;
  msg.textContent = `면접식 설계 문제 (통과 ${passedCount}/${PROBLEMS.length})`;
  const intro = document.createElement('div');
  intro.className = 'mission-title';
  intro.innerHTML = '<b>면접식 설계 문제</b><span>실제 면접처럼 상황과 요구 사항만 보고 직접 설계해 보세요. 힌트는 없어요. 다 만들면 [제출]로 채점하고, 모범 답안과 비교해요.</span>';
  panel.appendChild(intro);
  const list = document.createElement('ol');
  list.className = 'mission-list';
  PROBLEMS.forEach((p, i) => {
    const done = problemProgress.passed.includes(p.key), isCur = p.key === problemProgress.current;
    const li = document.createElement('li');
    li.className = (done ? 'done' : '') + (isCur ? ' current' : '');
    li.innerHTML = `<i>${done ? '✓' : i + 1}</i><b></b><em></em><span></span>`;
    li.querySelector('b').textContent = p.title;
    li.querySelector('em').textContent = PROBLEM_LEVELS[p.level];
    li.querySelector('em').className = 'problem-level ' + p.level;
    li.querySelector('span').textContent = p.story;
    const add = (text, fresh, title) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = text;
      b.title = title;
      b.setAttribute('data-key', p.key);
      b.setAttribute('data-fresh', fresh ? '1' : '0');
      b.addEventListener('click', () => startProblem(p.key, fresh));
      li.appendChild(b);
    };
    if (isCur) add('이어 하기', false, '지금 캔버스 그대로 이 문제를 이어서 풀어요');
    add(done || isCur ? '처음부터' : '시작', true, '빈 기본 틀에서 이 문제를 시작해요 (캔버스의 기존 내용은 지워져요)');
    list.appendChild(li);
  });
  panel.appendChild(list);
}
