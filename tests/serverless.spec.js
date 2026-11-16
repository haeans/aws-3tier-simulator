// 서버리스 테스트 (50번): API Gateway·Lambda·RDS Proxy 배치, 판정 1·3·5·7 넓히기, 판정 24, 제안 23·24, 제안 9·2, 보안 그룹
const { test, expect } = require('@playwright/test');
const { openApp, paletteDrop } = require('./helpers');

const verdictOf = page => page.evaluate(() => {
  const v = validateArchitecture();
  return { status: v.status, issues: v.issues.map(i => i.rule.id), sugs: v.suggestions.map(x => x.rule.id), msgs: v.issues.map(i => i.message),
    actions: v.suggestions.map(x => x.action), praises: v.praises.map(p => p.text) };
});
// ① 완전 서버리스: 사용자 → API Gateway → Lambda → DynamoDB (VPC 없음)
const buildFull = page => page.evaluate(() => {
  addNode('pc', 300, 300); addNode('apigw', 500, 300); addNode('lambda', 700, 300); addNode('dynamodb', 900, 300);
  const T = t => state.nodes.find(n => n.type === t);
  [['pc', 'apigw'], ['apigw', 'lambda'], ['lambda', 'dynamodb']].forEach(([a, b]) => state.edges.push({ id: newId('e'), from: T(a).id, to: T(b).id, fromSide: null, toSide: null, mid: null }));
  render();
});
// ② 앱만 서버리스: 기본 틀 + Lambda(프라이빗 A·B) → RDS Proxy → RDS (+ Standby)
const buildVpc = (page, proxy = true) => page.evaluate(proxy => {
  loadTemplate({ x: 280, y: 80 });
  addNode('pc', 120, 300); addNode('apigw', 120, 450);
  addNode('lambda', 540, 430); addNode('lambda', 1020, 430);
  if (proxy) addNode('rdsproxy', 680, 590);
  addNode('rds', 450, 590); addNode('rds-standby', 1020, 590);
  const T = t => state.nodes.find(n => n.type === t), L = state.nodes.filter(n => n.type === 'lambda');
  const e = (x, y) => state.edges.push({ id: newId('e'), from: x.id, to: y.id, fromSide: null, toSide: null, mid: null });
  e(T('pc'), T('apigw'));
  L.forEach(l => { e(T('apigw'), l); e(l, proxy ? T('rdsproxy') : T('rds')); });
  if (proxy) e(T('rdsproxy'), T('rds'));
  e(T('rds'), T('rds-standby'));
  render();
}, proxy);

test('배치: API Gateway는 VPC 밖, Lambda는 VPC 밖이나 프라이빗 서브넷(퍼블릭은 불가), RDS Proxy는 DB·프라이빗 서브넷', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadTemplate({ x: 280, y: 80 }));
  await paletteDrop(page, 'API Gateway', 150, 300);
  await paletteDrop(page, 'Lambda', 150, 450);                                         // VPC 밖
  await paletteDrop(page, 'Lambda', 540, 430);                                         // 프라이빗 서브넷 A
  await paletteDrop(page, 'Lambda', 600, 270);                                         // 퍼블릭 → 불가
  await expect(page.locator('#toast')).toContainText('퍼블릭 서브넷에 연결해도 인터넷에 나갈 수 없어요');
  await paletteDrop(page, 'RDS Proxy', 540, 590);
  expect(await page.evaluate(() => state.nodes.map(n => `${n.type}:${zoneOf(n)}`).sort())).toEqual(['apigw:outside', 'lambda:outside', 'lambda:private', 'rdsproxy:db']);
});

test('완전 서버리스(사용자 → API Gateway → Lambda → DynamoDB)는 IGW·LB 없이 정상이고, 없는 IGW·LB 입구를 칭찬하지 않는다', async ({ page }) => {
  await openApp(page);
  await buildFull(page);
  const v = await verdictOf(page);
  expect(v.status).toBe('ok');
  expect(v.praises).toEqual([]);
  expect(v.sugs).toEqual([2, 9]);                                                      // CDN·웹 방화벽
  expect(v.actions[0]).toContain('사용자 — CloudFront — API Gateway');
  expect(v.actions[1]).toContain('API Gateway(REST API)');
});

test('앱만 서버리스(Lambda가 두 AZ의 프라이빗 서브넷 → RDS Proxy → RDS)는 정상. RDS에 바로 이으면 RDS Proxy 제안, 한 AZ면 여러 AZ 제안', async ({ page }) => {
  await openApp(page);
  await buildVpc(page);
  let v = await verdictOf(page);
  expect(v.status).toBe('ok');
  expect(v.sugs).not.toContain(23);
  expect(v.sugs).not.toContain(24);
  // 보안 그룹: RDS ← RDS Proxy, RDS Proxy ← Lambda
  const sg = await page.evaluate(() => ({ rds: networkSecurityGroup(state.nodes.find(n => n.type === 'rds')).rules.map(r => r.source),
    proxy: networkSecurityGroup(state.nodes.find(n => n.type === 'rdsproxy')).rules.map(r => r.source) }));
  expect(sg).toEqual({ rds: ['RDS Proxy의 보안 그룹'], proxy: ['Lambda의 보안 그룹'] });
  await buildVpc(page, false);                                                          // RDS Proxy 없이 바로
  v = await verdictOf(page);
  expect(v.status).toBe('ok');
  expect(v.sugs).toContain(24);
  await page.evaluate(() => { const l = state.nodes.filter(n => n.type === 'lambda')[1]; state.nodes = state.nodes.filter(n => n !== l); state.edges = state.edges.filter(e => e.from !== l.id && e.to !== l.id); render(); });
  expect((await verdictOf(page)).sugs).toContain(23);
});

test('판정 24: API Gateway에 Lambda가 없음 / VPC 밖 Lambda가 RDS와 이어짐 / VPC 안 Lambda가 DynamoDB에 길이 없음', async ({ page }) => {
  await openApp(page);
  await buildFull(page);
  await page.evaluate(() => { state.edges = state.edges.filter(e => ![findNode(e.from).type, findNode(e.to).type].includes('apigw') || ![findNode(e.from).type, findNode(e.to).type].includes('lambda')); render(); });
  let v = await verdictOf(page);
  expect(v.issues).toContain(24);
  expect(v.msgs.join(' ')).toContain('API Gateway가 요청을 보낼 Lambda가 없어요');
  // VPC 밖 Lambda → RDS
  await buildVpc(page);
  await page.evaluate(() => { const l = state.nodes.find(n => n.type === 'lambda'); l.x = 60; l.y = 560; recomputeParents(); render(); });   // VPC 왼쪽 바깥
  v = await verdictOf(page);
  expect(v.msgs.join(' ')).toContain('VPC 밖의 Lambda는 VPC 안의 RDS Proxy에 닿을 수 없어요');
  // VPC 안 Lambda → DynamoDB (VPC Endpoints·NAT 없음)
  await buildVpc(page);
  await page.evaluate(() => {
    addNode('dynamodb', 120, 650);
    const l = state.nodes.find(n => n.type === 'lambda'), d = state.nodes.find(n => n.type === 'dynamodb');
    state.edges.push({ id: newId('e'), from: l.id, to: d.id, fromSide: null, toSide: null, mid: null }); render();
  });
  v = await verdictOf(page);
  expect(v.msgs.join(' ')).toContain('VPC에 연결한 Lambda는 VPC 안에만 닿아요');
});

// ----- 50-2: 성능·비용·예시 -----
test('예시 "완전 서버리스"는 VPC 없이 정상에 제안 0개, "앱만 서버리스"는 정상 (CloudFront·WAF 제안만 남음)', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-load');
  await page.click('#load-menu .load-item[data-key="serverless"]');
  await expect(page.locator('#toast')).toContainText('완전 서버리스');
  let v = await verdictOf(page);
  expect(v.status).toBe('ok');
  expect(v.sugs).toEqual([]);
  expect(await page.evaluate(() => state.containers.length)).toBe(0);                    // VPC 없음
  await page.click('#btn-load');
  await page.click('#load-menu .load-item[data-key="serverless-vpc"]');
  await expect(page.locator('#toast')).toContainText('앱만 서버리스');
  v = await verdictOf(page);
  expect(v.status).toBe('ok');
  expect(v.issues).toEqual([]);
  expect(v.sugs).toEqual([2, 9]);
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'lambda').map(n => azOf(n).label))).toEqual(['가용 영역 A', '가용 영역 B']);
});

test('성능: API Gateway·Lambda는 계정 전체 초당 10,000요청을 박스 수만큼 나눠 갖고, 앱만 서버리스는 RDS가 먼저 넘친다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('serverless-vpc');
    const of = (res, t) => [...res.nodes].filter(([id]) => findNode(id).type === t).map(([, x]) => x);
    const low = simulateTraffic(200), high = simulateTraffic(1000);
    return { cap: of(low, 'lambda').map(x => x.capacity), gw: of(low, 'apigw')[0].capacity, ok: low.successRate,
      rdsUtil: of(high, 'rds')[0].util, lambdaUtil: Math.max(...of(high, 'lambda').map(x => x.util)), highOk: high.successRate };
  });
  expect(r.cap).toEqual([5000, 5000]);
  expect(r.gw).toBe(10000);
  expect(r.ok).toBe(1);
  expect(r.rdsUtil).toBeGreaterThan(1);              // RDS 1대(초당 300)가 넘침
  expect(r.lambdaUtil).toBeLessThan(0.2);            // Lambda는 여유
  expect(r.highOk).toBeLessThan(1);
  const full = await page.evaluate(() => { loadExample('serverless'); return simulateTraffic(12000).successRate; });
  expect(full).toBe(1);                              // CloudFront가 절반을 응답 → API Gateway에 6,000만 닿아 한도 안
});

test('AZ 장애: 그 AZ 서브넷의 Lambda만 멈추고, API Gateway는 상태 확인을 기다리지 않고 다른 AZ의 Lambda로 바로 보낸다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('serverless-vpc'));
  await page.locator('#result .tab[data-tab="sim"]').click();
  await page.locator('#sim-play').click();
  await page.locator('#sim-rps').fill('100');
  await expect(page.locator('details.sim-assume')).toContainText('API Gateway·Lambda는 계정 전체 초당 10,000요청');
  await page.locator('#sim-fault').click();
  const az = await page.evaluate(() => { const a = state.containers.filter(c => c.type === 'az')[1]; return worldToClient(a.x + a.width / 2, a.y + 12); });   // AZ B 위쪽 빈 곳
  await page.mouse.click(az.x, az.y);
  await expect(page.locator('#sim-log')).toContainText('가용 영역 B 전체 장애');
  await expect(page.locator('#sim-log')).toContainText('Lambda는 다른 AZ 서브넷에서 바로 실행돼요');
  const r = await page.evaluate(() => {
    const [a, b] = state.nodes.filter(n => n.type === 'lambda');
    return { ok: simResult.successRate, a: simResult.nodes.get(a.id).load, b: simResult.nodes.get(b.id).load, bDown: document.querySelector(`.node[data-id="${b.id}"]`)?.classList.contains('sim-down') };
  });
  expect(r.ok).toBe(1);                              // 30초 상태 확인 없이 바로 성공
  expect(r.a).toBe(100);
  expect(r.b).toBe(0);
  expect(r.bDown).toBe(true);                        // 멈춘 Lambda(AZ B)는 회색
  // VPC 밖 Lambda는 AZ와 상관없고, 박스만 따로 고장 낼 수도 없다
  const outside = await page.evaluate(() => { const f = createFaults(); const l = state.nodes.find(n => n.type === 'lambda'); f.down.add(l.id); return faultDownNodes(f).size; });
  expect(outside).toBe(0);
});

test('WAF: API Gateway에 붙인 WAF는 공격 요청을 막고, CloudFront와 API Gateway에 WAF 하나를 함께 붙이면 제안 13', async ({ page }) => {
  await openApp(page);
  const blocked = await page.evaluate(() => { loadExample('serverless'); return simulateTraffic(100, null, 300).attackBlocked; });
  expect(blocked).toBe(true);
  expect((await verdictOf(page)).sugs).not.toContain(13);
  await page.evaluate(() => {   // CloudFront용 WAF를 지우고, API Gateway용 WAF를 CloudFront에도 잇기
    const [w1, w2] = state.nodes.filter(n => n.type === 'waf');
    state.nodes = state.nodes.filter(n => n !== w1);
    state.edges = state.edges.filter(e => e.from !== w1.id && e.to !== w1.id);
    state.edges.push({ id: newId('e'), from: w2.id, to: state.nodes.find(n => n.type === 'cloudfront').id, fromSide: null, toSide: null, mid: null });
    render();
  });
  const v = await verdictOf(page);
  expect(v.sugs).toContain(13);
  expect(v.actions.find(a => a.includes('따로'))).toContain('CloudFront용 WAF와 API Gateway용 WAF를 따로 두세요');
});

test('비용: RDS Proxy는 이어진 DB vCPU(2개) × $0.018/시간, Lambda·API Gateway는 사용량 요금(별도)', async ({ page }) => {
  await openApp(page);
  const c = await page.evaluate(() => { loadExample('serverless-vpc'); return costOf(); });
  const proxy = c.rows.find(r => r.name.startsWith('RDS Proxy'));
  expect(proxy.name).toBe('RDS Proxy (DB vCPU 2개)');
  expect(proxy.monthly).toBeCloseTo(0.018 * 2 * 730, 5);
  expect(c.usage).toEqual(['API Gateway', 'Lambda']);
  await page.locator('#result .tab[data-tab="cost"]').click();
  await expect(page.locator('#result')).toContainText('RDS Proxy (DB vCPU 2개)');
});
