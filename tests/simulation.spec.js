// 성능 시뮬레이션 테스트
const { test, expect } = require('@playwright/test');
const { openApp, buildValidArch, connect } = require('./helpers');

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
  await expect(page.locator('.node .sim-bar:not(.info)')).toHaveCount(3);   // 사용률 막대: EC2 2대 + RDS (Standby는 "예비로 대기")
  await expect(page.locator('.node .sim-bar.ok').first()).toHaveText('사용률 50%');

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
  await page.evaluate(() => { loadTemplate({ x: 280, y: 80 }); addNode('pc', 120, 300); });
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
  await page.waitForFunction(() => simDots.length > 0);
  const dots100 = await page.evaluate(() => simDots.length);
  expect(await page.evaluate(() => simDots.some(d => d.fail))).toBe(false);

  await page.locator('#sim-rps').fill('300');
  await expect(page.locator('.node.sim-over')).toHaveCount(2);   // EC2 2대
  await expect(page.locator('.node.sim-over .sim-bar').first()).toHaveText('사용률 150%');
  await expect(page.locator('.node.sim-over .sim-fail').first()).toHaveText('실패 50/초');   // 실패는 박스 위 배지로
  await expect(page.locator('.node.sim-ok .sim-fail')).toHaveCount(0);
  // 막대에는 브라우저 기본 툴팁이 없고, 박스 설명 팝업 맨 위에 계산식이 함께 나옴 (팝업이 겹치지 않게)
  expect(await page.locator('.node.sim-over .sim-bar').first().getAttribute('title')).toBeNull();
  const tip = await page.evaluate(() => simTooltip(state.nodes.find(n => n.type === 'ec2').id));
  expect(tip).toContain('들어온 요청 150 ÷ 처리할 수 있는 양 100');
  expect(tip).toContain('실패');
  const box = await page.locator('.node.sim-over').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#tooltip.show .tt-sim')).toContainText('사용률 150%');
  await expect(page.locator('#tooltip.show .tt-desc')).toBeVisible();   // 원래 서비스 설명도 같은 팝업에
  expect(await page.evaluate(() => simDots.length)).toBeGreaterThan(dots100);   // 요청이 많으면 점이 더 촘촘
  // LB → EC2로 나오는 점의 1/3이 실패 (150 중 50): 나오는 순서대로 3개 중 1개
  const fail = await page.evaluate(() => {
    const ec2 = state.nodes.find(n => n.type === 'ec2').id;
    const rate = simFailRate(ec2);
    let k = 0;
    for (let n = 0; n < 300; n++) if (simIsFailDot(n, rate)) k++;
    return k / 300;
  });
  expect(fail).toBeCloseTo(1 / 3, 2);
  await page.waitForFunction(() => [...document.querySelectorAll('.sim-dot')]
    .some(c => c.getAttribute('visibility') === 'visible' && c.getAttribute('fill') === FLOW_COLOR.error));   // 빨간 점이 실제로 보임

  // 검증 탭으로 돌아가면 박스 색·트래픽 점이 사라지고 검증 흐름 점이 다시 돈다
  await page.locator('#result .tab[data-tab="validate"]').click();
  await expect(page.locator('.node.sim-over, .node.sim-ok')).toHaveCount(0);
  await expect(page.locator('.sim-dot')).toHaveCount(0);
  await expect(page.locator('.flow-dot').first()).toBeAttached();
});

test('트래픽 점: 모든 선에서 같은 속도, 같은 요청량이면 선 길이와 상관없이 점 간격이 같다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('100');
  // LB → EC2 두 선은 길이가 다르지만 요청량(50)이 같다 → 1초 동안 보이는 점 수가 길이에 비례
  const r = await page.evaluate(async () => {
    const lb = state.nodes.find(n => n.type === 'lb').id;
    const links = simResult.links.filter(l => l.src === lb);
    const lens = links.map(l => polyLength(edgePoints.get(l.edgeId)));
    await new Promise(res => setTimeout(res, 300));
    const counts = links.map(l => simDots.filter(d => d.edgeId === l.edgeId).length);
    return { lens, counts, gap: SIM_SPEED * SIM_DOT_PER / 50 };
  });
  expect(r.lens[0]).not.toBeCloseTo(r.lens[1], 0);                      // 길이가 다른 두 선
  r.lens.forEach((len, i) => expect(Math.abs(r.counts[i] - len / r.gap)).toBeLessThanOrEqual(1.5));   // 간격이 같음
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
    const ds = simDots.filter(d => ids.has(d.edgeId));
    return ds.length > 0 && ds.every(d => d.fail);
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

test('[⟲ 처음부터]: 경과 시간·그래프·사건 기록·장애를 처음으로, 트래픽·시나리오·배속·재생 상태는 그대로', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('150');
  await page.locator('#sim-scenario').selectOption('ec2');
  await page.locator('.sim-speed [data-speed="5"]').click();
  await page.evaluate(() => { for (let i = 0; i < 70; i++) simStep(); });   // 10초 고장, 60초 LB 제외
  await expect(page.locator('#sim-clock')).toHaveText('1:10');
  await expect(page.locator('.node.sim-down')).toHaveCount(1);
  await page.locator('#sim-reset').click();
  await expect(page.locator('#sim-clock')).toHaveText('0:00');
  await expect(page.locator('.node.sim-down')).toHaveCount(0);
  await expect(page.locator('#sim-log .empty')).toBeVisible();
  await expect(page.locator('#sim-chart-ok polyline')).toHaveCount(0);
  const kept = await page.evaluate(() => ({ rps: simRps, scenario: simScenario, speed: simSpeed, playing: simPlaying,
    health: simFaults.health.size }));
  expect(kept).toEqual({ rps: 150, scenario: 'ec2', speed: 5, playing: false, health: 0 });
  await expect(page.locator('#sim-play')).toHaveText('▶ 재생');
});

// 기본 구성 + 두 AZ의 EC2를 감싸는 Auto Scaling 그룹
async function buildAsgArch(page) {
  await buildSimArch(page);
  await page.evaluate(() => {
    addContainer('asg', 1020, 430);
    const before = takeSnapshot();
    Object.assign(state.containers.find(c => c.type === 'asg'), { x: 320, width: 900 });
    commit(before, null);
  });
}

test('Auto Scaling: 평균 사용률이 50%를 1분 넘으면 필요한 만큼 늘리고(90초 뒤 투입), 낮아지면 5분마다 1대씩 줄인다', async ({ page }) => {
  await openApp(page);
  await buildAsgArch(page);
  const r = await page.evaluate(() => {
    const f = createFaults();
    let res = simulateTraffic(300, simFaultOptions(f));
    const run = (from, to, rps) => { for (let t = from; t <= to; t++) { stepFaults(f, t, res); res = simulateTraffic(rps, simFaultOptions(f)); } };
    const g = () => [...f.asg.values()][0];
    const out = { start: res.successRate };
    run(1, 59, 300);
    out.before = { running: asgRunning(g()), launching: g().launching.length };
    run(60, 60, 300);                               // 1분: 300 ÷ 50 = 6대 필요 → 4대 띄움
    out.launch = g().launching.length;
    run(61, 149, 300);
    out.waiting = res.successRate;                  // 아직 투입 전
    run(150, 150, 300);                             // 90초 뒤 투입
    out.after = { running: asgRunning(g()), success: res.successRate, perBox: [...g().running.values()] };
    run(151, 451, 100);                             // 트래픽이 줄면 (다음 1초부터 반영) 5분 뒤 1대
    out.shrink1 = asgRunning(g());
    run(452, 1500, 100);
    out.shrinkEnd = asgRunning(g());                // 1대를 빼도 50% 아래일 때만 줄임 → 3대에서 멈춤
    out.min = g().min; out.max = g().max;
    return out;
  });
  expect(r.start).toBeCloseTo(2 / 3);
  expect(r.before).toEqual({ running: 2, launching: 0 });
  expect(r.launch).toBe(4);
  expect(r.waiting).toBeCloseTo(2 / 3);
  expect(r.after.running).toBe(6);
  expect(r.after.success).toBe(1);
  expect(r.after.perBox).toEqual([3, 3]);          // 두 AZ에 고르게
  expect(r.shrink1).toBe(5);
  expect(r.shrinkEnd).toBe(3);
  expect([r.min, r.max]).toEqual([2, 6]);
});

test('Auto Scaling: 그룹 안 EC2가 고장 나면 LB에서 빠진 뒤 새 EC2로 교체한다', async ({ page }) => {
  await openApp(page);
  await buildAsgArch(page);
  const r = await page.evaluate(() => {
    const f = createFaults();
    const ec2 = state.nodes.find(n => n.type === 'ec2');
    let res = simulateTraffic(100, simFaultOptions(f));
    const run = (from, to) => { for (let t = from; t <= to; t++) { stepFaults(f, t, res); res = simulateTraffic(100, simFaultOptions(f)); } };
    f.down.add(ec2.id);
    run(1, 60);                                     // 60초: LB에서 빠짐 → 교체 시작
    const replacing = [...f.asg.values()][0].launching.some(l => l.replace);
    run(61, 150);                                   // 90초 뒤 교체 완료
    return { replacing, down: f.down.has(ec2.id), inService: f.health.get(ec2.id).inService,
             log: f.log.map(e => e.text).filter(t => t.includes('교체')).length };
  });
  expect(r.replacing).toBe(true);
  expect(r.down).toBe(false);
  expect(r.inService).toBe(true);
  expect(r.log).toBe(2);
});

test('Auto Scaling 화면: 그룹 위에 대수, 늘어난 박스 이름에 ×대수', async ({ page }) => {
  await openApp(page);
  await buildAsgArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('300');
  await expect(page.locator('.area .sim-asg')).toHaveText('서버 2대 · 최소 2 · 최대 6');
  await page.evaluate(() => { for (let i = 0; i < 60; i++) simStep(); });
  await expect(page.locator('.area .sim-asg')).toHaveText('서버 2대 (+4대 준비 중) · 최소 2 · 최대 6');
  await page.evaluate(() => { for (let i = 0; i < 90; i++) simStep(); });
  await expect(page.locator('.area .sim-asg')).toHaveText('서버 6대 · 최소 2 · 최대 6');
  await expect(page.locator('.node > span', { hasText: 'EC2 ×3' })).toHaveCount(2);
  await expect(page.locator('#sim-success')).toHaveText('100.0%');
  await expect(page.locator('#sim-log')).toContainText('준비를 마치고 요청을 받기 시작');
  // 검증 탭으로 돌아가면 원래 이름
  await page.locator('#result .tab[data-tab="validate"]').click();
  await expect(page.locator('.node > span', { hasText: '×' })).toHaveCount(0);
  await expect(page.locator('.area .sim-asg')).toHaveCount(0);
});

// 테스트용: 두 박스를 연결
test('CloudFront: 요청의 50%를 엣지 캐시가 바로 응답해서 EC2로 가는 요청이 절반이 된다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.evaluate(() => {
    addNode('cloudfront', 120, 160);
    const T = t => state.nodes.find(n => n.type === t);
    state.edges = state.edges.filter(e => !(e.from === T('pc').id && e.to === T('igw').id));   // PC — IGW 대신 PC — CloudFront — IGW
    state.edges.push({ id: newId('e'), from: T('pc').id, to: T('cloudfront').id, fromSide: null, toSide: null, mid: null });
    state.edges.push({ id: newId('e'), from: T('cloudfront').id, to: T('igw').id, fromSide: null, toSide: null, mid: null });
    render();
  });
  const r = await page.evaluate(() => {
    const res = simulateTraffic(300);
    const of = t => state.nodes.filter(n => n.type === t).map(n => res.nodes.get(n.id));
    return { ec2: of('ec2').map(s => s.load), cdn: of('cloudfront')[0].cacheHits, success: res.successRate };
  });
  expect(r.cdn).toBe(150);
  expect(r.ec2).toEqual([75, 75]);   // CloudFront가 없으면 150씩 → 넘침
  expect(r.success).toBe(1);
});

test('ElastiCache·Read Replica: DB 조회 중 캐시 몫(80%)은 캐시가, 남은 조회 중 읽기(70%)는 Replica가 받는다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.evaluate(() => { addNode('elasticache', 620, 590); addNode('rds-replica', 1100, 590); });
  const dbLoad = () => page.evaluate(() => {
    const res = simulateTraffic(100);
    const of = t => { const n = state.nodes.find(m => m.type === t); const s = n && res.nodes.get(n.id); return s ? Math.round(s.load * 10) / 10 : 0; };
    return { rds: of('rds'), cache: of('elasticache'), replica: of('rds-replica'), success: res.successRate };
  });
  expect(await dbLoad()).toEqual({ rds: 100, cache: 0, replica: 0, success: 1 });   // 아직 연결 안 함
  await page.evaluate(() => {
    const T = t => state.nodes.filter(n => n.type === t);
    T('ec2').forEach(e => state.edges.push({ id: newId('e'), from: e.id, to: T('elasticache')[0].id, fromSide: null, toSide: null, mid: null }));
    render();
  });
  expect(await dbLoad()).toEqual({ rds: 20, cache: 80, replica: 0, success: 1 });
  await page.evaluate(() => {
    const T = t => state.nodes.filter(n => n.type === t);
    T('ec2').forEach(e => state.edges.push({ id: newId('e'), from: e.id, to: T('rds-replica')[0].id, fromSide: null, toSide: null, mid: null }));
    render();
  });
  expect(await dbLoad()).toEqual({ rds: 6, cache: 80, replica: 14, success: 1 });
});

test('공격 시나리오: WAF가 없으면 봇 요청이 서버까지 들어와 정상 요청도 실패하고, WAF를 LB에 붙이면 앞에서 막는다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('100');
  await page.locator('#sim-scenario').selectOption('attack');
  await page.evaluate(() => { for (let i = 0; i < 15; i++) simStep(); });   // 15초: 공격 300요청/초 시작
  await expect(page.locator('#sim-now')).toContainText('공격 300요청/초 (막는 곳 없음)');
  await expect(page.locator('#sim-success')).toHaveText('50.0%');          // 400 중 EC2 2대가 200만 처리
  await expect(page.locator('#sim-bottleneck')).toContainText('봇 요청');
  await expect(page.locator('#sim-bottleneck .sim-fix')).toContainText('제안 9 웹 방화벽');
  await page.evaluate(() => { addNode('waf', 120, 440); });
  await connect(page, 'waf', 'lb');
  await expect(page.locator('#sim-now')).toContainText('WAF가 막는 중');
  await expect(page.locator('#sim-success')).toHaveText('100.0%');
  await expect(page.locator('.node .sim-bar.info', { hasText: '차단 300/초' })).toHaveCount(1);
  await page.evaluate(() => { for (let i = 0; i < 30; i++) simStep(); });   // 45초: 공격 끝
  await expect(page.locator('#sim-now')).toHaveText('');
  await page.evaluate(() => { for (let i = 0; i < 30; i++) simStep(); });   // 75초: 60초마다 반복 → 다시 공격
  await expect(page.locator('#sim-now')).toContainText('공격 300요청/초 (WAF가 막는 중)');
});

test('해결 방법: EC2 병목은 자동 확장, DB 병목은 DB 캐싱으로 기존 제안과 연결해 안내한다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('300');
  await expect(page.locator('#sim-bottleneck .sim-fix')).toContainText('제안 4 자동 확장');
  await expect(page.locator('#sim-bottleneck .sim-fix')).toContainText('제안 2 CDN 사용');
  // EC2를 늘려 DB가 병목이 되게 (EC2 4대 → 400 처리, RDS 300 한계)
  await page.evaluate(() => {
    addNode('ec2', 540, 470); addNode('ec2', 1020, 470);
    const lb = state.nodes.find(n => n.type === 'lb'), rds = state.nodes.find(n => n.type === 'rds');
    state.nodes.filter(n => n.type === 'ec2').slice(2).forEach(e => {
      state.edges.push({ id: newId('e'), from: lb.id, to: e.id, fromSide: null, toSide: null, mid: null });
      state.edges.push({ id: newId('e'), from: e.id, to: rds.id, fromSide: null, toSide: null, mid: null });
    });
    render();
  });
  await page.locator('#sim-rps').fill('400');
  await expect(page.locator('#sim-bottleneck')).toContainText('병목: RDS');
  await expect(page.locator('#sim-bottleneck .sim-fix')).toContainText('제안 1 DB 캐싱');
});

test('RDS Standby는 장애 조치 전에는 RDS와 연결돼 있어도 "예비로 대기", 장애 조치 뒤에만 "새 본체"', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await connect(page, 'rds', 'rds-standby');
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('100');
  const sb = page.locator('.node .sim-bar', { hasText: /예비로 대기|새 본체/ });
  await expect(sb).toHaveText('예비로 대기');
  await page.locator('#sim-scenario').selectOption('db');
  await page.evaluate(() => { for (let i = 0; i < 100; i++) simStep(); });   // 100초: 장애 조치 완료
  await expect(page.locator('.node .sim-bar', { hasText: '새 본체' })).toHaveText('새 본체 · 33%');
});

test('시뮬레이션 중 박스를 클릭하면 설명 패널 맨 위에 지금 상태와 최근 사용률 그래프가 나오고, 계산할 때마다 바뀐다', async ({ page }) => {
  await openApp(page);
  await buildSimArch(page);
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-rps').fill('100');
  const ec2 = await page.evaluate(() => centerOf(state.nodes.find(n => n.type === 'ec2')));
  const p = await page.evaluate(([x, y]) => worldToClient(x, y), [ec2.x, ec2.y]);
  await page.mouse.click(p.x, p.y);                                       // 박스 클릭 → 설명 패널
  const sim = page.locator('#ip-sim');
  await expect(sim).toBeVisible();
  await expect(sim).toContainText('지금 상태');
  await expect(sim).toContainText('사용률 50%');
  await expect(sim.locator('.ip-sim-chart')).toHaveCount(1);

  await page.locator('#sim-rps').fill('300');                             // 트래픽을 바꾸면 그 자리에서 바뀜
  await expect(sim).toContainText('사용률 150%');
  await page.evaluate(() => { simPlaying = false; for (let i = 0; i < 5; i++) simStep(); });   // 5초 진행 → 그래프 선
  await expect(sim.locator('.ip-sim-chart polyline')).toHaveCount(1);

  await page.click('#info-panel .ip-fold');                                // 설명 패널을 접어도 지금 상태는 남음
  await expect(sim).toBeVisible();
  await expect(page.locator('#info-panel .ip-desc')).toBeHidden();
  await page.click('#info-panel .ip-fold');

  await page.evaluate(() => select(state.nodes.find(n => n.type === 'lb').id));   // 처리량 제한 없는 박스는 그래프 없이 안내
  await expect(sim).toContainText('처리량 제한이 없어요');
  await expect(sim.locator('.ip-sim-chart')).toHaveCount(0);

  await page.locator('#result .tab[data-tab="validate"]').click();         // 검증 탭에서는 지금 상태 칸 없음
  await expect(sim).toBeHidden();
});
