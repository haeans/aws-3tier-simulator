// 비용 테스트 (47번): 서울 온디맨드 가격으로 월 비용 계산(costOf), 결과 패널 [비용] 탭, [비교] 비용 줄, 설정 칸의 한 줄
const { test, expect } = require('@playwright/test');
const { openApp, toScreen } = require('./helpers');

async function clickEl(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const rowsOf = c => c.rows.map(r => `${r.name} ×${r.count}`);

test('기본 3-Tier: ALB·NAT·EC2 2대·RDS·Standby의 시간 요금 × 730시간, IGW는 무료', async ({ page }) => {
  await openApp(page);
  const c = await page.evaluate(() => { loadExample('basic'); return costOf(); });
  expect(rowsOf(c)).toEqual(['NAT 게이트웨이 ×1', 'Load Balancer ALB ×1', 'EC2 t3.medium ×2', 'RDS db.t3.medium ×1', 'RDS Standby (Multi-AZ 예비본) db.t3.medium ×1']);
  expect(c.total).toBeCloseTo((0.059 + 0.0225 + 0.052 * 2 + 0.104 * 2) * 730, 6);
  expect(c.free).toEqual(['IGW']);
  expect(c.usage).toEqual([]);
});

test('크기·Multi-AZ·Auto Scaling 최소 대수·Fargate·VPC Endpoints·월 고정 요금이 반영된다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('basic');
    state.nodes.filter(n => n.type === 'ec2').forEach(n => { n.size = 'large'; });
    const large = costOf().rows.find(x => x.name.startsWith('EC2'));
    // RDS + Standby = Multi-AZ 값 (Single-AZ의 2배)
    const multi = costOf().rows.filter(x => x.name.startsWith('RDS')).reduce((s, x) => s + x.monthly, 0);
    loadExample('ha');
    const asg = state.containers.find(c => c.type === 'asg');
    asg.asgMin = 4;
    const ha = costOf();
    loadExample('container');
    const ct = costOf();
    return { large, multi, haEc2: ha.rows.find(x => x.name.startsWith('EC2')), haRows: rowsOf(ha), haUsage: ha.usage, ct: rowsOf(ct), ctFree: ct.free, ctUsage: ct.usage,
      fargate: ct.rows.find(x => x.name.startsWith('Fargate')).unit, vpce: ct.rows.find(x => x.name.startsWith('VPC')).unit };
    function rowsOf(c) { return c.rows.map(r => `${r.name} ×${r.count}`); }
  });
  expect(r.large.name).toBe('EC2 t3.large');
  expect(r.large.monthly).toBeCloseTo(0.104 * 2 * 730, 6);
  expect(r.multi).toBeCloseTo(0.208 * 730, 6);
  expect(r.haEc2.count).toBe(4);
  expect(r.haEc2.note).toContain('최소 대수 기준');
  expect(r.haRows).toContain('WAF 웹 ACL + 규칙 1개 ×2');
  expect(r.haRows).toContain('Route 53 호스팅 영역 ×1');
  expect(r.haUsage).toEqual(['CloudFront', 'Session Manager', 'CloudWatch', 'CloudTrail']);
  expect(r.fargate).toBeCloseTo((0.5 * 0.04656 + 1 * 0.00511) * 730, 6);
  expect(r.vpce).toBeCloseTo(0.013 * 1 * 2 * 730, 6);                                   // 인터페이스 1개(ECR) × AZ 2곳
  expect(r.ctFree).toEqual(['IGW', 'ECS']);
  expect(r.ctUsage).toEqual(['ECR']);
});

test('[비용] 탭을 누르면 합계와 내역·가격 링크가 나오고, [비교] 탭에 월 비용 줄, 설정 칸에 1대 월 비용이 나온다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('basic'));
  await clickEl(page, '.result-head .tab[data-tab="cost"]');
  await expect(page.locator('.result-head .cost-total')).toHaveText('월 약 $287');
  await expect(page.locator('.cost-table tbody tr')).toHaveCount(6);                    // 5개 + 합계
  await expect(page.locator('.cost-table a').first()).toHaveAttribute('href', /aws\.amazon\.com\/vpc\/pricing/);
  await expect(page.locator('.cost-notes')).toContainText('저장 공간');
  // 비교: 기본 → 고가용성은 비용이 늘어남 (빨강)
  await page.evaluate(() => { captureCompareA(); loadExample('ha'); });
  await clickEl(page, '.result-head .tab[data-tab="compare"]');
  const row = page.locator('.compare-table tr', { has: page.locator('td.compare-name', { hasText: '월 비용' }) });
  await expect(row.locator('td').nth(1)).toHaveText('$287');
  await expect(row.locator('td').last()).toHaveClass('worse');
  // 설정 칸
  const c = await page.evaluate(() => centerOf(state.nodes.find(n => n.type === 'ec2')));
  const p = await toScreen(page, c.x, c.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#info-panel .ip-set')).toContainText('1대 월 약 $38');
});
