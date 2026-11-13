// 마이그레이션 테스트 (49번): MGN 복제 서버·DMS 복제 인스턴스 배치, 복제 선, 판정 22·23, 제안 22, 판정 20 예외, 보안 그룹·비용, 예시 "옮기는 중"
const { test, expect } = require('@playwright/test');
const { openApp, paletteDrop, connect } = require('./helpers');

const verdictOf = page => page.evaluate(() => {
  const v = validateArchitecture();
  return { status: v.status, issues: v.issues.map(i => i.rule.id), sugs: v.suggestions.map(x => x.rule.id), msgs: v.issues.map(i => i.message) };
});
// 두 종류를 잇는 선을 모두 지운다
const unlink = (page, a, b) => page.evaluate(([a, b]) => {
  state.edges = state.edges.filter(ed => [findNode(ed.from).type, findNode(ed.to).type].sort().join() !== [a, b].sort().join());
  render();
}, [a, b]);

test('배치: MGN 복제 서버는 프라이빗·퍼블릭 서브넷에, DMS 복제 인스턴스는 DB·프라이빗 서브넷에만', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadTemplate({ x: 280, y: 80 }));                         // AZ A 서브넷 x 340~740: 퍼블릭 y 200~340, 프라이빗 360~500, DB 520~660
  await paletteDrop(page, 'MGN 복제 서버', 540, 430);
  await paletteDrop(page, 'MGN 복제 서버', 540, 590);                                // DB 서브넷 → 불가
  await expect(page.locator('#toast')).toContainText('프라이빗 서브넷(또는 퍼블릭 서브넷) 안에 놓아주세요');
  await paletteDrop(page, 'DMS 복제 인스턴스', 540, 590);
  await paletteDrop(page, 'DMS 복제 인스턴스', 540, 270);                            // 퍼블릭 → 불가
  await expect(page.locator('#toast')).toContainText('DB 서브넷이나 프라이빗 서브넷 안에만');
  expect(await page.evaluate(() => state.nodes.map(n => `${n.type}:${zoneOf(n)}`).sort())).toEqual(['dms:db', 'mgn:private']);
});

test('예시 "옮기는 중": 정상, 복제 선 5개(보라 점선), 보안 그룹에 TCP 1500·DMS 규칙, 비용에 DMS·MGN', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    loadExample('migrating');
    const v = validateArchitecture(), c = costOf();
    const mgn = state.nodes.find(n => n.type === 'mgn'), rds = state.nodes.find(n => n.type === 'rds');
    return { status: v.status, issues: v.issues.length, sug22: v.suggestions.some(x => x.rule.id === 22),
      repl: state.edges.filter(ed => edgeInfoOf(ed).kind === 'replication' && [findNode(ed.from).type, findNode(ed.to).type].some(t => t === 'mgn' || t === 'dms')).length,
      sgMgn: networkSecurityGroup(mgn).rules[0], sgRds: networkSecurityGroup(rds).rules.map(x => x.source),
      dms: c.rows.find(x => x.name.startsWith('DMS')).monthly, mgnCost: c.rows.find(x => x.name.startsWith('MGN')).monthly };
  });
  expect(r).toMatchObject({ status: 'ok', issues: 0, sug22: false, repl: 5 });   // 서버→MGN, MGN→EC2 2개, DB→DMS, DMS→RDS
  expect(r.sgMgn.port).toBe('TCP 1500 (복제)');
  expect(r.sgRds).toContain('DMS 복제 인스턴스의 보안 그룹');
  expect(r.dms).toBeCloseTo(0.112 * 730, 6);
  expect(r.mgnCost).toBeCloseTo(0.042 * 730, 6);
});

test('판정 22: MGN에 전환할 EC2가 없거나 DMS에 대상 RDS가 없으면 오류. 판정 20은 온프레미스 → MGN·DMS를 막지 않는다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('migrating'));
  await unlink(page, 'mgn', 'ec2');
  let v = await verdictOf(page);
  expect(v.issues).toEqual([22]);
  expect(v.msgs[0]).toContain('전환(cutover)할 EC2가 없어요');
  await connect(page, 'mgn', 'ec2');
  await unlink(page, 'dms', 'rds');
  v = await verdictOf(page);
  expect(v.issues).toEqual([22]);
  expect(v.msgs[0]).toContain('대상 DB가 없어요');
  await connect(page, 'dms', 'rds');
  expect((await verdictOf(page)).status).toBe('ok');
  // 온프레미스 서버를 EC2에 바로 이으면 여전히 판정 20 (복제 서버만 예외)
  await connect(page, 'onprem-server', 'ec2');
  expect((await verdictOf(page)).issues).toContain(20);
});

test('판정 23: DMS가 있는데 서로 다른 AZ의 서브넷이 2개 미만이면 오류. 제안 22: MGN이 앱 서버와 같은 서브넷이면 전용 서브넷 제안', async ({ page }) => {
  await openApp(page);
  const one = await page.evaluate(() => {
    loadTemplate({ x: 280, y: 80 });
    const azB = state.containers.filter(c => c.type === 'az')[1];
    state.containers = state.containers.filter(c => c.id !== azB.id && c.parentContainer !== azB.id);
    recomputeParents(); render();
    addNode('dms', 540, 590);
    return validateArchitecture().issues.map(i => i.rule.id);
  });
  expect(one).toContain(23);
  // 제안 22: MGN을 EC2가 있는 프라이빗 서브넷 A로 옮김
  const sugs = await page.evaluate(() => {
    loadExample('migrating');
    const m = state.nodes.find(n => n.type === 'mgn'), e = state.nodes.find(n => n.type === 'ec2');
    m.x = e.x + 140; m.y = e.y;
    recomputeParents(); render();
    return validateArchitecture().suggestions.filter(x => x.rule.id === 22).map(x => x.reason);
  });
  expect(sugs.length).toBe(1);
  expect(sugs[0]).toContain('같은 서브넷');
});
