// @ts-check
// js/ui/mission.js — UI-15 [미션] 탭: 단계별 미션 목록·목표 체크·힌트·진행 저장 (42번)
// 43번부터 오른쪽 학습 패널(js/ui/learn.js)의 [미션] 탭에 그린다
// 미션 데이터는 js/data/missions.js, 채점은 js/rules/missions.js(gradeMission)

// 진행 상태: current = 진행 중인 미션 key (없으면 null), done = 완료한 미션 key 목록. 배치와 따로 저장한다
const MISSION_KEY = 'aws-3tier-simulator:missions';
const missionProgress = { current: null, done: [] };
let missionListOpen = false;   // 진행 중에 [미션 목록]을 눌러 목록을 보고 있는지
let missionHintOn = false;     // 힌트를 펼쳤는지 (미션을 바꾸면 접는다)

function saveMissionProgress() {
  try { localStorage.setItem(MISSION_KEY, JSON.stringify(missionProgress)); } catch (e) { /* 저장소를 쓸 수 없으면 생략 */ }
}
function loadMissionProgress() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(MISSION_KEY)); } catch (e) { /* 없으면 처음부터 */ }
  if (!data) return;
  const known = k => MISSIONS.some(m => m.key === k);
  missionProgress.current = known(data.current) ? data.current : null;
  missionProgress.done = (Array.isArray(data.done) ? data.done : []).filter(known);
}

// 미션의 시작 구성 데이터 (js/data/missions.js의 start 형식 → { nodes, edges })
function missionStartSpec(m) {
  const st = m.start;
  if (st.mistakes) return exampleFixSpec(st.mistakes === 'random' ? null : st.mistakes);
  const base = EXAMPLE_SPECS[st.from || 'basic'];
  const has = k => !st.keys || st.keys.includes(String(k));   // keys가 없으면 그 예시 전부
  return { nodes: base.nodes.filter(n => has(n[0])),
    edges: [...base.edges.filter(([a, b]) => has(a) && has(b)), ...(st.edges || [])] };
}

// 미션 시작. fresh: 시작 구성을 새로 불러온다 (목록의 [시작]). false면 지금 캔버스를 이어 쓴다 ([다음 미션]·[이어 하기])
function startMission(key, fresh) {
  const m = MISSIONS.find(x => x.key === key);
  if (!m) return;
  let spec = null;
  if (fresh) {
    spec = missionStartSpec(m);
    if (!loadSpec(spec, `미션 ${MISSIONS.indexOf(m) + 1} "${m.title}"을 시작해요. 오른쪽 [미션] 탭의 목표를 하나씩 달성해 보세요.`)) return;   // 지울지 묻는 창에서 취소
  }
  missionProgress.current = key;
  missionListOpen = false;
  missionHintOn = false;
  saveMissionProgress();
  uiPrefs.learnOpen = true;
  uiPrefs.learnTab = 'mission';
  saveUiPrefs();
  render();
  // 패널 내용(목록 → 목표)이 바뀌어 캔버스 크기가 달라졌으므로 그 크기에 맞춰 다시 전체 보기.
  // 빈 시작 구성(미션 1)은 사용자를 놓을 VPC 왼쪽 빈 곳까지 보이게
  if (spec) fitView(spec.nodes.length ? 0 : TEMPLATE_USER_GAP);
}

// [미션] 탭 내용. box: 학습 패널 몸통 (맨 위에 한 줄 요약 .learn-msg)
function renderMissionPanel(box) {
  const cur = MISSIONS.find(m => m.key === missionProgress.current);
  const msg = document.createElement('span');
  msg.className = 'learn-msg';
  box.appendChild(msg);
  const panel = document.createElement('div');
  panel.className = 'mission-panel';
  box.appendChild(panel);

  if (!cur || missionListOpen) { renderMissionList(panel, msg); return; }

  const idx = MISSIONS.indexOf(cur);
  const grade = gradeMission(cur);
  // 방금 모든 목표를 달성했으면 완료로 기록하고 알림
  if (grade.done && !missionProgress.done.includes(cur.key)) {
    missionProgress.done.push(cur.key);
    saveMissionProgress();
    showToast(`미션 ${idx + 1} "${cur.title}" 완료!`);
  }
  msg.textContent = `미션 ${idx + 1}/${MISSIONS.length} · ${cur.title} (목표 ${grade.doneCount}/${grade.goals.length}${grade.done ? ' · 완료' : ''})`;

  const title = document.createElement('div');
  title.className = 'mission-title';
  title.innerHTML = '<b></b><span></span>';
  title.querySelector('b').textContent = `미션 ${idx + 1}. ${cur.title}`;
  title.querySelector('span').textContent = cur.intro;
  panel.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'mission-goals';
  grade.goals.forEach(g => {
    const li = document.createElement('li');
    li.className = g.done ? 'done' : '';
    li.innerHTML = `<i>${g.done ? '✓' : ''}</i><span></span>`;
    li.querySelector('span').textContent = g.text;
    list.appendChild(li);
  });
  panel.appendChild(list);

  const next = MISSIONS[idx + 1];
  const todo = grade.goals.find(g => !g.done);
  if (grade.done) {
    const done = document.createElement('div');
    done.className = 'mission-done';
    done.textContent = '✓ 미션 완료! ' + cur.done + (next ? '' : ' 모든 미션을 마쳤어요.');
    panel.appendChild(done);
  } else if (missionHintOn && todo) {
    const hint = document.createElement('div');
    hint.className = 'mission-hint';
    hint.innerHTML = '<b>힌트</b><span></span>';
    hint.querySelector('span').textContent = todo.hint;
    panel.appendChild(hint);
  }

  const ctl = document.createElement('div');
  ctl.className = 'mission-ctl';
  const button = (id, text, primary, onClick) => {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? ' primary' : '');
    b.id = id;
    b.textContent = text;
    b.addEventListener('click', onClick);
    ctl.appendChild(b);
  };
  if (!grade.done) button('mission-hint', missionHintOn ? '힌트 숨기기' : '힌트 보기', false, () => { missionHintOn = !missionHintOn; renderLearn(); });
  // 다음 미션: 이어 가는 미션이면 캔버스 그대로, 아니면 그 미션의 시작 구성을 새로 불러온다 (지울지 묻는 창이 뜸)
  if (grade.done && next) button('mission-next', `다음 미션: ${next.title} ▶`, true, () => startMission(next.key, !next.continues));
  button('mission-list', '미션 목록', false, () => { missionListOpen = true; renderLearn(); });
  panel.appendChild(ctl);
}

// 미션 목록: 완료 표시와 [시작] / [이어 하기]
function renderMissionList(panel, msg) {
  const doneCount = MISSIONS.filter(m => missionProgress.done.includes(m.key)).length;
  msg.textContent = `단계별 미션 (완료 ${doneCount}/${MISSIONS.length})`;
  const intro = document.createElement('div');
  intro.className = 'mission-title';
  intro.innerHTML = '<b>단계별 미션</b><span>목표를 하나씩 달성하며 3-Tier 아키텍처를 만들고, 고치고, 다듬어 보세요. 목표는 캔버스를 바꿀 때마다 자동으로 확인해요.</span>';
  panel.appendChild(intro);
  const list = document.createElement('ol');
  list.className = 'mission-list';
  MISSIONS.forEach((m, i) => {
    if (!i || MISSIONS[i - 1].kind !== m.kind) {   // 종류가 바뀌는 곳에 묶음 제목
      const group = document.createElement('li');
      group.className = 'mission-group';
      group.innerHTML = '<b></b><span></span>';
      group.querySelector('b').textContent = MISSION_KINDS[m.kind].name;
      group.querySelector('span').textContent = MISSION_KINDS[m.kind].desc;
      list.appendChild(group);
    }
    const done = missionProgress.done.includes(m.key), isCur = m.key === missionProgress.current;
    const li = document.createElement('li');
    li.className = (done ? 'done' : '') + (isCur ? ' current' : '');
    li.innerHTML = `<i>${done ? '✓' : i + 1}</i><b></b><span></span>`;
    li.querySelector('b').textContent = m.title;
    li.querySelector('span').textContent = m.intro;
    const add = (text, fresh, title) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = text;
      b.title = title;
      b.setAttribute('data-key', m.key);
      b.setAttribute('data-fresh', fresh ? '1' : '0');
      b.addEventListener('click', () => startMission(m.key, fresh));
      li.appendChild(b);
    };
    if (isCur) add('이어 하기', false, '지금 캔버스 그대로 이 미션을 이어서 해요');
    add(done || isCur ? '처음부터' : '시작', true, '이 미션의 시작 구성을 새로 불러와요 (캔버스의 기존 내용은 지워져요)');
    list.appendChild(li);
  });
  panel.appendChild(list);
}
