// @ts-check
// js/ui/learn.js — UI-16 오른쪽 학습 패널: [미션]·[문제] 탭 (43번)
// 검증·성능 시뮬레이션은 아래 결과 패널, 배우는 기능(미션·문제)은 캔버스 오른쪽 이 패널에 둔다.
// 툴바 [학습]으로 열고 닫는다. 열림 여부와 고른 탭은 uiPrefs(js/ui/storage.js)에 저장한다.
// 미션 내용은 js/ui/mission.js(renderMissionPanel)가 그린다.

const $learn = document.getElementById('learn-panel');
const $learnBtn = document.getElementById('btn-learn');
const LEARN_TABS = { mission: '미션', problem: '문제' };

// 학습 패널 열기·닫기. tab을 주면 그 탭으로 연다
function openLearn(open, tab) {
  uiPrefs.learnOpen = open;
  if (tab) uiPrefs.learnTab = tab;
  saveUiPrefs();
  renderLearn();
}

function renderLearn() {
  const open = uiPrefs.learnOpen;
  $learnBtn.classList.toggle('active', open);
  $learnBtn.textContent = open ? '학습 ▸' : '학습 ◂';
  $learnBtn.title = open ? '오른쪽 학습 패널을 닫아요' : '오른쪽에 [미션]·[문제] 패널을 열어요';
  $learn.hidden = !open;
  if (!open) return;
  $learn.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'learn-head';
  head.innerHTML = '<span class="tabs">' + Object.entries(LEARN_TABS)
    .map(([k, name]) => `<button class="tab learn-tab" data-learn="${k}">${name}</button>`).join('') + '</span>' +
    '<button class="learn-close" title="학습 패널 닫기">✕</button>';
  head.querySelectorAll('.learn-tab').forEach(b => {
    const tab = b.getAttribute('data-learn');
    b.classList.toggle('active', tab === uiPrefs.learnTab);
    b.addEventListener('click', () => { if (tab !== uiPrefs.learnTab) openLearn(true, tab); });
  });
  head.querySelector('.learn-close').addEventListener('click', () => openLearn(false));
  $learn.appendChild(head);
  const body = document.createElement('div');
  body.className = 'learn-body';
  $learn.appendChild(body);
  if (uiPrefs.learnTab === 'problem') renderProblemPanel(body);
  else renderMissionPanel(body);
}

// [문제] 탭: 면접식 설계 문제 (43-2에서 채운다)
function renderProblemPanel(body) {
  body.innerHTML = '<div class="learn-msg">면접식 설계 문제</div>' +
    '<div class="mission-title"><b>준비 중이에요</b><span>요구 사항을 읽고 직접 설계한 뒤, 모범 답안과 비교해 보는 문제가 곧 추가돼요.</span></div>';
}
