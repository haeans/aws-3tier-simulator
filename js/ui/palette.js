// js/ui/palette.js — UI-3 팔레트·설명 툴팁

/* ---------------------------------------------------------
   UI-3. 팔레트·설명 툴팁
   --------------------------------------------------------- */

// ----- 팔레트 생성 -----
function addPaletteSection(title, color, items) {
  const t = document.createElement('div');
  t.className = 'cat-title';
  t.innerHTML = `<span class="cat-dot" style="background:${color}"></span>${title}`;
  $palette.appendChild(t);
  const grid = document.createElement('div');
  grid.className = 'cat-items';
  items.forEach(el => grid.appendChild(el));
  $palette.appendChild(grid);
}

function buildPalette() {
  // 영역 (구조를 먼저 만들도록 맨 위에 배치)
  addPaletteSection('영역', 'var(--vpc)', AREAS.map(area => {
    const el = document.createElement('div');
    el.className = `area-chip area-${area.type}`;
    el.innerHTML = (SUBNET_TYPES.includes(area.type) ? LOCK_SVG : '') + `<span>${area.name}</span>`;
    attachTooltip(el, () => areaTooltip(area.type));
    el.addEventListener('pointerdown', e => startPaletteDrag(e, 'area', area));
    return el;
  }));

  // 서비스
  CATEGORIES.forEach(cat => {
    const items = SERVICES.filter(s => s.category === cat.key);
    if (!items.length) return;
    addPaletteSection(cat.label, cat.color, items.map(svc => {
      const el = document.createElement('div');
      styleServiceBox(el, svc);
      el.textContent = svc.name;
      attachTooltip(el, () => serviceTooltip(svc));
      el.addEventListener('pointerdown', e => startPaletteDrag(e, 'node', svc));
      return el;
    }));
  });
}

// ----- 설명 툴팁 -----
const $tooltip = document.getElementById('tooltip');
const TOOLTIP_DELAY = 400;
let tooltipTimer = null;
let tooltipPos = { x: 0, y: 0 };

function serviceTooltip(svc) {
  const cat = CAT_MAP[svc.category];
  const rec = RECOMMENDED_ZONE[svc.type];
  return `<div class="tt-head">${svc.name}<span class="tt-cat">` +
    `<span class="cat-dot" style="background:${cat.color}"></span>${cat.label}</span></div>` +
    `<div class="tt-desc">${svc.desc}</div>` +
    `<div class="tt-zone">놓는 곳 · <b>${ZONE_TEXT[svc.allowedZone]}</b>${rec ? ` (권장: ${rec})` : ''}</div>`;
}
function areaTooltip(type) {
  const a = AREA_MAP[type], info = AREA_DESC[type];
  return `<div class="tt-head">${a.name}<span class="tt-cat">` +
    `<span class="cat-dot" style="background:var(--vpc)"></span>영역</span></div>` +
    `<div class="tt-desc">${info.desc}</div>` +
    `<div class="tt-zone">놓는 곳 · <b>${info.zone}</b></div>`;
}

// 마우스 근처에 표시하되 화면 밖으로 넘치지 않게
function placeTooltip() {
  const pad = 8, w = $tooltip.offsetWidth, h = $tooltip.offsetHeight;
  let x = tooltipPos.x + 14, y = tooltipPos.y + 18;
  if (x + w > window.innerWidth - pad) x = tooltipPos.x - w - 10;
  if (y + h > window.innerHeight - pad) y = tooltipPos.y - h - 10;
  $tooltip.style.left = Math.max(pad, x) + 'px';
  $tooltip.style.top  = Math.max(pad, y) + 'px';
}

function hideTooltip() {
  clearTimeout(tooltipTimer);
  $tooltip.classList.remove('show');
}
$wrap.addEventListener('scroll', hideTooltip);
$palette.addEventListener('scroll', hideTooltip);

// 요소에 마우스를 잠시 올리면 설명 표시. 드래그 중·연결 모드에서는 표시하지 않음.
function attachTooltip(el, getHtml) {
  el.addEventListener('pointerenter', e => {
    hideTooltip();
    if (e.buttons || connectMode) return;
    tooltipPos = { x: e.clientX, y: e.clientY };
    tooltipTimer = setTimeout(() => {
      $tooltip.innerHTML = getHtml();
      $tooltip.classList.add('show');
      placeTooltip();
    }, TOOLTIP_DELAY);
  });
  el.addEventListener('pointermove', e => {
    if (e.buttons) { hideTooltip(); return; }
    tooltipPos = { x: e.clientX, y: e.clientY };
    if ($tooltip.classList.contains('show')) placeTooltip();
  });
  el.addEventListener('pointerleave', hideTooltip);
  el.addEventListener('pointerdown', hideTooltip);
}

// 서비스 박스 공통 모양에 카테고리 색 적용
function styleServiceBox(el, svc) {
  const cat = CAT_MAP[svc.category];
  el.classList.add('svc');
  el.style.setProperty('--c', cat.color);
  el.style.setProperty('--cbg', cat.bg);
  el.style.setProperty('--cfg', cat.fg);
}

// ----- 팔레트 → 캔버스 드래그 -----
function startPaletteDrag(e, kind, def) {
  if (e.button !== 0) return;
  e.preventDefault();

  const w = kind === 'area' ? def.w : NODE_W;
  const h = kind === 'area' ? def.h : NODE_H;
  const ghost = document.createElement('div');
  if (kind === 'area') {
    ghost.className = `area area-${def.type}`;
  } else {
    styleServiceBox(ghost, def);
    ghost.textContent = def.name;
  }
  ghost.classList.add('ghost');
  ghost.style.width = w + 'px';
  ghost.style.height = h + 'px';
  ghost.style.transform = `scale(${zoom})`;   // 캔버스 줌과 같은 크기로 보이게
  document.body.appendChild(ghost);

  const move = ev => {
    let gx = ev.clientX, gy = ev.clientY;   // 미리보기 박스 중심(화면 좌표)
    const over = isOverCanvas(gx, gy);
    // VPC 경계선 스냅 대상이면 놓았을 때 위치를 미리 보여줌
    if (over && kind === 'node' && EDGE_SNAP_TYPES.includes(def.type)) {
      const p = clientToWorld(gx, gy);
      const pos = fitRect(p.x - NODE_W / 2, p.y - NODE_H / 2, NODE_W, NODE_H);
      const probe = { type: def.type, x: pos.x, y: pos.y };
      if (snapToVpcEdge(probe)) {
        const c = worldToClient(probe.x + NODE_W / 2, probe.y + NODE_H / 2);
        gx = c.x;
        gy = c.y;
      }
    }
    ghost.style.left = (gx - w / 2) + 'px';
    ghost.style.top  = (gy - h / 2) + 'px';
    ghost.classList.toggle('outside', !over);
  };
  const end = ev => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    ghost.remove();
    // 캔버스 밖에 놓으면 아무것도 만들지 않음(팔레트 드래그 취소)
    if (ev.type === 'pointerup' && isOverCanvas(ev.clientX, ev.clientY)) {
      const p = clientToWorld(ev.clientX, ev.clientY);
      if (kind === 'area') addContainer(def.type, p.x, p.y);
      else addNode(def.type, p.x, p.y);
    }
  };
  move(e);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

