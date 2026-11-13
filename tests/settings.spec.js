// 간단한 설정값 테스트 (46번): 서버·DB 크기, Auto Scaling 최소·최대·목표 사용률 — 계산 반영·설명 패널·캔버스 표시·비교·예전 저장
const { test, expect } = require('@playwright/test');
const { openApp, toScreen } = require('./helpers');

async function clickNode(page, type, i = 0) {
  const c = await page.evaluate(([t, i]) => centerOf(state.nodes.filter(n => n.type === t)[i]), [type, i]);
  const p = await toScreen(page, c.x, c.y);
  await page.mouse.click(p.x, p.y);
}
async function clickEl(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

test('크기는 처리량을 바꾸고(작게 ½, 크게 2배), 값이 없거나 알 수 없으면 보통이다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('basic');
    const ec2 = state.nodes.find(n => n.type === 'ec2'), rds = state.nodes.find(n => n.type === 'rds');
    const caps = [];
    caps.push(perfCapacity(ec2));
    ec2.size = 'large'; caps.push(perfCapacity(ec2));
    ec2.size = 'small'; caps.push(perfCapacity(ec2));
    ec2.size = 'huge'; caps.push(perfCapacity(ec2));                                // 알 수 없는 값 → 보통
    rds.size = 'large'; caps.push(perfCapacity(rds));
    caps.push(perfCapacity(state.nodes.find(n => n.type === 'lb')));                 // 제한 없는 박스
    return caps;
  });
  expect(r).toEqual([100, 200, 50, 100, 600, null]);
});

test('설명 패널에서 서버 크기를 [크게]로 바꾸면 캔버스에 표시되고, 같은 트래픽의 성공률이 오르며, 되돌리기로 돌아간다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('basic'));
  const before = await page.evaluate(() => simulateTraffic(300).successRate);
  for (const i of [0, 1]) {
    await clickNode(page, 'ec2', i);
    await expect(page.locator('#info-panel .ip-set b')).toHaveText('서버 크기');
    await clickEl(page, '#info-panel .ip-size[data-size="large"]');
    await expect(page.locator('#info-panel .ip-size.active')).toHaveText('크게');
  }
  await expect(page.locator('#info-panel .ip-set-hint')).toContainText('초당 200요청');
  await expect(page.locator('#node-layer .node-size')).toHaveText(['크게', '크게']);
  const after = await page.evaluate(() => simulateTraffic(300).successRate);
  expect(before).toBeLessThan(1);
  expect(after).toBe(1);
  await clickEl(page, '#btn-undo');
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'ec2').map(n => nodeSize(n)))).toEqual(['large', 'medium']);
  // [보통]으로 되돌리면 저장값을 지운다 (예전 저장 형식과 같게)
  await clickNode(page, 'ec2', 0);
  await clickEl(page, '#info-panel .ip-size[data-size="medium"]');
  expect(await page.evaluate(() => state.nodes.some(n => 'size' in n))).toBe(false);
  await expect(page.locator('#node-layer .node-size')).toHaveCount(0);
});

test('Auto Scaling 그룹: 패널에서 최소·최대·목표를 바꾸면 시뮬레이션이 그 값으로 시작하고, 범위를 벗어난 값은 경계로 맞춘다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { loadExample('ha'); select(state.containers.find(c => c.type === 'asg').id); });
  await expect(page.locator('#info-panel .ip-name')).toHaveText('Auto Scaling 그룹');
  const val = key => page.locator(`#info-panel .ip-num[data-key="${key}"]`).inputValue();
  expect([await val('asgMin'), await val('asgMax'), await val('asgTarget')]).toEqual(['2', '6', '50']);   // 기본값
  const setNum = async (key, v) => {
    await clickEl(page, `#info-panel .ip-num[data-key="${key}"]`);
    await page.keyboard.press('Control+A');
    await page.keyboard.type(String(v));
    await page.keyboard.press('Enter');
  };
  await setNum('asgMin', 4);
  await setNum('asgTarget', 70);
  await setNum('asgMax', 1);                                                         // 최소보다 작음 → 최소로
  const r = await page.evaluate(() => {
    const area = state.containers.find(c => c.type === 'asg');
    const f = createFaults();
    simFaultOptions(f);                                                              // 그룹 상태를 만든다
    const g = f.asg.get(area.id);
    return { saved: [area.asgMin, area.asgMax, area.asgTarget], running: asgRunning(g), min: g.min, max: g.max, target: g.target };
  });
  expect(r).toEqual({ saved: [4, 4, 70], running: 4, min: 4, max: 4, target: 0.7 });
  // 최소를 박스 수보다 작게 넣어도 박스 수로
  expect(await page.evaluate(() => asgSettings({ asgMin: 0, asgMax: 99, asgTarget: 5 }, 2))).toEqual({ min: 2, max: 30, target: 0.3 });
});

test('[비교] 탭의 달라진 점에 설정 차이가 나온다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('basic');
    const a = JSON.parse(stateJSON());
    state.nodes.filter(n => n.type === 'ec2').forEach(n => { n.size = 'large'; });
    state.nodes.find(n => n.type === 'rds').size = 'small';
    return compareConfigs(a, JSON.parse(stateJSON()), 300).settings;
  });
  expect(r).toEqual(['EC2 크기: 보통 2 → 크게 2', 'RDS 크기: 보통 1 → 작게 1']);
});
