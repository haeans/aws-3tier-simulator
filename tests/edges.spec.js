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

test('같은 줄에서 겹치는 연결선은 옆으로 벌려 그리고, 사용자가 옮긴 선은 그대로 둔다', async ({ page }) => {
  await openApp(page);
  await place(page, [['pc', 150, 150], ['s3', 650, 450], ['pc', 150, 250], ['s3', 650, 550]]);
  // 두 선의 자동 경로는 가운데 세로 구간이 같은 x(400)에서 겹친다
  const midXs = () => page.evaluate(() => state.edges.map(ed => {
    const pts = edgePoints.get(ed.id);
    const seg = pts.slice(1).find((p, i) => p.x === pts[i].x && p.y !== pts[i].y);
    return seg.x;
  }));
  await page.evaluate(() => {
    const [a1, b1, a2, b2] = state.nodes;
    state.edges.push({ id: newId('e'), from: a1.id, to: b1.id, fromSide: null, toSide: null, mid: null });
    state.edges.push({ id: newId('e'), from: a2.id, to: b2.id, fromSide: null, toSide: null, mid: null });
    render();
  });
  const [x1, x2] = await midXs();
  expect(x1).toBe(400);
  expect(Math.abs(x2 - x1)).toBe(8);

  // 두 번째 선을 사용자가 x=400에 고정하면, 그 선은 그대로 있고 자동 선이 비켜난다
  await page.evaluate(() => {
    const ed = state.edges[1];
    Object.assign(ed, { fromSide: 'right', toSide: 'left', mid: { axis: 'x', value: 400 } });
    render();
  });
  const [y1, y2] = await midXs();
  expect(y2).toBe(400);
  expect(Math.abs(y1 - y2)).toBe(8);
  expect((await page.evaluate(() => state.edges[1].mid)).value).toBe(400);   // 저장 데이터는 그대로
});

// 그려진 연결선끼리 같은 줄에서 겹치는 곳이 몇 군데인지
const overlapCount = page => page.evaluate(() => {
  const segs = [...edgePoints].map(([id, pts]) => pts.slice(1).map((q, i) => ({ id, p: pts[i], q })));
  let n = 0;
  segs.forEach((A, i) => segs.slice(i + 1).forEach(B =>
    A.forEach(a => B.forEach(b => { if (segsOverlap(a.p, a.q, b.p, b.q)) n++; }))));
  return n;
});
const link = (page, pairs) => page.evaluate(pairs => {
  pairs.forEach(([i, j]) => state.edges.push({ id: newId('e'), from: state.nodes[i].id, to: state.nodes[j].id, fromSide: null, toSide: null, mid: null }));
  render();
}, pairs);

test('한 변에서 여러 선이 나가면 연결점을 나눠 놓는다', async ({ page }) => {
  await openApp(page);
  await place(page, [['pc', 150, 300], ['s3', 650, 160], ['s3', 650, 440]]);
  await link(page, [[0, 1], [0, 2]]);
  const starts = await page.evaluate(() => state.edges.map(ed => edgePoints.get(ed.id)[0]));
  expect(starts[0].x).toBe(starts[1].x);                     // 같은 변(오른쪽)
  expect(starts[1].y - starts[0].y).toBe(12);                // 위쪽 상대는 위 연결점, 아래쪽 상대는 아래 연결점
  expect(await overlapCount(page)).toBe(0);
});

test('줄 맞춰 놓인 박스 사이에서 다른 선끼리 겹치지 않게 비켜 그린다', async ({ page }) => {
  await openApp(page);
  // 1→2 선과 3→4 선이 그대로 그리면 y=270 줄에서 겹친다 (연결하지 않은 1과 4가 이어진 것처럼 보임)
  await place(page, [['pc', 400, 270], ['s3', 880, 430], ['pc', 400, 430], ['s3', 650, 270]]);
  await link(page, [[0, 1], [2, 3]]);
  expect(await overlapCount(page)).toBe(0);
});
