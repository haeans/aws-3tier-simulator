// 구성 두 개 비교 테스트 (44번): 비교 계산(compareConfigs), 결과 패널 [비교] 탭 — A로 담기·표·달라진 점·트래픽 고르기·A 불러오기·저장
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

async function clickEl(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const snapOf = page => page.evaluate(() => JSON.parse(stateJSON()));
// 표의 한 줄 [A, B, 차이] 글자
const rowOf = (page, name) => page.locator('.compare-table tr', { has: page.locator('td.compare-name', { hasText: name }) })
  .locator('td').evaluateAll(tds => tds.slice(1).map(td => td.textContent));

test('비교 계산: 기본 3-Tier → 고가용성은 제안이 줄고, 같은 트래픽과 한 AZ 장애에서 성공률이 높다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const snap = () => JSON.parse(stateJSON());
    loadExample('basic'); const a = snap();
    loadExample('ha'); const b = snap();
    return compareConfigs(a, b, 300);
  });
  expect([r.a.status, r.b.status]).toEqual(['ok', 'ok']);
  expect(r.a.sugs.length).toBeGreaterThan(0);
  expect(r.b.sugs).toEqual([]);
  expect(r.b.traffic.successRate).toBeGreaterThan(r.a.traffic.successRate);
  expect(r.b.az.rate).toBe(1);                                                    // 고가용성은 한 AZ가 멈춰도 모두 처리
  expect(r.a.az.rate).toBeLessThan(r.b.az.rate);
  expect(r.boxes.find(x => x.type === 'elasticache')).toEqual({ type: 'elasticache', name: 'ElastiCache', a: 0, b: 2 });
  expect(r.sugGone.map(x => x.title)).toContain('DB 캐싱');
  expect(r.sugNew).toEqual([]);
});

test('비교 계산: 판정이 오류인 구성은 트래픽·AZ 장애를 계산하지 않는다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => { loadExample('basic'); const a = JSON.parse(stateJSON()); a.edges = a.edges.slice(1); return compareSummary(a, 300); });
  expect(r.status).toBe('error');
  expect([r.traffic, r.az]).toEqual([null, null]);
});

test('[비교] 탭: A로 담고 다른 구성을 불러오면 표와 달라진 점이 나오고, 트래픽을 바꾸면 다시 계산한다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('basic'));
  await clickEl(page, '.result-head .tab[data-tab="compare"]');
  await expect(page.locator('.compare-table')).toHaveCount(0);                     // 담기 전에는 안내와 버튼만
  await clickEl(page, '#compare-capture');
  await expect(page.locator('#toast')).toContainText('A로 담았어요');
  expect(await rowOf(page, '제안')).toEqual(['8개', '8개', '같음']);               // 아직 같은 구성
  await page.evaluate(() => loadExample('ha'));
  expect(await rowOf(page, '제안')).toEqual(['8개', '0개', '▼ 8개']);
  await expect(page.locator('.compare-table tr', { hasText: '제안' }).locator('td').last()).toHaveClass('better');
  const az = await rowOf(page, '한 AZ가 멈추면');
  expect(az[1]).toContain('100%');
  await expect(page.locator('.compare-diff')).toContainText('+ElastiCache 2개');
  await expect(page.locator('.compare-diff')).toContainText('DB 캐싱');
  const at300 = await rowOf(page, '처리한 요청');
  await clickEl(page, '#compare-rps-1000');
  await expect(page.locator('#compare-rps-1000')).toHaveClass(/active/);
  expect(await rowOf(page, '처리한 요청')).not.toEqual(at300);
});

test('[A 불러오기]는 캔버스를 A로 바꾸고 되돌리기 한 번으로 돌아오며, 담은 A와 트래픽은 다시 열어도 남는다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { loadExample('container'); captureCompareA(); loadExample('ha'); resultTab = 'compare'; render(); });
  const a = await page.evaluate(() => compareA.s);
  const ha = await snapOf(page);
  await clickEl(page, '#compare-rps-100');
  await page.reload();
  await clickEl(page, '.result-head .tab[data-tab="compare"]');
  await expect(page.locator('#compare-rps-100')).toHaveClass(/active/);
  await clickEl(page, '#compare-load');                                             // 확인 창은 자동 승인
  expect(await snapOf(page)).toEqual(a);
  expect(await rowOf(page, '제안')).toEqual(['5개', '5개', '같음']);
  await clickEl(page, '#btn-undo');
  expect(await snapOf(page)).toEqual(ha);
});
