// 연결선 테스트: 연결 모드, 연결점, 끝점·가운데 손잡이, 박스 피해 가기, 강조
const { test, expect } = require('@playwright/test');
const { openApp, toScreen, drag } = require('./helpers');

// 빈 캔버스에 박스 놓기 (영역 없이)
async function place(page, list) {
  await page.evaluate(list => list.forEach(([t, x, y]) => addNode(t, x, y)), list);
}
const center = (page, i) => page.evaluate(i => centerOf(state.nodes[i]), i);
const edges = page => page.evaluate(() => state.edges);

test('연결 모드에서 박스 두 개를 차례로 클릭하면 연결된다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 600, 300]]);
  await page.click('#btn-connect');
  for (const i of [0, 1]) {
    const c = await center(page, i);
    const p = await toScreen(page, c.x, c.y);
    await page.mouse.click(p.x, p.y);
  }
  const list = await edges(page);
  expect(list).toHaveLength(1);
  expect(list[0].fromSide).toBeNull();                      // 몸통 클릭 = 자동 연결 변
});

test('연결점(변 중앙)을 클릭하면 그 변으로 연결된다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 600, 300]]);
  await page.click('#btn-connect');
  const c0 = await center(page, 0);
  const body = await toScreen(page, c0.x, c0.y);
  await page.mouse.move(body.x, body.y);                    // 마우스를 올려야 연결점이 보인다
  const bottom = await page.evaluate(() => anchorPoint(state.nodes[0], 'bottom'));
  const bp = await toScreen(page, bottom.x, bottom.y);
  await page.mouse.click(bp.x, bp.y);
  const c1 = await center(page, 1);
  const p1 = await toScreen(page, c1.x, c1.y);
  await page.mouse.click(p1.x, p1.y);
  expect((await edges(page))[0].fromSide).toBe('bottom');
});

test('끝점 손잡이를 끌어 연결 변을 여러 번 연속으로 바꿀 수 있다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 500, 200], ['iam', 500, 500], ['dynamodb', 300, 500], ['cloudwatch', 700, 500]]);
  await page.evaluate(() => {
    const [a, b, c, d] = state.nodes;
    for (const [x, y] of [[a, b], [c, b], [d, b]]) state.edges.push({ id: newId('e'), from: x.id, to: y.id, fromSide: null, toSide: null, mid: null });
    render();
    select(state.edges[0].id);
  });
  for (const side of ['right', 'bottom', 'left', 'top']) {
    const end = await page.evaluate(() => { const p = edgeRoute(state.edges[0]).points; return p[p.length - 1]; });
    const target = await page.evaluate(s => anchorPoint(state.nodes[1], s), side);
    await drag(page, await toScreen(page, end.x, end.y), await toScreen(page, target.x, target.y));
    expect((await edges(page))[0].toSide).toBe(side);
  }
});

test('가운데 손잡이로 경로를 옮기고, 더블클릭하면 자동으로 돌아간다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 700, 500]]);
  await page.evaluate(() => {
    state.edges.push({ id: newId('e'), from: state.nodes[0].id, to: state.nodes[1].id, fromSide: null, toSide: null, mid: null });
    render();
    select(state.edges[0].id);
  });
  const r = await page.evaluate(() => edgeRoute(state.edges[0]));
  const from = await toScreen(page, r.handle.x, r.handle.y);
  const to = r.axis === 'x' ? await toScreen(page, r.handle.x + 60, r.handle.y) : await toScreen(page, r.handle.x, r.handle.y + 60);
  await drag(page, from, to);
  const moved = (await edges(page))[0];
  expect(moved.mid).not.toBeNull();
  const r2 = await page.evaluate(() => edgeRoute(state.edges[0]));
  const h = await toScreen(page, r2.handle.x, r2.handle.y);
  await page.mouse.dblclick(h.x, h.y);
  const reset = (await edges(page))[0];
  expect([reset.mid, reset.fromSide, reset.toSide]).toEqual([null, null, null]);
});

test('자동 경로는 사이에 있는 박스를 피해 간다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 500, 300], ['dynamodb', 800, 300]]);
  const crossings = await page.evaluate(() => {
    state.edges.push({ id: newId('e'), from: state.nodes[0].id, to: state.nodes[2].id, fromSide: null, toSide: null, mid: null });
    render();
    return edgeRoute(state.edges[0]).crossings;
  });
  expect(crossings).toBe(0);
});

test('연결선에 마우스를 올리면 그 선만 강조된다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 700, 300], ['dynamodb', 200, 600], ['cloudwatch', 700, 600]]);
  await page.evaluate(() => {
    const [a, b, c, d] = state.nodes;
    state.edges.push({ id: newId('e'), from: a.id, to: b.id, fromSide: null, toSide: null, mid: null });
    state.edges.push({ id: newId('e'), from: c.id, to: d.id, fromSide: null, toSide: null, mid: null });
    render();
  });
  const mid = await page.evaluate(() => { const p = edgeRoute(state.edges[0]).points; return { x: (p[0].x + p[p.length - 1].x) / 2, y: p[0].y }; });
  const m = await toScreen(page, mid.x, mid.y);
  await page.mouse.move(m.x, m.y);
  await expect(page.locator('#edge-layer')).toHaveClass(/dimmed/);
  await expect(page.locator('.edge.hl')).toHaveCount(1);
  await expect(page.locator('.node.edge-end')).toHaveCount(2);
  await page.mouse.move(m.x, m.y + 150);
  await expect(page.locator('#edge-layer')).not.toHaveClass(/dimmed/);
});
