// 검증·제안·동적 흐름 테스트
const { test, expect } = require('@playwright/test');
const { openApp, buildValidArch, dragWorld, connect, verdict, moveNode } = require('./helpers');

test('빈 캔버스에서 검증하면 서비스를 먼저 배치하라고 안내한다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-validate');
  await expect(page.locator('#result')).toContainText('서비스를 먼저 배치해주세요');
});

test('정상 구성은 "정상"으로 판정되고 개선 제안이 함께 표시된다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.click('#btn-validate');
  await expect(page.locator('#result .status')).toHaveText('정상');
  const ids = await page.evaluate(() => validation.suggestions.map(s => s.rule.id));
  expect(ids).toEqual([1, 2, 4, 5, 8, 9, 12, 15]);           // DB 캐싱, CDN 사용, 자동 확장(EC2 2대), 모니터링·감사, DNS, 웹 방화벽, NAT를 AZ마다(NAT 1개), Session Manager
  await expect(page.locator('.issue.improve')).toHaveCount(8);
});

test('Route 53·WAF는 놓기만 하면 연결하라고 제안하고, 연결하면 제안이 사라진다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('route53', 120, 160); addNode('waf', 120, 440); });   // 놓기만 하고 연결하지 않음
  await page.click('#btn-validate');
  await expect(page.locator('#result .status')).toHaveText('정상');   // 판정에는 영향 없음
  let ids = await page.evaluate(() => validation.suggestions.map(s => s.rule.id));
  expect(ids).toEqual(expect.arrayContaining([8, 9]));
  await expect(page.locator('#result')).toContainText('Route 53이 있지만 사용자와 연결되어 있지 않아요');
  await expect(page.locator('#result')).toContainText('WAF가 있지만 연결되어 있지 않아요');
  await page.evaluate(() => {
    const T = t => state.nodes.find(n => n.type === t);
    const E = (a, b) => state.edges.push({ id: newId('e'), from: T(a).id, to: T(b).id, fromSide: null, toSide: null, mid: null });
    E('pc', 'route53'); E('waf', 'lb');
    render();
  });
  await page.click('#btn-validate');
  ids = await page.evaluate(() => validation.suggestions.map(s => s.rule.id));
  expect(ids).not.toContain(8);
  expect(ids).not.toContain(9);
});

test('흐름: Route 53에 주소를 물어본 뒤(왕복) 출발하고, LB에서 WAF 검사(반짝임)를 거친 뒤 EC2로 간다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => {
    addNode('route53', 120, 160); addNode('waf', 120, 440);
    const T = t => state.nodes.find(n => n.type === t);
    const E = (a, b) => state.edges.push({ id: newId('e'), from: T(a).id, to: T(b).id, fromSide: null, toSide: null, mid: null });
    E('route53', 'pc'); E('waf', 'lb');   // 저장 순서를 일부러 들르는 곳 → 경로 박스로
    render();
  });
  await page.click('#btn-validate');
  const f = await page.evaluate(() => {
    const typeOf = id => findNode(id).type;
    const at = (a, b) => validation.flow.find(x => typeOf(x.src) === a && typeOf(x.dst) === b);
    const pick = x => ({ start: x.start, end: x.start + x.dur, roundTrip: x.roundTrip, inspect: x.inspect, id: x.id });
    return { dns: pick(at('pc', 'route53')), go: pick(at('pc', 'igw')), lbIn: pick(at('igw', 'lb')),
             waf: pick(at('lb', 'waf')), toEc2: pick(at('lb', 'ec2')) };
  });
  expect(f.dns).toMatchObject({ start: 0, roundTrip: true });
  expect(f.go.start).toBeCloseTo(f.dns.end);          // 주소를 받은 뒤 출발
  expect(f.waf).toMatchObject({ roundTrip: false, inspect: true });
  expect(f.waf.start).toBeCloseTo(f.lbIn.end);        // LB에 도착하면 검사
  expect(f.toEc2.start).toBeCloseTo(f.waf.end);       // 검사를 통과한 뒤 EC2로
  // WAF 선에는 점이 다니지 않고, 검사 중에 WAF 박스가 반짝인다
  expect(await page.evaluate(id => flowDots.find(d => d.f.id === id).dot, f.waf.id)).toBeNull();
  await page.waitForFunction(() => elMap.get(state.nodes.find(n => n.type === 'waf').id).classList.contains('flow-inspect'));
  // Route 53·WAF 선은 양쪽 화살표
  const waf = page.locator(`.edge[data-id="${f.waf.id}"]`);
  await expect(waf).toHaveAttribute('marker-start', /arrow/);
  await expect(waf).toHaveAttribute('marker-end', /arrow/);
});

test('LB — WAF — CloudFront처럼 WAF를 사이에 두면 제거 제안이 나오고, CloudFront를 경로에 두면 사라진다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => {
    addNode('waf', 120, 440); addNode('cloudfront', 120, 580);
    const T = t => state.nodes.find(n => n.type === t);
    const E = (a, b) => state.edges.push({ id: newId('e'), from: T(a).id, to: T(b).id, fromSide: null, toSide: null, mid: null });
    E('lb', 'waf'); E('waf', 'cloudfront');
    render();
  });
  await page.click('#btn-validate');
  let ids = await page.evaluate(() => validation.suggestions.map(s => s.rule.id));
  expect(ids).toContain(10);
  await expect(page.locator('#result')).toContainText('WAF는 길이 아니라서 CloudFront에는 요청이 들어오지 않아요');
  await expect(page.locator('.issue.remove')).toContainText('사용자 — CloudFront — IGW');
  // CloudFront를 사용자와 IGW 사이에 두면 제안이 사라진다
  await page.evaluate(() => {
    const T = t => state.nodes.find(n => n.type === t);
    const E = (a, b) => state.edges.push({ id: newId('e'), from: T(a).id, to: T(b).id, fromSide: null, toSide: null, mid: null });
    E('pc', 'cloudfront'); E('cloudfront', 'igw');
    render();
  });
  await page.click('#btn-validate');
  ids = await page.evaluate(() => validation.suggestions.map(s => s.rule.id));
  expect(ids).not.toContain(10);
});

test('잘한 점: 좋은 구성이 실제로 있을 때만 칭찬하고, 문제가 있는 규칙은 칭찬하지 않는다', async ({ page }) => {
  await openApp(page);
  // 빈 VPC 틀만 있으면 (문제는 있어도) 칭찬할 것이 없다
  await page.evaluate(() => { loadTemplate({ x: 280, y: 80 }); addNode('pc', 120, 300); });
  await page.click('#btn-validate');
  expect(await page.evaluate(() => validation.praises.length)).toBe(0);
  await expect(page.locator('.issue.good')).toHaveCount(0);

  await buildValidArch(page);
  await page.click('#btn-validate');
  const praised = () => page.evaluate(() => validation.praises.map(p => (p.rule.level ? '판정' : '제안') + p.rule.id));
  expect(await praised()).toEqual(['판정1', '판정2', '판정4', '판정6', '판정7', '제안11']);
  await expect(page.locator('#result .msg')).toContainText('잘한 점 6개');
  // 순서: 문제 → 잘한 점 → 제안
  const titles = await page.locator('#result .suggest-title').allTextContents();
  expect(titles).toEqual(['잘한 점', '더 나은 설계를 위한 제안']);
  await expect(page.locator('.issue.good .pillar').first()).toBeVisible();   // 근거 태그도 붙음

  // WAF·Route 53을 제대로 연결하면 제안 대신 잘한 점으로
  await page.evaluate(() => {
    addNode('route53', 120, 160); addNode('waf', 120, 440);
    const T = t => state.nodes.find(n => n.type === t);
    const E = (a, b) => state.edges.push({ id: newId('e'), from: T(a).id, to: T(b).id, fromSide: null, toSide: null, mid: null });
    E('pc', 'route53'); E('waf', 'lb');
    // DB를 사용자와 직접 연결 → 판정 4(DB 보호)는 칭찬에서 빠짐
    E('pc', 'rds');
    render();
  });
  await page.click('#btn-validate');
  await expect(page.locator('#result .status')).toHaveText('오류');
  expect(await praised()).toEqual(['판정1', '판정2', '판정6', '판정7', '제안8', '제안9', '제안11']);
});

test('DB가 사용자와 직접 연결되면 "오류"와 빨간 강조가 표시된다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => {
    const T = t => state.nodes.find(n => n.type === t);
    state.edges.push({ id: newId('e'), from: T('pc').id, to: T('rds').id, fromSide: null, toSide: null, mid: null });
    render();
  });
  await page.click('#btn-validate');
  await expect(page.locator('#result .status')).toHaveText('오류');
  await expect(page.locator('#result')).toContainText('DB가 인터넷에 직접 노출돼 있어요');
  await expect(page.locator('.node.v-error')).toHaveCount(2);
});

test('불필요한 연결(ElastiCache—RDS)은 제거 제안이 나온다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => {
    addNode('elasticache', 640, 590);
    const T = t => state.nodes.find(n => n.type === t);
    state.edges.push({ id: newId('e'), from: T('elasticache').id, to: T('rds').id, fromSide: null, toSide: null, mid: null });
    render();
  });
  await page.click('#btn-validate');
  await expect(page.locator('.issue.remove')).toContainText('ElastiCache — RDS 연결');
});

test('검증 후 흐름 점이 사용자 쪽에서 DB 쪽으로 움직이고, 구성이 바뀌면 멈춘다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.click('#btn-validate');
  await expect(page.locator('.flow-dot').first()).toBeAttached();
  // 요청이 지나가는 순서대로 시작한다: PC→IGW → IGW→LB → LB→EC2 → EC2→RDS
  const starts = await page.evaluate(() => {
    const typeOf = id => findNode(id).type;
    const at = (a, b) => validation.flow.find(f => typeOf(f.src) === a && typeOf(f.dst) === b).start;
    return [at('pc', 'igw'), at('igw', 'lb'), at('lb', 'ec2'), at('ec2', 'rds')];
  });
  expect(starts).toEqual([...starts].sort((x, y) => x - y));
  expect(new Set(starts).size).toBe(4);
  // RDS→EC2로 저장된 연결도 EC2→RDS 방향: 화살표는 RDS 쪽(시작점 쪽)에만
  const rdsEdge = await page.evaluate(() => {
    const ed = state.edges.find(e => [e.from, e.to].includes(state.nodes.find(n => n.type === 'rds').id));
    const el = document.querySelector(`.edge[data-id="${ed.id}"]`);
    return { id: ed.id, reverse: validation.flow.find(f => f.id === ed.id).reverse,
             start: el.hasAttribute('marker-start'), end: el.hasAttribute('marker-end') };
  });
  expect(rdsEdge).toMatchObject({ reverse: true, start: true, end: false });
  // 그 구간의 점이 보이는 동안 아래(RDS 쪽)로 움직인다
  const dotY = () => page.evaluate(id => +flowDots.find(d => d.f.id === id).dot.getAttribute('cy'), rdsEdge.id);
  await page.waitForFunction(id => flowDots.find(d => d.f.id === id).dot.getAttribute('visibility') === 'visible', rdsEdge.id);
  const y1 = await dotY();
  await page.waitForTimeout(100);
  expect(await dotY()).toBeGreaterThan(y1);
  // 박스를 옮기면 검증 결과와 흐름 점이 사라지고, 화살표는 다시 양쪽으로
  const ec2 = await page.evaluate(() => state.nodes.find(n => n.type === 'ec2' && n.x > 700));
  await dragWorld(page, { x: ec2.x + 50, y: ec2.y + 30 }, { x: ec2.x + 90, y: ec2.y + 30 });
  await expect(page.locator('.flow-dot')).toHaveCount(0);
  await expect(page.locator('#result')).toContainText('구성이 바뀌었어요');
  await expect(page.locator(`.edge[data-id="${rdsEdge.id}"]`)).toHaveAttribute('marker-end', /arrow/);
});

test('검증 중에 버튼을 다시 누르면 검증이 종료되고, 또 누르면 다시 검증한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  const btn = page.locator('#btn-validate');
  await expect(btn).toHaveText('검증하기');
  await btn.click();
  await expect(btn).toHaveText('검증 종료');
  await expect(page.locator('.flow-dot').first()).toBeAttached();
  const before = await page.evaluate(() => JSON.stringify(state));
  // 검증 종료: 결과·흐름 점·한쪽 화살표가 사라지고 구성은 그대로
  await btn.click();
  await expect(btn).toHaveText('검증하기');
  await expect(page.locator('.flow-dot')).toHaveCount(0);
  await expect(page.locator('#result .status')).toHaveCount(0);
  await expect(page.locator('#result')).toContainText('검증을 종료했어요');
  await expect(page.locator('.node.v-error, .node.v-warn, .v-badge')).toHaveCount(0);
  await expect(page.locator('.edge[marker-start]').first()).toBeAttached();   // 다시 양쪽 화살표
  expect(await page.evaluate(() => JSON.stringify(state))).toBe(before);
  // 다시 누르면 다시 검증
  await btn.click();
  await expect(btn).toHaveText('검증 종료');
  await expect(page.locator('#result .status')).toHaveText('정상');
});

test('결과 목록의 항목을 클릭하면 해당 박스가 선택된다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { state.nodes.find(n => n.type === 'lb').y = 1200; recomputeParents(); render(); });   // LB를 VPC 밖으로
  await page.click('#btn-validate');
  await page.locator('.issue.error', { hasText: 'Load Balancer는 퍼블릭 서브넷에' }).click();
  const selectedType = await page.evaluate(() => state.nodes.find(n => n.id === selectedId)?.type);
  expect(selectedType).toBe('lb');
  // 오류 강조 바깥에 선택 테두리가 한 겹 더 보이고, 찾아간 박스가 깜빡인다
  const lb = page.locator('#node-layer .node.selected');
  await expect(lb).toHaveClass(/v-error/);
  await expect(lb).toHaveClass(/locate/);
  expect(await lb.evaluate(el => getComputedStyle(el).outlineOffset)).toBe('5px');
  await expect(lb).not.toHaveClass(/locate/, { timeout: 3000 });   // 깜빡임이 끝나면 정리
});

test('Auto Scaling 그룹: 없으면 만들라고, 한 AZ의 EC2만 감싸면 넓히라고 제안한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);                               // EC2: AZ A(400,430), AZ B(880,430)
  const has4 = async () => {
    await page.click('#btn-validate');
    return page.evaluate(() => validation.suggestions.filter(s => s.rule.id === 4).map(s => s.action));
  };
  expect((await has4())[0]).toContain('Auto Scaling 그룹을 두 AZ의 프라이빗 서브넷에 걸쳐');

  // 그룹이 AZ B의 EC2만 감쌈 → 넓히라는 제안
  await page.evaluate(() => { addContainer('asg', 1020, 430); });
  expect((await has4())[0]).toContain('다른 AZ의 프라이빗 서브넷까지');

  // 두 AZ의 EC2를 모두 감쌈 → 제안 없음
  await page.evaluate(() => {
    const before = takeSnapshot();
    Object.assign(state.containers.find(c => c.type === 'asg'), { x: 320, width: 900 });
    commit(before, null);
  });
  expect(await has4()).toEqual([]);
});

test('박스를 클릭하면 설명 패널이 뜨고, 실제 연결 상태(연결됨/연결하면 안 됨)를 표시한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => select(null));                  // 방금 놓은 박스가 선택된 상태라 먼저 해제
  await expect(page.locator('#info-panel')).toBeHidden();
  const ec2 = await page.evaluate(() => { const n = state.nodes.find(n => n.type === 'ec2'); return worldToClient(n.x + 50, n.y + 30); });
  await page.mouse.click(ec2.x, ec2.y);
  const panel = page.locator('#info-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.ip-name')).toHaveText('EC2');
  await expect(panel.locator('li.on')).toContainText(['Load Balancer']);   // LB와 연결되어 있음

  // RDS를 PC와 직접 연결하면 "연결하지 마세요" 항목에 경고 표시
  await page.evaluate(() => {
    const T = t => state.nodes.find(n => n.type === t);
    state.edges.push({ id: newId('e'), from: T('pc').id, to: T('rds').id, fromSide: null, toSide: null, mid: null });
    render();
    select(T('rds').id);
  });
  await expect(panel.locator('li.bad')).toContainText('지금 연결되어 있어요');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('모든 서비스에 설명 패널 내용이 있고, 연결 상대 종류가 올바르다', async ({ page }) => {
  await openApp(page);
  const problems = await page.evaluate(() => SERVICES.flatMap(s => {
    const g = SERVICE_GUIDE[s.type];
    if (!g) return [`${s.type}: 내용 없음`];
    return [...g.links, ...g.avoid].flatMap(l => l.to.filter(t => !SVC_MAP[t]).map(t => `${s.type}: 없는 종류 ${t}`));
  }));
  expect(problems).toEqual([]);
});

test('판정·제안 결과마다 Well-Architected 기준 태그와 근거가 붙는다', async ({ page }) => {
  await openApp(page);
  // 모든 규칙에 근거가 있고, 태그 종류가 올바르다
  const bad = await page.evaluate(() => [...VALIDATION_RULES, ...SUGGESTION_RULES]
    .filter(r => !r.basis || !Array.isArray(r.pillars) || r.pillars.some(k => !PILLARS[k]))
    .map(r => r.id));
  expect(bad).toEqual([]);

  await buildValidArch(page);
  await page.click('#btn-validate');
  const cache = page.locator('.issue.improve').filter({ hasText: 'DB 캐싱' });
  const tag = cache.locator('a.pillar');
  await expect(tag).toHaveText('성능');
  await expect(tag).toHaveAttribute('href', /performance-efficiency-pillar/);
  await expect(cache.locator('.basis')).toContainText('메모리 캐시');
});

test('모든 서비스와 규칙에 AWS 공식 문서 출처가 있다', async ({ page }) => {
  await openApp(page);
  const missing = await page.evaluate(() => {
    const official = u => /^https:\/\/(docs\.aws\.amazon\.com|aws\.amazon\.com)\//.test(u || '');
    return [
      ...SERVICES.filter(s => !official(SERVICE_DOCS[s.type])).map(s => `서비스 ${s.type}`),
      ...VALIDATION_RULES.filter(r => !official(r.ref)).map(r => `규칙 ${r.id}`),
      ...SUGGESTION_RULES.filter(r => !official(r.ref)).map(r => `제안 ${r.id}`),
    ];
  });
  expect(missing).toEqual([]);
});

test('criteria 문서와 코드가 맞는다: 반영된 항목은 코드에 근거 주석이 있고, 코드의 근거 ID는 문서에 있다', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const jsText = fs.readdirSync(path.join(root, 'js'), { recursive: true })
    .filter(f => String(f).endsWith('.js')).map(f => fs.readFileSync(path.join(root, 'js', String(f)), 'utf8')).join('\n');
  const items = new Map();   // ID → 상태
  fs.readdirSync(path.join(root, 'criteria')).filter(f => f.endsWith('.md') && !['README.md', 'PROGRESS.md'].includes(f)).forEach(f => {
    fs.readFileSync(path.join(root, 'criteria', f), 'utf8').split(/^### /m).slice(1).forEach(sec => {
      const id = sec.match(/^[A-Z0-9-]+/)[0];
      items.set(id, (sec.match(/^- 상태: (.*)$/m) || [])[1] || '');
    });
  });
  // UI-10 같은 화면 구역 번호(js/ui/core.js)는 criteria ID가 아니다
  const cited = new Set(jsText.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z])?-\d{2}\b/g).filter(id => !id.startsWith('UI-')));
  const notCited = [...items].filter(([id, st]) => st.startsWith('반영') && !cited.has(id)).map(([id]) => id);
  const unknown = [...cited].filter(id => !items.has(id));
  expect(notCited).toEqual([]);
  expect(unknown).toEqual([]);
});

// ----- 판정 기준 정비 (criteria/entry.md, ROADMAP 14번) -----
test('LB-02: LB와 연결된 EC2가 한 AZ에만 있으면 경고한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  // LB — 두 번째 EC2(AZ B) 연결을 지움 → 한 AZ의 EC2만 연결
  await page.evaluate(() => {
    const lb = state.nodes.find(n => n.type === 'lb'), ec2b = state.nodes.filter(n => n.type === 'ec2')[1];
    state.edges = state.edges.filter(e => !(e.from === lb.id && e.to === ec2b.id));
    render();
  });
  const r = await verdict(page);
  expect(r.issues).toContain(7);
  expect(r.status).toBe('warn');
  expect(r.praises).not.toContain('V7');
  expect(r.msgs.join(' ')).toContain('Load Balancer와 연결된 EC2가 한 AZ에만 있어요');
});

test('LB-05: IGW와 이어지지 않은 LB가 하나 더 있으면 "한 입구" 칭찬이 사라진다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('lb', 640, 330); });   // IGW와 이어지지 않은 LB
  expect((await verdict(page)).praises).not.toContain('V1');
});

test('IGW-02: IGW와 EC2를 바로 이으면 오류 / IGW-03: 사용자와 EC2를 바로 이으면 경고 (칭찬도 사라짐)', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await connect(page, 'igw', 'ec2');
  let r = await verdict(page);
  expect(r.status).toBe('error');
  expect(r.issues).toContain(8);
  expect(r.praises).not.toContain('V1');
  expect(r.praises).not.toContain('V2');
  await buildValidArch(page);
  await connect(page, 'pc', 'ec2');
  r = await verdict(page);
  expect(r.issues).toContain(9);
  expect(r.issues).not.toContain(8);
  expect(r.status).toBe('warn');
  expect(r.praises).not.toContain('V1');
  expect(r.praises).not.toContain('V2');
});

test('NAT-01: 퍼블릭이 아닌 NAT가 하나라도 있으면 경고 / NAT-03: 사용자와 NAT를 이으면 오류', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('nat', 560, 430); });   // 프라이빗 서브넷(AZ A)에 NAT 추가. 퍼블릭 NAT는 그대로 있음
  let r = await verdict(page);
  expect(r.issues).toContain(6);
  expect(r.praises).not.toContain('V6');
  await buildValidArch(page);
  await connect(page, 'pc', 'nat');
  r = await verdict(page);
  expect(r.status).toBe('error');
  expect(r.issues).toContain(10);
});

test('NAT-02: NAT가 AZ 하나뿐이면 제안하고 AZ마다 두면 칭찬 / LB-06: LB—NAT 제거 제안 / LB-03: LB가 AZ마다 있으면 제안', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);   // NAT는 AZ A에만 있음 (EC2는 AZ A·B)
  let r = await verdict(page);
  expect(r.sug).toContain(12);
  expect(r.sug).not.toContain(11);
  await page.evaluate(() => { addNode('nat', 880, 270); });   // AZ B 퍼블릭에도 NAT
  r = await verdict(page);
  expect(r.sug).not.toContain(12);
  expect(r.praises).toContain('S12');
  expect(r.status).toBe('ok');
  await connect(page, 'lb', 'nat');
  r = await verdict(page);
  expect(r.sug).toContain(7);
  expect(r.msgs.join(' ')).toContain('Load Balancer — NAT 연결');
  await page.evaluate(() => { addNode('lb', 1040, 270); });   // AZ B 퍼블릭에도 LB
  r = await verdict(page);
  expect(r.sug).toContain(11);
  expect(r.praises).not.toContain('S11');
});

test('WAF-03: 입구(CloudFront·LB)마다 WAF가 있어야 제안이 사라진다 (하나만 있으면 없는 입구를 알려준다)', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('cloudfront', 120, 160); addNode('waf', 120, 440); addNode('waf', 120, 580); });
  await connect(page, 'waf', 'lb', 0, 0);                    // WAF는 LB에만
  let r = await verdict(page);
  expect(r.sug).toContain(9);
  expect(r.msgs.join(' ')).toContain('WAF가 없는 입구가 있어요(CloudFront)');
  await connect(page, 'waf', 'cloudfront', 1, 0);            // CloudFront에도 WAF
  r = await verdict(page);
  expect(r.sug).not.toContain(9);
  expect(r.praises).toContain('S9');
});

test('WAF-01·02: WAF를 EC2에 붙이거나, 입구 하나에 WAF 둘, 한 WAF를 CloudFront와 LB에 함께 붙이면 제거 제안', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('waf', 120, 440); addNode('waf', 120, 580); });
  await connect(page, 'waf', 'ec2', 0, 0);
  let r = await verdict(page);
  expect(r.sug).toContain(13);
  expect(r.msgs.join(' ')).toContain('WAF — EC2 연결');
  await buildValidArch(page);
  await page.evaluate(() => { addNode('waf', 120, 440); addNode('waf', 120, 580); });
  await connect(page, 'waf', 'lb', 0, 0);
  await connect(page, 'waf', 'lb', 1, 0);
  r = await verdict(page);
  expect(r.msgs.join(' ')).toContain('WAF가 2개 연결돼 있어요');
  // 요청 경로(사용자 — CloudFront — IGW)에 놓인 CloudFront와 LB에 WAF 하나를 함께 연결
  await buildValidArch(page);
  await page.evaluate(() => { addNode('cloudfront', 120, 160); addNode('waf', 120, 440); });
  await connect(page, 'pc', 'cloudfront');
  await connect(page, 'cloudfront', 'igw');
  await connect(page, 'waf', 'cloudfront');
  await connect(page, 'waf', 'lb');
  r = await verdict(page);
  expect(r.sug).toContain(13);
  expect(r.sug).not.toContain(10);                          // 길이 아니라는 제안(10)은 겹쳐 나오지 않음
  expect(r.msgs.join(' ')).toContain('WAF 하나가 CloudFront와 Load Balancer에 함께 연결돼 있어요');
});

test('CF-01·R53-02: CloudFront—DB, Route 53—EC2는 제거 제안이 나오고, CloudFront가 DB에 이어지면 DB 칭찬이 사라진다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('cloudfront', 120, 160); addNode('route53', 120, 440); });
  await connect(page, 'cloudfront', 'rds');
  await connect(page, 'route53', 'ec2');
  const r = await verdict(page);
  expect(r.sug).toContain(7);
  expect(r.msgs.join(' ')).toContain('CloudFront — RDS 연결');
  expect(r.msgs.join(' ')).toContain('Route 53 — EC2 연결');
  expect(r.praises).not.toContain('V4');
});

test('SRV-08: EC2가 퍼블릭 서브넷에 있으면 오류가 아니라 경고, DB 서브넷이면 오류', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  const moveEc2 = y => page.evaluate(y => {
    const ec2 = state.nodes.filter(n => n.type === 'ec2')[0];
    ec2.x = 480; ec2.y = y;
    recomputeParents(); render();
  }, y);
  await moveEc2(240);                                        // AZ A 퍼블릭 서브넷
  let r = await verdict(page);
  expect(r.status).toBe('warn');
  expect(r.issues).toContain(11);
  expect(r.issues).not.toContain(2);
  expect(r.praises).not.toContain('V2');                     // "앱 서버를 숨겼어요" 칭찬도 사라짐
  expect(r.msgs.join(' ')).toContain('EC2가 퍼블릭 서브넷에 있어요');
  await moveEc2(550);                                        // AZ A DB 서브넷
  r = await verdict(page);
  expect(r.status).toBe('error');
  expect(r.issues).toContain(2);
});

// ----- 데이터 묶음: RDS (criteria/data.md DB-01~05) -----
test('DB-05: DB가 프라이빗 서브넷에 있으면 오류가 아니라 제안, 퍼블릭 서브넷이면 경고, 서브넷 밖이면 오류', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await moveNode(page, 'rds', 520, 400);                     // AZ A 프라이빗 서브넷
  let r = await verdict(page);
  expect(r.status).toBe('ok');
  expect(r.issues).not.toContain(4);
  expect(r.sug).toContain(14);
  expect(r.praises).not.toContain('V4');                     // DB 서브넷이 아니므로 칭찬은 없음
  await moveNode(page, 'rds', 520, 250);                     // AZ A 퍼블릭 서브넷
  r = await verdict(page);
  expect(r.status).toBe('warn');
  expect(r.issues).toContain(12);
  expect(r.issues).not.toContain(4);
  await moveNode(page, 'rds', 520, 160);                     // AZ A 안, 서브넷 밖
  r = await verdict(page);
  expect(r.status).toBe('error');
  expect(r.issues).toContain(4);
});

test('DB-02·03·04·01: Standby에 EC2 연결 / RDS 없는 Replica / RDS보다 Standby가 적음 / AZ가 하나뿐인 VPC', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await connect(page, 'ec2', 'rds-standby');
  let r = await verdict(page);
  expect(r.status).toBe('error');
  expect(r.issues).toContain(13);
  // RDS 2개 + Standby 1개 → 고가용성 경고
  await buildValidArch(page);
  await page.evaluate(() => { addNode('rds', 560, 590); });
  r = await verdict(page);
  expect(r.issues).toContain(7);
  expect(r.msgs.join(' ')).toContain('RDS가 2개인데 RDS Standby가 1개뿐이에요');
  expect(r.praises).not.toContain('V7');
  // RDS는 없고 Replica만 있음
  await buildValidArch(page);
  await page.evaluate(() => {
    state.nodes = state.nodes.filter(n => n.type !== 'rds');
    state.edges = state.edges.filter(e => state.nodes.some(n => n.id === e.from) && state.nodes.some(n => n.id === e.to));
    addNode('rds-replica', 560, 590);
  });
  r = await verdict(page);
  expect(r.issues).toContain(14);
  // AZ B를 지우면 서브넷이 있는 AZ가 하나뿐
  await buildValidArch(page);
  await page.evaluate(() => { deleteContainer(state.containers.find(c => c.label === '가용 영역 B').id); });
  r = await verdict(page);
  expect(r.issues).toContain(15);
});

// ----- 데이터 묶음: ElastiCache·S3·DynamoDB (criteria/data.md CACHE-01, DDB-S-01) -----
test('CACHE-01: ElastiCache는 DB 서브넷과 프라이빗 서브넷에는 놓을 수 있고 퍼블릭 서브넷에는 놓을 수 없다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  const count = () => page.evaluate(() => state.nodes.filter(n => n.type === 'elasticache').length);
  await page.evaluate(() => { addNode('elasticache', 530, 270); });   // AZ A 퍼블릭 서브넷 → 거부
  expect(await count()).toBe(0);
  await page.evaluate(() => { addNode('elasticache', 560, 430); });   // AZ A 프라이빗 서브넷
  expect(await count()).toBe(1);
  await page.evaluate(() => { addNode('elasticache', 640, 590); });   // AZ A DB 서브넷
  expect(await count()).toBe(2);
});

test('DDB-S-01: 프라이빗 EC2가 S3·DynamoDB에 가려면 서비스마다 VPC Endpoints가 이어져야 제안이 사라진다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('s3', 120, 160); addNode('dynamodb', 120, 460); addNode('vpce', 280, 520); });
  await connect(page, 'ec2', 's3');
  await connect(page, 'ec2', 'dynamodb');
  await connect(page, 'vpce', 's3');                         // 엔드포인트는 S3에만 이어짐
  let r = await verdict(page);
  expect(r.sug).toContain(3);
  expect(r.msgs.join(' ')).toContain('EC2가 DynamoDB에 가려면');
  expect(r.msgs.join(' ')).not.toContain('EC2가 S3·DynamoDB에 가려면');
  await connect(page, 'vpce', 'dynamodb');
  r = await verdict(page);
  expect(r.sug).not.toContain(3);
  expect(r.praises).toContain('S3');
});

test('VPCE-02: VPC Endpoints를 IGW·NAT와 잇는 것은 불필요한 연결 제안이 나온다 (오류·경고 아님)', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('vpce', 1200, 110); });   // VPC 안, AZ 밖
  let r = await verdict(page);
  expect(r.msgs.join(' ')).not.toContain('VPC Endpoints는 IGW·NAT 없이');
  await connect(page, 'vpce', 'igw');
  await connect(page, 'vpce', 'nat');
  r = await verdict(page);
  expect(r.sug).toContain(7);
  expect(r.msgs.filter(m => m.includes('VPC Endpoints는 IGW·NAT 없이'))).toHaveLength(2);
  expect(r.status).toBe('ok');                               // 판정은 그대로
});

test('SSM-01: 프라이빗 EC2가 Session Manager와 이어졌는데 NAT도 VPC Endpoints도 없으면 경고한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('sessionmanager', 120, 160); addNode('vpce', 1200, 110); addNode('vpce', 1200, 200); });
  let r = await verdict(page);
  expect(r.issues).not.toContain(16);                        // Session Manager를 안 이었으면 판정 없음
  await connect(page, 'ec2', 'sessionmanager', 0, 0);
  r = await verdict(page);
  expect(r.issues).toContain(16);
  expect(r.status).toBe('warn');
  await connect(page, 'vpce', 'sessionmanager', 0, 0);       // VPC Endpoints로 길이 생김
  r = await verdict(page);
  expect(r.issues).not.toContain(16);
  // 이번엔 VPC Endpoints 대신 NAT 경로 (두 번째 EC2)
  await connect(page, 'ec2', 'sessionmanager', 1, 0);
  await connect(page, 'ec2', 'nat', 1, 0);
  r = await verdict(page);
  expect(r.issues).not.toContain(16);
});

test('SSM-03: Session Manager와 이어지지 않은 EC2가 있으면 제안, 모두 이어지면 칭찬', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  let r = await verdict(page);
  expect(r.sug).toContain(15);
  await page.evaluate(() => { addNode('sessionmanager', 120, 160); });
  await connect(page, 'ec2', 'sessionmanager', 0, 0);
  r = await verdict(page);
  expect(r.sug).toContain(15);                               // 두 번째 EC2는 아직
  expect(r.praises).not.toContain('S15');
  await connect(page, 'ec2', 'sessionmanager', 1, 0);
  r = await verdict(page);
  expect(r.sug).not.toContain(15);
  expect(r.praises).toContain('S15');
});

test('CT-02: CloudTrail·CloudWatch가 따로 있으면 연결 제안, 이어지면 칭찬', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('cloudtrail', 120, 160); addNode('cloudwatch', 120, 460); });
  let r = await verdict(page);
  expect(r.sug).toContain(5);                                // 둘 다 있어도 이어지지 않음
  expect(r.msgs.join(' ')).toContain('CloudTrail과 CloudWatch가 따로');
  expect(r.praises).not.toContain('S5');
  await connect(page, 'cloudtrail', 'cloudwatch');
  r = await verdict(page);
  expect(r.sug).not.toContain(5);
  expect(r.praises).toContain('S5');
});

// ----- 컨테이너 묶음 (criteria/container.md CTR-01~04) -----
test('CTR-01: 컨테이너는 퍼블릭 서브넷에도 놓을 수 있지만 경고하고, 프라이빗 서브넷이면 경고가 없다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('fargate', 530, 270); addNode('ecs', 640, 430); });   // 퍼블릭 / 프라이빗 서브넷 A
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'fargate' || n.type === 'ecs').length)).toBe(2);
  let r = await verdict(page);
  expect(r.issues).toContain(17);
  expect(r.msgs.filter(m => m.includes('퍼블릭 서브넷에 있어요. 공개 IP'))).toHaveLength(1);   // 퍼블릭의 Fargate만
  await moveNode(page, 'fargate', 560, 430);                 // 프라이빗 서브넷으로
  r = await verdict(page);
  expect(r.issues).not.toContain(17);
});

test('CTR-02: 프라이빗 컨테이너가 ECR과 이어졌는데 NAT도 VPC Endpoints도 없으면 경고한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('ecr', 120, 160); addNode('fargate', 560, 430); addNode('vpce', 1200, 110); });
  let r = await verdict(page);
  expect(r.issues).not.toContain(18);                        // ECR과 안 이었으면 판정 없음
  await connect(page, 'fargate', 'ecr');
  r = await verdict(page);
  expect(r.issues).toContain(18);
  await connect(page, 'vpce', 'ecr');                        // ECR용 VPC Endpoints로 길이 생김
  r = await verdict(page);
  expect(r.issues).not.toContain(18);
  // NAT 경로
  await page.evaluate(() => { state.edges = state.edges.filter(e => !state.nodes.some(n => n.type === 'vpce' && (n.id === e.from || n.id === e.to))); render(); });
  r = await verdict(page);
  expect(r.issues).toContain(18);
  await connect(page, 'fargate', 'nat');
  r = await verdict(page);
  expect(r.issues).not.toContain(18);
});

test('CTR-03: EKS는 서브넷이 있는 AZ가 하나뿐이면 오류', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('eks', 560, 430); });
  let r = await verdict(page);
  expect(r.issues).not.toContain(19);
  await page.evaluate(() => { deleteContainer(state.containers.find(c => c.label === '가용 영역 B').id); });
  r = await verdict(page);
  expect(r.issues).toContain(19);
  expect(r.status).toBe('error');
});

test('CTR-04: ECS·EKS와 이어지지 않은 Fargate는 제안한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { addNode('fargate', 560, 430); addNode('ecs', 700, 430); });
  let r = await verdict(page);
  expect(r.sug).toContain(16);
  await connect(page, 'fargate', 'ecs');
  r = await verdict(page);
  expect(r.sug).not.toContain(16);
});

test('LB-07: LB—RDS 연결은 오류·경고는 아니지만 "DB를 숨겼다"는 칭찬은 막는다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  let r = await verdict(page);
  expect(r.praises).toContain('V4');
  await connect(page, 'lb', 'rds');
  r = await verdict(page);
  expect(r.status).toBe('ok');                               // 판정은 그대로 (근거 없음)
  expect(r.praises).not.toContain('V4');
});

test('결과 패널: 접으면 머리 줄만 남고, 경계선을 끌면 높이가 바뀌며, 새로 열어도 기억한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.click('#btn-validate');
  const result = page.locator('#result');
  const stageH = () => page.evaluate(() => document.querySelector('.stage').getBoundingClientRect().height);
  const openStage = await stageH();
  await page.click('.result-fold');                                  // 접기
  await expect(page.locator('#result .issue').first()).toBeHidden();
  expect(await result.evaluate(el => el.offsetHeight)).toBeLessThanOrEqual(46);
  expect(await stageH()).toBeGreaterThan(openStage + 100);           // 캔버스가 넓어짐
  await expect(page.locator('.result-fold')).toHaveText('▲펼치기');

  const grip = await page.locator('#result-grip > div').boundingBox();   // 경계선을 위로 끌면 펼치면서 높이 조절
  const gy = grip.y + grip.height / 2;
  await page.mouse.move(800, gy);
  await page.mouse.down();
  await page.mouse.move(800, gy - 300, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.result-fold')).toHaveText('▼접기');
  const h = await result.evaluate(el => el.offsetHeight);
  expect(h).toBeGreaterThan(300);

  await page.reload();                                               // 새로 열어도 높이 유지
  await page.click('#btn-validate');
  expect(Math.abs(await result.evaluate(el => el.offsetHeight) - h)).toBeLessThanOrEqual(2);
  await page.locator('#result-grip > div').dblclick();               // 두 번 누르면 내용만큼(기본)
  expect(await result.evaluate(el => el.style.height)).toBe('');
});

test('설명 패널: 접으면 제목 줄만 남고, 다른 박스를 골라도 접힌 채로 유지된다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => select(state.nodes.find(n => n.type === 'ec2').id));
  const panel = page.locator('#info-panel');
  const full = await panel.evaluate(el => el.offsetHeight);
  await page.click('#info-panel .ip-fold');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.ip-desc')).toBeHidden();
  expect(await panel.evaluate(el => el.offsetHeight)).toBeLessThan(Math.min(full, 50));
  await page.evaluate(() => select(state.nodes.find(n => n.type === 'rds').id));
  await expect(panel.locator('.ip-name')).toHaveText('RDS');
  await expect(panel.locator('.ip-desc')).toBeHidden();             // 접힌 채로 유지
  await page.click('#info-panel .ip-fold');                          // 다시 펼치기
  await expect(panel.locator('.ip-desc')).toBeVisible();
});
