// IDC(온프레미스)·하이브리드 연결 테스트 (48번): IDC 영역·온프레미스 박스 배치, VPN/Direct Connect 선 종류, 판정 20·21, 제안 21, 옮기기 전 구성
const { test, expect } = require('@playwright/test');
const { openApp, toScreen, drag, paletteDrop, connect } = require('./helpers');

// 팔레트 영역 칩을 캔버스 (wx, wy)에 실제 마우스로 끌어 놓기 (이름에 괄호가 있어 클래스로 찾는다)
async function dropArea(page, type, wx, wy) {
  const chip = page.locator(`#palette .area-chip.area-${type}`).first();
  await chip.scrollIntoViewIfNeeded();
  const b = await chip.boundingBox();
  await drag(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, await toScreen(page, wx, wy), 12);
}
const verdictOf = page => page.evaluate(() => {
  const v = validateArchitecture();
  return { status: v.status, mode: v.mode, issues: v.issues.map(i => i.rule.id), sugs: v.suggestions.map(x => x.rule.id), msgs: v.issues.map(i => i.message) };
});
// 기본 3-Tier(VPC 왼쪽 위 기준) 오른쪽에 IDC를 두고 서버·DB·고객 게이트웨이, VPC 오른쪽 경계에 VGW
async function buildHybrid(page) {
  await page.evaluate(() => {
    loadExample('basic');
    const vpc = state.containers.find(c => c.type === 'vpc');
    const ix = vpc.x + vpc.width + 300, iy = vpc.y + 200;
    addContainer('idc', ix, iy);
    addNode('onprem-server', ix - 80, iy - 60);
    addNode('onprem-db', ix - 80, iy + 60);
    addNode('cgw', ix - 140, iy);
    addNode('vgw', vpc.x + vpc.width, vpc.y + 300);   // VPC 오른쪽 경계에 붙는다
    select(null);
  });
}

test('IDC 영역: 팔레트에서 끌어 놓고, 온프레미스 박스는 IDC 안에만·AWS 박스는 IDC 안에 놓을 수 없으며, VPC와 겹칠 수 없다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { loadTemplate({ x: 280, y: 80 }); setZoom(0.5); $wrap.scrollTo(0, 0); });   // VPC 280~1280 × 80~740, 오른쪽까지 보이게 50%
  await dropArea(page, 'idc', 1400, 400);                                           // 1200~1600: VPC(~1280)와 겹침 → 거부
  await expect(page.locator('#toast')).toContainText('VPC·IDC끼리는 겹칠 수 없어요');
  await dropArea(page, 'idc', 1560, 400);                                           // 1360~1760 × 250~550
  expect(await page.evaluate(() => state.containers.filter(c => c.type === 'idc').length)).toBe(1);
  await paletteDrop(page, '온프레미스 서버', 1500, 350);
  expect(await page.evaluate(() => zoneOf(state.nodes.find(n => n.type === 'onprem-server')))).toBe('idc');
  await paletteDrop(page, 'EC2', 1650, 350);                                        // AWS 박스는 IDC 안 불가
  await expect(page.locator('#toast')).toContainText('IDC(온프레미스) 영역 안에 놓을 수 없어요');
  await paletteDrop(page, '온프레미스 DB', 1900, 400);                               // IDC 밖 → 불가
  await expect(page.locator('#toast')).toContainText('IDC(온프레미스) 영역 안에 놓아주세요');
  await paletteDrop(page, 'VGW', 1270, 500);                                         // VPC 오른쪽 경계 근처 → 붙는다
  const vgw = await page.evaluate(() => { const n = state.nodes.find(x => x.type === 'vgw'); return { cx: centerOf(n).x, zone: zoneOf(n) }; });
  expect(vgw).toEqual({ cx: 1280, zone: 'vpc' });
  expect(await page.evaluate(() => state.nodes.map(n => n.type).sort())).toEqual(['onprem-server', 'vgw']);
});

test('옮기기 전 구성(VPC 없이 IDC만): AWS 판정 대신 사용자 → 온프레미스 서버 → DB 흐름만 보고, 결과에 "옮기기 전" 안내', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    addContainer('idc', 700, 500);
    addNode('pc', 300, 500); addNode('onprem-server', 650, 450); addNode('onprem-db', 650, 580);
  });
  await connect(page, 'pc', 'onprem-server');
  let v = await verdictOf(page);
  expect(v).toMatchObject({ status: 'error', mode: 'onprem', issues: ['P1'], sugs: [] });
  expect(v.msgs[0]).toContain('온프레미스 DB와 이어져 있지 않아요');
  await connect(page, 'onprem-server', 'onprem-db');
  v = await verdictOf(page);
  expect(v).toMatchObject({ status: 'ok', mode: 'onprem', issues: [], sugs: [] });
  await page.click('#btn-validate');
  await expect(page.locator('.result-head .msg')).toContainText('AWS로 옮기기 전(온프레미스) 구성이에요');
});

test('하이브리드: 고객 게이트웨이—VGW 연결이 하나면 이중화 제안, 둘이면 없음. 직접 이은 선·연결 없는 VGW·VPC에 안 붙은 VGW는 오류', async ({ page }) => {
  await openApp(page);
  await buildHybrid(page);
  await connect(page, 'cgw', 'vgw');
  await connect(page, 'vgw', 'ec2');
  await connect(page, 'onprem-db', 'cgw');
  await connect(page, 'onprem-server', 'onprem-db');
  let v = await verdictOf(page);
  expect(v.status).toBe('ok');                                                       // 기존 3-Tier 판정은 그대로
  expect(v.mode).toBe('aws');
  expect(v.sugs).toContain(21);
  await connect(page, 'cgw', 'vgw');                                                 // 두 번째 연결 (백업)
  expect((await verdictOf(page)).sugs).not.toContain(21);
  // 온프레미스 DB를 EC2에 바로 이으면 판정 20
  await connect(page, 'onprem-db', 'ec2');
  v = await verdictOf(page);
  expect(v.issues).toContain(20);
  expect(v.msgs.join(' ')).toContain('고객 게이트웨이 → VPN·Direct Connect → VGW');
  // 고객 게이트웨이—VGW 선을 모두 지우면 판정 21
  await page.evaluate(() => {
    state.edges = state.edges.filter(ed => {
      const t = [findNode(ed.from).type, findNode(ed.to).type].sort().join('-');
      return t !== 'cgw-vgw' && t !== 'ec2-onprem-db';
    });
    render();
  });
  v = await verdictOf(page);
  expect(v.issues).toEqual([21, 21]);                                                // VGW 쪽·고객 게이트웨이 쪽
  // VGW를 VPC 밖으로 옮기면 "VPC에 붙어 있지 않아요"
  await page.evaluate(() => { const g = state.nodes.find(n => n.type === 'vgw'); g.y -= 450; recomputeParents(); render(); });   // VPC 위쪽 바깥으로
  expect((await verdictOf(page)).msgs.join(' ')).toContain('VGW가 VPC에 붙어 있지 않아요');
});

test('VPN / Direct Connect: 고객 게이트웨이—VGW 선을 누르면 종류를 고를 수 있고(기본 VPN), 선 모양과 범례가 바뀐다', async ({ page }) => {
  await openApp(page);
  await buildHybrid(page);
  await expect(page.locator('.edge-legend .k-vpn')).toHaveCount(0);                  // 결과 패널 범례는 검증 뒤에
  await connect(page, 'cgw', 'vgw');
  const id = await page.evaluate(() => state.edges.find(ed => [findNode(ed.from).type, findNode(ed.to).type].includes('vgw')).id);
  expect(await page.evaluate(id => edgeInfoOf(state.edges.find(e => e.id === id)), id)).toEqual({ kind: 'vpn', dir: 0 });
  await page.evaluate(id => select(id), id);
  await expect(page.locator('#info-panel .ek-opt')).toHaveCount(2);
  await page.locator('#info-panel .ek-opt', { hasText: 'Direct Connect' }).click();
  expect(await page.evaluate(id => state.edges.find(e => e.id === id).kind, id)).toBe('dx');
  await expect(page.locator(`#edge-g .edge.k-dx`)).toHaveCount(1);
  await page.click('#btn-validate');
  await expect(page.locator('.edge-legend .k-dx')).toHaveCount(1);
  // IDC가 없는 구성의 범례에는 VPN·Direct Connect가 없다
  await page.evaluate(() => loadExample('basic'));
  await page.click('#btn-validate');
  await expect(page.locator('.edge-legend .k-vpn')).toHaveCount(0);
});

// ----- 48-2: 라우팅 테이블·보안 그룹·성능·비용·예시 -----
test('예시 "옮기기 전 (온프레미스)": VPC 없이 IDC만, 판정은 옮기기 전 구성으로 정상이고 성능은 서버 1대 처리량까지, AWS 요금 없음', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('onprem');
    const v = validateArchitecture(), t = simulateTraffic(300), c = costOf();
    return { vpc: state.containers.some(x => x.type === 'vpc'), idc: state.containers.filter(x => x.type === 'idc').length,
      zones: state.nodes.filter(n => n.type !== 'pc').map(n => zoneOf(n)), status: v.status, mode: v.mode, served: t.served, cost: c.total, onprem: c.onprem };
  });
  expect(r).toEqual({ vpc: false, idc: 1, zones: ['idc', 'idc'], status: 'ok', mode: 'onprem', served: 100, cost: 0, onprem: ['온프레미스 서버', '온프레미스 DB'] });
});

test('예시 "하이브리드": AWS 서버가 VGW—고객 게이트웨이로 IDC의 DB를 쓰면 판정 정상(판정 5), DX + VPN 백업이라 이중화 제안 없음', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('hybrid');
    const v = validateArchitecture();
    return { status: v.status, issues: v.issues.length, sug21: v.suggestions.some(x => x.rule.id === 21),
      kinds: state.edges.map(ed => edgeInfoOf(ed).kind).filter(k => k === 'vpn' || k === 'dx').sort() };
  });
  expect(r).toEqual({ status: 'ok', issues: 0, sug21: false, kinds: ['dx', 'vpn'] });
  // VGW—EC2 선을 지우면 앱 서버가 DB와 이어지지 않아 판정 5 오류
  const r5 = await page.evaluate(() => {
    state.edges = state.edges.filter(ed => ![findNode(ed.from).type, findNode(ed.to).type].includes('ec2') || ![findNode(ed.from).type, findNode(ed.to).type].includes('vgw'));
    render();
    return validateArchitecture().issues.map(i => i.rule.id);
  });
  expect(r5).toContain(5);
});

test('하이브리드의 라우팅 테이블에 온프레미스 경로(VGW, 경로 전파), 서버 보안 그룹에 온프레미스 규칙이 생긴다 (HY-04·05)', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('hybrid');
    const priv = state.containers.find(c => c.type === 'private'), db = state.containers.find(c => c.type === 'db');
    return { priv: networkRouteTable(priv).rows.map(x => `${x.dest} ${x.cidr} → ${x.target}`), db: networkRouteTable(db).rows.length,
      sg: networkSecurityGroup(state.nodes.find(n => n.type === 'ec2')).rules.map(x => x.source) };
  });
  expect(r.priv).toEqual(['VPC 안 10.0.0.0/16 → local', '온프레미스 (IDC) 192.168.0.0/16 → VGW (경로 전파)', '인터넷 전체 0.0.0.0/0 → NAT (가용 영역 A)']);
  expect(r.db).toBe(1);                                                                // DB 서브넷엔 VGW와 이은 박스가 없다
  expect(r.sg).toEqual(['Load Balancer의 보안 그룹', '온프레미스 (192.168.0.0/16, VGW 거쳐)']);
});

test('성능: IDC ↔ AWS 연결 지연은 Direct Connect 5ms·VPN 20ms (둘 다면 빠른 쪽), 온프레미스는 장애 조치 없이 멈추면 실패. 비용: VPN 연결·DX 포트', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('hybrid');
    const vgw = state.nodes.find(n => n.type === 'vgw');
    const both = perfLatency(vgw);
    const dxEdge = state.edges.find(ed => ed.kind === 'dx');
    state.edges = state.edges.filter(ed => ed !== dxEdge);   // VPN만 남김
    const vpnOnly = perfLatency(vgw);
    const okBefore = simulateTraffic(100).successRate;
    const f = createFaults();
    f.down.add(state.nodes.find(n => n.type === 'onprem-db').id);
    const okDown = simulateTraffic(100, simFaultOptions(f)).successRate;
    loadExample('hybrid');
    const c = costOf();
    return { both, vpnOnly, okBefore, okDown, conn: c.rows.filter(x => /VPN|Direct/.test(x.name)).map(x => [x.name, Math.round(x.monthly * 100) / 100]) };
  });
  expect([r.both, r.vpnOnly]).toEqual([5, 20]);
  expect(r.okBefore).toBe(1);
  expect(r.okDown).toBe(0);                                                             // IDC의 DB는 예비가 없다
  expect(r.conn).toEqual([['Direct Connect 1Gbps 전용 포트', 219], ['Site-to-Site VPN 연결', 36.5]]);
});
