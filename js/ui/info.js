// @ts-check
// js/ui/info.js — UI-10 서비스 설명 패널

/* ---------------------------------------------------------
   UI-10. 서비스 설명 패널
   박스를 선택하면 캔버스 오른쪽 위에 "무엇과 연결하는지, 어떤 요청이 오가는지"를 보여준다.
   지금 실제로 연결된 상대가 있으면 ✓, 연결하면 안 되는 상대와 이어져 있으면 ⚠로 표시한다.
   --------------------------------------------------------- */
const $info = document.getElementById('info-panel');

// 박스와 직접 연결된 상대 박스의 종류 목록
function neighborTypes(id) {
  return state.edges
    .filter(ed => ed.from === id || ed.to === id)
    .map(ed => findNode(ed.from === id ? ed.to : ed.from))
    .filter(Boolean)
    .map(n => n.type);
}

// 종류 목록 → "Load Balancer, EC2" 같은 이름
const typeNames = types => [...new Set(types.map(t => SVC_MAP[t].name))].join(', ');

function renderInfo() {
  const n = selectedId ? findNode(selectedId) : null;
  if (!n || multiSel.size > 1) { $info.hidden = true; return; }   // 여러 개를 고르면 숨김
  const svc = SVC_MAP[n.type], cat = CAT_MAP[svc.category];
  const g = SERVICE_GUIDE[n.type] || { links: [], avoid: [] };
  const near = neighborTypes(n.id);
  const hit = to => to.some(t => near.includes(t));

  const linkRows = g.links.map(l => {
    const on = hit(l.to);
    return `<li class="${on ? 'on' : ''}"><div class="ip-to"><span class="ip-mark">${on ? '✓' : '·'}</span>${typeNames(l.to)}` +
      `${on ? '<span class="ip-tag">연결됨</span>' : ''}</div><div class="ip-text">${l.text}</div></li>`;
  }).join('');
  const avoidRows = g.avoid.map(a => {
    const on = hit(a.to);
    return `<li class="${on ? 'bad' : ''}"><div class="ip-to"><span class="ip-mark">${on ? '⚠' : '✕'}</span>${typeNames(a.to)}` +
      `${on ? '<span class="ip-tag">지금 연결되어 있어요</span>' : ''}</div><div class="ip-text">${a.text}</div></li>`;
  }).join('');

  $info.innerHTML =
    `<div class="ip-head"><span class="ip-name">${svc.name}</span>` +
    `<span class="tt-cat"><span class="cat-dot" style="background:${cat.color}"></span>${cat.label}</span>` +
    `<button class="ip-fold" title="${uiPrefs.infoFolded ? '펼치기' : '접기'}">${uiPrefs.infoFolded ? '▸' : '▾'}</button>` +
    '<button class="ip-close" title="닫기 (Esc)">×</button></div>' +
    '<div class="ip-sim" id="ip-sim" hidden></div>' +
    `<div class="ip-desc">${svc.desc}</div>` +
    (SERVICE_DOCS[n.type] ? `<a class="ip-doc" href="${SERVICE_DOCS[n.type]}" target="_blank" rel="noopener">AWS 공식 문서 열기 ↗</a>` : '') +
    (g.note ? `<div class="ip-note">${g.note}</div>` : '') +
    (linkRows ? `<div class="ip-sec">이렇게 연결해요</div><ul class="ip-list">${linkRows}</ul>` : '') +
    (avoidRows ? `<div class="ip-sec avoid">이렇게 연결하지 마세요</div><ul class="ip-list">${avoidRows}</ul>` : '');
  $info.querySelector('.ip-close').addEventListener('click', () => select(null));
  // 접기: 제목 줄만 남겨 캔버스를 덜 가림. 다른 박스를 골라도 접힌 채로 유지
  $info.querySelector('.ip-fold').addEventListener('click', () => { uiPrefs.infoFolded = !uiPrefs.infoFolded; saveUiPrefs(); renderInfo(); });
  $info.classList.toggle('folded', uiPrefs.infoFolded);
  $info.hidden = false;
  updateInfoSim();
}

// 성능 시뮬레이션 중이면 설명 패널 맨 위에 고른 박스의 "지금 상태" (계산할 때마다 이 칸만 다시 그림)
// 내용: 박스에 마우스를 올릴 때 나오는 설명과 같은 것 + 처리량 제한이 있는 박스는 최근 5분 사용률 그래프
function updateInfoSim() {
  const box = document.getElementById('ip-sim');
  if (!box) return;
  const n = selectedId && !$info.hidden ? findNode(selectedId) : null;
  const on = !!n && resultTab === 'sim' && !!simResult;
  box.hidden = !on;
  if (!on) { box.innerHTML = ''; return; }
  const s = simResult.nodes.get(n.id);
  const detail = simTooltip(n.id) ||
    (s && s.load ? `<div class="tt-sim"><b>요청 ${fmt(s.load)}/초가 지나가요</b><div>AWS가 알아서 늘려서 처리량 제한이 없어요</div></div>`
      : '<div class="tt-sim"><b>요청이 지나가지 않아요</b><div>사용자 요청 흐름과 이어져 있지 않거나, 요청을 받지 않는 서비스예요</div></div>');
  const hasChart = !!(s && s.capacity);
  box.innerHTML = `<div class="ip-sim-head">지금 상태 <span>${clockText(simT)} · ${simPlaying ? '재생 중' : '멈춤'}</span></div>` + detail +
    (hasChart ? '<div class="ip-sim-cap">사용률 (최근 5분)</div><svg class="ip-sim-chart" viewBox="0 0 300 70"></svg>' : '');
  if (hasChart) {
    const values = simHistory.map(h => (h.util && h.util[n.id] || 0) * 100);
    const top = Math.max(100, Math.ceil(Math.max(0, ...values) / 50) * 50);
    drawSimChart(/** @type {SVGElement} */ (box.querySelector('.ip-sim-chart')), values, { max: top, unit: '%', color: '#d97a00' });
  }
}
