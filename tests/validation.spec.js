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
  expect(ids).toEqual([1, 2, 4, 5]);                         // DB 캐싱, CDN 사용, 자동 확장(EC2 2대), 모니터링·감사
  await expect(page.locator('.issue.improve')).toHaveCount(4);
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
  // RDS→EC2로 저장된 연결도 EC2→RDS 방향으로 흐른다 (EC2가 위, RDS가 아래 → y 증가)
  const sample = () => page.evaluate(() => {
    const ed = state.edges.find(e => [e.from, e.to].includes(state.nodes.find(n => n.type === 'rds').id));
    return { reverse: validation.flow.find(f => f.id === ed.id).reverse,
             y: +flowDots.find(d => d.f.id === ed.id).dot.getAttribute('cy') };
  });
  const a = await sample();
  await page.waitForTimeout(250);
  const b = await sample();
  expect(a.reverse).toBe(true);
  expect(b.y).toBeGreaterThan(a.y);
  // 박스를 옮기면 검증 결과와 흐름 점이 사라진다
  const ec2 = await page.evaluate(() => state.nodes.find(n => n.type === 'ec2' && n.x > 700));
  await dragWorld(page, { x: ec2.x + 50, y: ec2.y + 30 }, { x: ec2.x + 90, y: ec2.y + 30 });
  await expect(page.locator('.flow-dot')).toHaveCount(0);
  await expect(page.locator('#result')).toContainText('구성이 바뀌었어요');
});

test('결과 목록의 항목을 클릭하면 해당 박스가 선택된다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.evaluate(() => { state.nodes.find(n => n.type === 'lb').y = 1200; recomputeParents(); render(); });   // LB를 VPC 밖으로
  await page.click('#btn-validate');
  await page.locator('.issue.error', { hasText: 'Load Balancer는 퍼블릭 서브넷에' }).click();
  const selectedType = await page.evaluate(() => state.nodes.find(n => n.id === selectedId)?.type);
  expect(selectedType).toBe('lb');
});
