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
}
