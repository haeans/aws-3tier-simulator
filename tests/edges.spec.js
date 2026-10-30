// 연결선 테스트: 연결점 끌기, 끝점·가운데 손잡이, 박스 피해 가기, 강조
const { test, expect } = require('@playwright/test');
const { openApp, toScreen, drag } = require('./helpers');

// 빈 캔버스에 박스 놓기 (영역 없이)
async function place(page, list) {
  await page.evaluate(list => list.forEach(([t, x, y]) => addNode(t, x, y)), list);
}
const center = (page, i) => page.evaluate(i => centerOf(state.nodes[i]), i);
const edges = page => page.evaluate(() => state.edges);

// 박스 i의 연결점(side) 화면 좌표 (마우스를 먼저 올려야 연결점이 보인다)
async function anchorScreen(page, i, side) {
  const c = await center(page, i);
  const body = await toScreen(page, c.x, c.y);
  await page.mouse.move(body.x, body.y);
  const a = await page.evaluate(([i, s]) => anchorPoint(state.nodes[i], s), [i, side]);
  return toScreen(page, a.x, a.y);
}

test('연결점을 끌어 다른 박스 몸통에 놓으면 연결된다 (양 끝 자동)', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 600, 300]]);
  await expect(page.locator('#btn-connect')).toHaveCount(0);   // 연결 모드 탭은 없어짐
  const from = await anchorScreen(page, 0, 'right');
  const c1 = await center(page, 1);
  await drag(page, from, await toScreen(page, c1.x, c1.y));
  const list = await edges(page);
  expect(list).toHaveLength(1);
  expect(list[0].fromSide).toBeNull();                      // 몸통에 놓으면 양 끝 자동 (박스를 피하는 경로)
  expect(list[0].toSide).toBeNull();
});

test('연결점을 끌어 다른 박스의 연결점에 놓으면 그 변끼리 연결된다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 600, 300]]);
  const from = await anchorScreen(page, 0, 'bottom');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const to = await anchorScreen(page, 1, 'top');            // 끄는 중에 도착 박스에 올리면 연결점이 보인다
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const e = (await edges(page))[0];
  expect(e.fromSide).toBe('bottom');
  expect(e.toSide).toBe('top');
});

test('연결점을 빈 곳에 놓거나 Esc를 누르면 연결되지 않고, 박스 몸통을 끌면 이동한다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 600, 300]]);
  const from = await anchorScreen(page, 0, 'right');
  await drag(page, from, await toScreen(page, 400, 600));   // 빈 곳에 놓기
  expect(await edges(page)).toHaveLength(0);
  const from2 = await anchorScreen(page, 0, 'right');
  await page.mouse.move(from2.x, from2.y);
  await page.mouse.down();
  const c1 = await center(page, 1);
  const p1 = await toScreen(page, c1.x, c1.y);
  await page.mouse.move(p1.x, p1.y, { steps: 4 });
  await page.keyboard.press('Escape');                      // 놓기 전에 Esc → 취소
  await page.mouse.up();
  expect(await edges(page)).toHaveLength(0);
  const x0 = await page.evaluate(() => state.nodes[0].x);
  const c0 = await center(page, 0);
  const b0 = await toScreen(page, c0.x, c0.y);
  await drag(page, b0, { x: b0.x + 100, y: b0.y });          // 몸통 끌기 = 이동
  expect(await page.evaluate(() => state.nodes[0].x)).toBe(x0 + 100);
  expect(await edges(page)).toHaveLength(0);
});

test('연결점을 클릭한 뒤 도착 박스를 클릭해도 연결되고, 대기 중에 빈 곳을 누르면 취소된다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 600, 300], ['dynamodb', 200, 600]]);
  const x1 = await page.evaluate(() => state.nodes[1].x);
  const from = await anchorScreen(page, 0, 'right');
  await page.mouse.click(from.x, from.y);                   // 클릭만 → 대기
  expect(await page.evaluate(() => connectFrom)).not.toBeNull();
  const c1 = await center(page, 1);
  const p1 = await toScreen(page, c1.x, c1.y);
  await page.mouse.click(p1.x, p1.y);                        // 도착 박스 클릭 → 연결
  let list = await edges(page);
  expect(list).toHaveLength(1);
  expect(list[0].fromSide).toBeNull();                       // 몸통을 누르면 양 끝 자동
  expect(await page.evaluate(() => state.nodes[1].x)).toBe(x1);   // 도착 박스는 움직이지 않음

  const from2 = await anchorScreen(page, 0, 'bottom');
  await page.mouse.click(from2.x, from2.y);
  const blank = await toScreen(page, 600, 700);
  await page.mouse.click(blank.x, blank.y);                  // 빈 곳 클릭 → 취소
  expect(await page.evaluate(() => connectFrom)).toBeNull();
  const c2 = await center(page, 2);
  const p2 = await toScreen(page, c2.x, c2.y);
  await page.mouse.click(p2.x, p2.y);                        // 취소 뒤에는 박스를 눌러도 연결 안 됨
  expect(await edges(page)).toHaveLength(1);
});

test('연결 대기 중에 스페이스바+끌기로 화면을 옮긴 뒤 연결점을 클릭하면 그 변끼리 연결된다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 1500, 300]]);
  const from = await anchorScreen(page, 0, 'right');
  await page.mouse.click(from.x, from.y);                   // 대기
  await page.keyboard.down('Space');
  await page.mouse.move(1200, 500);
  await page.mouse.down();
  await page.mouse.move(700, 500, { steps: 6 });             // 화면을 오른쪽으로 500px 옮김
  await page.mouse.up();
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => $wrap.scrollLeft)).toBe(500);
  expect(await page.evaluate(() => connectFrom)).not.toBeNull();   // 대기 유지
  const to = await anchorScreen(page, 1, 'left');
  await page.mouse.click(to.x, to.y);
  const e = (await edges(page))[0];
  expect(e.fromSide).toBe('right');
  expect(e.toSide).toBe('left');
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

// 경로의 모든 구간이 가로 또는 세로인지
const allOrthogonal = pts => pts.slice(1).every((q, i) => q.x === pts[i].x || q.y === pts[i].y);

test('가운데 손잡이를 아무 방향으로 끌면 선이 그 점을 지나가고 (아래로 끌면 U자), 직각은 유지된다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 700, 300]]);
  await page.evaluate(() => {
    state.edges.push({ id: newId('e'), from: state.nodes[0].id, to: state.nodes[1].id, fromSide: null, toSide: null, mid: null });
    render();
    select(state.edges[0].id);
  });
  const r = await page.evaluate(() => edgeRoute(state.edges[0]));
  const from = await toScreen(page, r.handle.x, r.handle.y);
  await drag(page, from, await toScreen(page, r.handle.x + 40, r.handle.y + 200));   // 대각선 아래로
  const ed = (await edges(page))[0];
  expect(ed.mid).toEqual({ x: r.handle.x + 40, y: r.handle.y + 200 });
  const r2 = await page.evaluate(() => edgeRoute(state.edges[0]));
  expect(r2.handle).toEqual(ed.mid);                                                     // 손잡이는 놓은 자리
  expect(allOrthogonal(r2.points)).toBe(true);
  expect(Math.max(...r2.points.map(p => p.y))).toBe(ed.mid.y);                          // 박스 아래로 돌아감 (U자)
  const onPath = r2.points.slice(1).some((q, i) => {                                     // 선이 그 점을 지남
    const p = r2.points[i];
    return (p.x === q.x && p.x === ed.mid.x && ed.mid.y >= Math.min(p.y, q.y) && ed.mid.y <= Math.max(p.y, q.y)) ||
           (p.y === q.y && p.y === ed.mid.y && ed.mid.x >= Math.min(p.x, q.x) && ed.mid.x <= Math.max(p.x, q.x));
  });
  expect(onPath).toBe(true);
});

test('두 박스 사이에서 옆으로만 끌면 예전처럼 가운데 세로 구간 하나만 옮겨진다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 700, 400]]);
  await page.evaluate(() => {
    state.edges.push({ id: newId('e'), from: state.nodes[0].id, to: state.nodes[1].id, fromSide: null, toSide: null, mid: null });
    render();
    select(state.edges[0].id);
  });
  const r = await page.evaluate(() => edgeRoute(state.edges[0]));
  await drag(page, await toScreen(page, r.handle.x, r.handle.y), await toScreen(page, r.handle.x + 60, r.handle.y));
  const r2 = await page.evaluate(() => edgeRoute(state.edges[0]));
  expect(r2.points).toHaveLength(4);                                                     // 가로 → 세로 → 가로 (꺾임 2번)
  expect(r2.points[1].x).toBe(r.handle.x + 60);
});

test('양 끝 박스를 함께 옮기면 손잡이를 놓은 점도 끄는 동안부터 같이 옮겨져 모양이 유지된다', async ({ page }) => {
  await openApp(page);
  await place(page, [['s3', 200, 300], ['iam', 700, 300]]);
  await page.evaluate(() => {
    const [a, b] = state.nodes;
    state.edges.push({ id: newId('e'), from: a.id, to: b.id, fromSide: null, toSide: null, mid: { x: 460, y: 500 } });
    select(null);
    render();
  });
  const c0 = await center(page, 0), c1 = await center(page, 1);
  const p0 = await toScreen(page, c0.x, c0.y), p1 = await toScreen(page, c1.x, c1.y);
  await page.keyboard.down('Shift');                         // Shift+클릭으로 두 박스 선택
  await page.mouse.click(p0.x, p0.y);
  await page.mouse.click(p1.x, p1.y);
  await page.keyboard.up('Shift');
  const t = await toScreen(page, c0.x + 40, c0.y + 60);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(t.x, t.y, { steps: 6 });
  const during = await page.evaluate(() => edgeRoute(state.edges[0]).handle);   // 놓기 전
  expect(during).toEqual({ x: 500, y: 560 });
  await page.mouse.up();
  expect((await edges(page))[0].mid).toEqual({ x: 500, y: 560 });               // 놓은 뒤
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

test('가까이 붙은 두 박스(마주 보는 변 사이가 좁음)는 빙 돌지 않고 바로 이어진다', async ({ page }) => {
  await openApp(page);
  for (const dy of [0, 30]) {                                 // 같은 높이 → 일직선, 조금 어긋남 → 작은 Z자
    const r = await page.evaluate(dy => {
      state.nodes = []; state.edges = [];
      addNode('s3', 200, 300); addNode('iam', 320, 300 + dy); // 두 박스 사이 20px
      state.edges.push({ id: newId('e'), from: state.nodes[0].id, to: state.nodes[1].id, fromSide: null, toSide: null, mid: null });
      render();
      const [a, b] = state.nodes;
      return { pts: edgeRoute(state.edges[0]).points, lo: a.x + NODE_W, hi: b.x };   // 두 박스 사이 (격자에 맞춰진 실제 위치)
    }, dy);
    expect(r.pts.length).toBeLessThanOrEqual(4);
    expect(r.hi - r.lo).toBe(20);
    expect(Math.min(...r.pts.map(p => p.x))).toBeGreaterThanOrEqual(r.lo);   // 두 박스 사이에서만 (바깥으로 돌아 나가지 않음)
    expect(Math.max(...r.pts.map(p => p.x))).toBeLessThanOrEqual(r.hi);
  }
});
