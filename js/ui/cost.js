// @ts-check
// js/ui/cost.js — UI-19 결과 패널 [비용] 탭: 지금 구성의 대략적인 월 비용 (47번)
// 계산은 js/rules/cost.js(costOf), 가격표는 js/data/cost.js (근거 criteria/cost.md)

// 달러 글: $1,234 / 작으면 $0.50
const usd = v => (v >= 10 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`);

// [비용] 탭 내용. head: 결과 패널 머리 줄
function renderCostPanel(head) {
  const c = costOf();
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.innerHTML = `<b class="cost-total">월 약 ${usd(c.total)}</b> · ${COST_REGION} 지역 온디맨드 가격(${COST_CHECKED} 확인)으로 계산한 대략값이에요. 실제 청구와 다를 수 있어요.`;
  head.appendChild(msg);
  const panel = document.createElement('div');
  panel.className = 'cost-panel';
  $result.appendChild(panel);
  if (!c.rows.length) {
    panel.innerHTML = '<div class="cost-note">시간·월 요금이 붙는 박스가 아직 없어요. EC2·RDS·NAT·Load Balancer 같은 박스를 놓으면 여기에 나와요.</div>';
  } else {
    const table = document.createElement('table');
    table.className = 'compare-table cost-table';
    table.innerHTML = '<thead><tr><th>항목</th><th>개수</th><th>1개 월</th><th>월 합계</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    c.rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="compare-name"></td><td></td><td></td><td></td><td><a target="_blank" rel="noopener">가격 ↗</a></td>';
      const td = tr.querySelectorAll('td');
      td[0].textContent = r.name;
      if (r.note) td[0].insertAdjacentHTML('beforeend', '<span class="cost-row-note"></span>');
      if (r.note) td[0].querySelector('.cost-row-note').textContent = r.note;
      td[1].textContent = `${r.count}`;
      td[2].textContent = usd(r.unit);
      td[3].textContent = usd(r.monthly);
      td[4].querySelector('a').href = r.doc;
      tbody.appendChild(tr);
    });
    tbody.insertAdjacentHTML('beforeend', `<tr class="cost-sum"><td class="compare-name">합계</td><td></td><td></td><td>${usd(c.total)}</td><td></td></tr>`);
    table.appendChild(tbody);
    panel.appendChild(table);
  }
  const notes = document.createElement('div');
  notes.className = 'compare-diff cost-notes';
  const line = (label, text) => {
    const p = document.createElement('div');
    p.innerHTML = '<b></b><span></span>';
    p.querySelector('b').textContent = label;
    p.querySelector('span').textContent = text;
    notes.appendChild(p);
  };
  if (c.usage.length) line('사용량에 따라', `${c.usage.join(' · ')} — 요청 수·데이터 양에 따라 요금이 붙어서 합계에 넣지 않았어요`);
  if (c.free.length) line('무료', `${c.free.join(' · ')}`);
  line('넣지 않은 것', COST_EXTRA);
  panel.appendChild(notes);
}
