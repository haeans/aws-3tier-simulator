// 성능 시뮬레이션 테스트
const { test, expect } = require('@playwright/test');
const { openApp, buildValidArch } = require('./helpers');

// 기본 구성 + 두 번째 EC2도 RDS와 연결 (모든 EC2가 DB를 쓰는 구성)
async function buildSimArch(page) {
  await buildValidArch(page);
  await page.evaluate(() => {
    const ec2 = state.nodes.filter(n => n.type === 'ec2')[1], rds = state.nodes.find(n => n.type === 'rds');
    state.edges.push({ id: newId('e'), from: ec2.id, to: rds.id, fromSide: null, toSide: null, mid: null });
    render();
  });
}

test('계산: LB가 EC2 2대에 나누고, EC2가 넘치면 넘친 요청은 실패한다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);   // PC → IGW → LB → EC2 2대 → RDS
  const run = rps => page.evaluate(r => {
    const res = simulateTraffic(r);
    const of = t => state.nodes.filter(n => n.type === t).map(n => res.nodes.get(n.id));
    return { served: res.served, success: res.successRate, latency: res.latency,
             ec2: of('ec2').map(s => s.load), rds: of('rds')[0].load, lb: of('lb')[0].capacity };
  }, rps);

  const low = await run(100);
  expect(low.ec2).toEqual([50, 50]);    // 고르게 나눔
  expect(low.lb).toBeNull();            // LB는 용량 제한 없음 (관리형)
  expect(low.success).toBe(1);

  const high = await run(300);          // EC2 1대 150요청 → 100만 처리
  expect(high.ec2).toEqual([150, 150]);
  expect(high.served).toBe(200);
  expect(high.success).toBeCloseTo(2 / 3);
  expect(high.rds).toBe(200);                          // 처리한 요청만 DB로
  expect(high.latency).toBeGreaterThan(low.latency);   // 바쁘면 느려짐
});

test('RDS와 연결되지 않은 EC2가 받은 요청은 성공이 아니라 실패로 계산하고 안내한다', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);   // 두 번째 EC2는 RDS와 연결되지 않음
  const res = await page.evaluate(() => {
    const r = simulateTraffic(100);
    const ec2s = state.nodes.filter(n => n.type === 'ec2').map(n => r.nodes.get(n.id).stuck);
    return { success: r.successRate, stuck: ec2s };
  });
  expect(res.stuck).toEqual([0, 50]);
  expect(res.success).toBe(0.5);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-rps').fill('100');
  await expect(page.locator('#sim-bottleneck')).toContainText('연결 끊김: EC2 → RDS 연결이 없는 박스가 1개');
});

test('[성능 시뮬레이션] 탭: 트래픽을 올리면 박스 사용률 막대와 병목 안내가 바뀐다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  const tab = page.locator('#result .tab[data-tab="sim"]');
  const box = await tab.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(tab).toHaveClass(/active/);
  await expect(page.locator('#result')).toContainText('학습용 가정값');

  await page.locator('#sim-rps').fill('100');
  await expect(page.locator('#sim-success')).toHaveText('100.0%');
  await expect(page.locator('.node .sim-bar')).toHaveCount(3);          // EC2 2대 + RDS
  await expect(page.locator('.node .sim-bar.ok').first()).toContainText('50%');

  await page.locator('#sim-rps').fill('300');
  await expect(page.locator('#sim-success')).toHaveText('66.7%');
  await expect(page.locator('.node .sim-bar.over')).toHaveCount(2);
  await expect(page.locator('#sim-bottleneck')).toContainText('병목: EC2');

  // 검증 탭으로 돌아가면 막대가 사라진다
  await page.locator('#result .tab[data-tab="validate"]').click();
  await expect(page.locator('.node .sim-bar')).toHaveCount(0);
});

test('검증 오류가 있으면 시뮬레이션을 실행하지 않고 안내한다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { loadTemplate(); addNode('pc', 120, 300); });
  await page.locator('#result .tab[data-tab="sim"]').click();
  await expect(page.locator('#result')).toContainText('검증 오류가 있어 요청이 끝까지 가지 못해요');
  await expect(page.locator('#sim-rps')).toHaveCount(0);
});

test('캔버스: 사용률별 박스 색, 트래픽이 많을수록 촘촘한 점, 넘친 박스로 가는 점 일부는 실패(빨강)', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.click('#btn-validate');                       // 검증 흐름 점이 도는 상태에서
  await expect(page.locator('.flow-dot').first()).toBeAttached();
  await page.locator('#result .tab[data-tab="sim"]').click();
  await expect(page.locator('.flow-dot')).toHaveCount(0);  // 시뮬레이션 탭에서는 트래픽 점만

  await page.locator('#sim-rps').fill('100');
  await expect(page.locator('.node.sim-ok')).toHaveCount(3);
  const dots100 = await page.locator('.sim-dot').count();
  expect(await page.evaluate(() => simDots.some(d => d.fail))).toBe(false);

  await page.locator('#sim-rps').fill('300');
  await expect(page.locator('.node.sim-over')).toHaveCount(2);   // EC2 2대
  await expect(page.locator('.node.sim-over .sim-bar').first()).toContainText('150% · 실패 50');
  expect(await page.locator('.sim-dot').count()).toBeGreaterThan(dots100);
  // LB → EC2 점의 1/3이 실패 (150 중 50)
  const fail = await page.evaluate(() => {
    const lb = state.nodes.find(n => n.type === 'lb').id;
    const ids = new Set(simResult.links.filter(l => l.src === lb).map(l => l.edgeId));
    const ds = simDots.filter(d => ids.has(d.edgeId));
    return ds.filter(d => d.fail).length / ds.length;
  });
  expect(fail).toBeCloseTo(1 / 3, 1);

  // 검증 탭으로 돌아가면 박스 색·트래픽 점이 사라지고 검증 흐름 점이 다시 돈다
  await page.locator('#result .tab[data-tab="validate"]').click();
  await expect(page.locator('.node.sim-over, .node.sim-ok')).toHaveCount(0);
  await expect(page.locator('.sim-dot')).toHaveCount(0);
  await expect(page.locator('.flow-dot').first()).toBeAttached();
});

test('캔버스: RDS와 연결되지 않은 EC2는 "연결 끊김"으로 표시하고, 그쪽으로 가는 점은 모두 실패', async ({ page }) => {
  await openApp(page);
  await buildValidArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-rps').fill('100');
  await expect(page.locator('.node.sim-stuck')).toHaveCount(1);
  await expect(page.locator('.node.sim-stuck .sim-bar')).toHaveText('연결 끊김');
  const allFail = await page.evaluate(() => {
    const stuck = [...simResult.nodes.entries()].find(([, s]) => s.stuck)[0];
    const ids = new Set(simResult.links.filter(l => l.dst === stuck).map(l => l.edgeId));
    return simDots.filter(d => ids.has(d.edgeId)).every(d => d.fail);
  });
  expect(allFail).toBe(true);
});

test('시간 흐름: 재생하면 시계가 가고(5x는 더 빨리), 멈추면 선다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await expect(page.locator('#sim-play')).toHaveText('⏸ 멈춤');       // 탭을 열면 바로 재생
  await page.locator('.sim-speed [data-speed="5"]').click();
  await page.waitForFunction(() => simT >= 5);
  await page.locator('#sim-play').click();
  await expect(page.locator('#sim-play')).toHaveText('▶ 재생');
  const t = await page.evaluate(() => simT);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => simT)).toBe(t);
  await expect(page.locator('#sim-chart-ok polyline')).toHaveCount(1);   // 그래프가 그려짐
});

test('시나리오 "급증": 15~35초에 트래픽이 3배가 되어 EC2가 넘치고, 그래프에 급증 구간과 성공률 하락이 나타난다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();                               // 멈춘 뒤 한 걸음씩 직접 진행
  await page.locator('#sim-rps').fill('100');
  await page.locator('#sim-scenario').selectOption('surge');
  const hist = await page.evaluate(() => { for (let i = 0; i < 20; i++) simStep(); return simHistory.map(h => [h.rps, h.success]); });
  expect(hist[13]).toEqual([100, 1]);            // 14초: 평소
  expect(hist[14][0]).toBe(300);                 // 15초: 3배
  expect(hist[14][1]).toBeCloseTo(2 / 3);        // EC2 2대(200) 넘침 → 성공률 하락
  await expect(page.locator('#sim-now')).toContainText('지금 300요청/초 (급증 중)');
  await expect(page.locator('.node.sim-over')).toHaveCount(2);
  await expect(page.locator('#sim-chart-ok rect.surge')).toHaveCount(6);   // 15~20초
  await expect(page.locator('#sim-clock')).toHaveText('0:20');
});

test('장애 계산: EC2가 멈추면 LB가 상태 확인 2번 실패(60초) 뒤 빼고, 복구 뒤 5번 성공(150초)하면 다시 넣는다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  const r = await page.evaluate(() => {
    const f = createFaults();
    const ec2 = state.nodes.find(n => n.type === 'ec2');
    const ok = () => simulateTraffic(100, simFaultOptions(f)).successRate;
    const out = {};
    f.down.add(ec2.id);
    for (let t = 1; t <= 59; t++) stepFaults(f, t);
    out.before = ok();                           // 아직 LB가 모름: EC2(A) 몫 50이 실패
    stepFaults(f, 60);
    out.after = ok();                            // 60초: 2번 실패 → 제외, EC2(B)가 100 처리
    f.down.delete(ec2.id);
    for (let t = 61; t <= 209; t++) stepFaults(f, t);
    out.stillOut = f.health.get(ec2.id).inService;
    stepFaults(f, 210);                          // 90·120·150·180·210초 → 5번 성공
    out.back = f.health.get(ec2.id).inService;
    out.log = f.log.map(e => e.t);
    return out;
  });
  expect(r.before).toBe(0.5);
  expect(r.after).toBe(1);
  expect(r.stillOut).toBe(false);
  expect(r.back).toBe(true);
  expect(r.log).toEqual([60, 210]);
});

test('장애 계산: RDS가 멈추면 Standby로 장애 조치(90초 동안 실패), Standby가 없으면 계속 실패', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  const r = await page.evaluate(() => {
    const f = createFaults();
    const rds = state.nodes.find(n => n.type === 'rds');
    const ok = () => simulateTraffic(100, simFaultOptions(f)).successRate;
    f.down.add(rds.id);
    stepFaults(f, 1);
    const during = ok();
    for (let t = 2; t <= 90; t++) stepFaults(f, t);
    const stillDuring = ok();
    stepFaults(f, 91);
    const after = ok();
    const standby = state.nodes.find(n => n.type === 'rds-standby');
    const load = simulateTraffic(100, simFaultOptions(f)).nodes.get(standby.id).load;
    // Standby가 없으면
    state.nodes = state.nodes.filter(n => n.type !== 'rds-standby');
    const g = createFaults();
    g.down.add(rds.id);
    for (let t = 1; t <= 200; t++) stepFaults(g, t);
    const noStandby = simulateTraffic(100, simFaultOptions(g)).successRate;
    return { during, stillDuring, after, load, noStandby, phase: g.db.get(rds.id).phase };
  });
  expect(r.during).toBe(0);
  expect(r.stillDuring).toBe(0);
  expect(r.after).toBe(1);
  expect(r.load).toBe(100);           // Standby가 새 본체로 처리
  expect(r.noStandby).toBe(0);
  expect(r.phase).toBe('down');
});

test('장애 넣기 모드: 박스를 누르면 고장(회색·✕), AZ를 누르면 그 안의 EC2·DB가 모두 멈추고 사건 기록에 남는다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('100');
  await page.locator('#sim-fault').click();
  await expect(page.locator('#sim-fault')).toHaveClass(/active/);

  const ec2 = await page.evaluate(() => { const n = state.nodes.filter(m => m.type === 'ec2')[1]; return { x: n.x + 50, y: n.y + 20 }; });
  const p = await page.evaluate(([x, y]) => worldToClient(x, y), [ec2.x, ec2.y]);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.node.sim-down')).toHaveCount(1);
  await expect(page.locator('.node.sim-down .sim-bar')).toContainText('고장 · 확인 0/2');
  await expect(page.locator('#sim-log')).toContainText('EC2(가용 영역 B) 고장');
  await expect(page.locator('#sim-bottleneck')).toContainText('장애: EC2(가용 영역 B)');
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'ec2')[1].x)).toBe(ec2.x - 50);   // 끌기로 처리되지 않음

  // AZ A 빈 곳을 누르면 AZ 전체 장애
  const az = await page.evaluate(() => { const a = state.containers.find(c => c.type === 'az'); return worldToClient(a.x + a.width / 2, a.y + 12); });   // AZ 위쪽 가운데 빈 곳
  await page.mouse.click(az.x, az.y);
  await expect(page.locator('.area.sim-az-down')).toHaveCount(1);
  await expect(page.locator('.node.sim-down')).toHaveCount(3);   // EC2 B + AZ A의 EC2·RDS
  await expect(page.locator('#sim-log')).toContainText('가용 영역 A 전체 장애');

  await page.locator('#sim-heal').click();
  await expect(page.locator('.node.sim-down')).toHaveCount(0);
});

test('시나리오 "DB 장애": 10초에 RDS가 멈추고 100초에 Standby가 새 본체가 된다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('100');
  await page.locator('#sim-scenario').selectOption('db');
  const succ = await page.evaluate(() => { for (let i = 0; i < 110; i++) simStep(); return simHistory.map(h => h.success); });
  expect(succ[8]).toBe(1);      // 9초
  expect(succ[9]).toBe(0);      // 10초: 고장, 장애 조치 시작
  expect(succ[98]).toBe(0);     // 99초
  expect(succ[99]).toBe(1);     // 100초: 완료
  await expect(page.locator('#sim-log')).toContainText('새 본체가 되어');
  await expect(page.locator('.node.sim-down')).toHaveCount(1);                       // 원래 RDS
  await expect(page.locator('.node .sim-bar', { hasText: '새 본체' })).toHaveCount(1);
  await expect(page.locator('#sim-chart-ok line.mark').first()).toBeAttached();
});

test('장애 넣기 모드에서는 삭제 버튼이 숨겨지고, 눌러도 지워지지 않는다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-fault').click();
  const count = await page.evaluate(() => state.containers.length);
  const del = page.locator('#area-layer .area .del').first();
  await expect(del).toBeHidden();
  await del.dispatchEvent('click');
  expect(await page.evaluate(() => state.containers.length)).toBe(count);
});

test('장애 조치 후에는 EC2 → 새 본체(Standby)로 가는 가상의 길(점선)로 점이 흐르고, 원래 RDS로는 가지 않는다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('100');
  await page.locator('#sim-scenario').selectOption('db');
  await expect(page.locator('.sim-virtual')).toHaveCount(0);   // 평소에는 없음
  const r = await page.evaluate(() => {
    for (let i = 0; i < 100; i++) simStep();
    const rds = state.nodes.find(n => n.type === 'rds'), sb = state.nodes.find(n => n.type === 'rds-standby');
    const v = simResult.links.filter(l => l.virtual);
    return { virtual: v.map(l => [l.dst === sb.id, l.amount]), toRds: simResult.links.filter(l => l.dst === rds.id).length };
  });
  expect(r.virtual).toEqual([[true, 50], [true, 50]]);   // EC2 2대 → Standby
  expect(r.toRds).toBe(0);
  await expect(page.locator('.sim-virtual')).toHaveCount(2);
  expect(await page.evaluate(() => simDots.filter(d => d.virtual).length)).toBeGreaterThan(0);
});

test('장애 넣기 중에는 Delete로 지워지지 않고, Esc로 장애 넣기를 끈다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.evaluate(() => select(state.nodes.find(n => n.type === 'ec2').id));   // 미리 선택해 둔 박스
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-fault').click();
  const count = await page.evaluate(() => state.nodes.length);
  expect(await page.evaluate(() => selectedId)).toBeNull();   // 켜면 선택이 풀림
  await page.evaluate(() => { selectedId = state.nodes[0].id; });
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => state.nodes.length)).toBe(count);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sim-fault')).not.toHaveClass(/active/);
});
