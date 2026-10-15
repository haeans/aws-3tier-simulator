// 검증·제안·동적 흐름 테스트
const { test, expect } = require('@playwright/test');
const { openApp, buildValidArch, dragWorld } = require('./helpers');

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
  expect(ids).toEqual([1, 2, 4, 5, 8, 9]);                   // DB 캐싱, CDN 사용, 자동 확장(EC2 2대), 모니터링·감사, DNS, 웹 방화벽
  await expect(page.locator('.issue.improve')).toHaveCount(6);
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
