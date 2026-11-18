// EC2 역할 테스트 (51번): 웹 서버·앱 서버·점프 서버 짐작과 직접 바꾸기, 요청 흐름 순서, 관리 접속 선, 판정 25·26·27·7·11, 제안 6·25·26, 성능, 보안 그룹, 내부 Load Balancer(51-2)
const { test, expect } = require('@playwright/test');
const { openApp, toScreen, verdict } = require('./helpers');

// 기본 3-Tier에서 두 EC2를 퍼블릭 서브넷으로 옮기고, 프라이빗 서브넷에 EC2 하나를 더해 퍼블릭 EC2 → 프라이빗 EC2 → RDS로 잇는다
// asym: 퍼블릭 EC2 B는 Load Balancer와 잇지 않음 (LB → A → 프라이빗 → B 처럼 되돌아가는 모양)
const buildTiers = (page, asym = false) => page.evaluate(asym => {
  loadExample('basic');
  const T = k => state.nodes.filter(n => n.type === k);
  const [a, b] = T('ec2');
  const sub = state.containers.filter(c => c.type === 'public');
  const before = takeSnapshot();
  a.x = sub[0].x + 260; a.y = sub[0].y + 40; b.x = sub[1].x + 60; b.y = sub[1].y + 40;
  commit(before, null);
  const priv = state.containers.find(c => c.type === 'private');
  addNode('ec2', priv.x + 200, priv.y + 70);
  const [pa, pb, pv] = T('ec2');
  const rds = T('rds')[0], sb = T('rds-standby')[0];
  state.edges = state.edges.filter(e => ![e.from, e.to].includes(rds.id) || [e.from, e.to].includes(sb.id));
  const add = (x, y) => state.edges.push({ id: newId('e'), from: x.id, to: y.id, fromSide: null, toSide: null, mid: null });
  if (asym) { const lb = T('lb')[0]; state.edges = state.edges.filter(e => !([e.from, e.to].includes(lb.id) && [e.from, e.to].includes(pb.id))); }
  add(pa, pv); add(pb, pv); add(pv, rds);
  render();
}, asym);
const ec2s = page => page.evaluate(() => state.nodes.filter(n => n.type === 'ec2').map(n => ({ id: n.id, role: serverRoleOf(n) })));
const flowPairs = page => page.evaluate(() => {
  const [pa, pb, pv] = state.nodes.filter(n => n.type === 'ec2').map(n => n.id);
  const name = id => ({ [pa]: 'webA', [pb]: 'pubB', [pv]: 'app' }[id] || findNode(id).type);
  return computeFlow(new Map()).filter(h => !h.roundTrip && !h.inspect).map(h => `${name(h.src)}>${name(h.dst)}`);
});

test('퍼블릭 EC2 2개 → 프라이빗 EC2 1개: 웹·웹·앱으로 짐작하고, 요청은 웹 → 앱 → DB로 흐르며 성능도 끝까지 계산된다', async ({ page }) => {
  await openApp(page);
  await buildTiers(page);
  expect((await ec2s(page)).map(e => e.role)).toEqual(['web', 'web', 'app']);
  await expect(page.locator('#node-layer .node-role, .node .node-role')).toHaveCount(3);     // 역할이 섞이면 이름표
  const v = await verdict(page);
  expect(v.issues).not.toContain(11);                                                    // 퍼블릭 웹 서버는 경고 아님
  expect(v.sug).toContain(25);                                                           // 대신 "웹 서버 위치" 제안
  expect(v.issues).toContain(7);                                                         // 웹 뒤의 앱 서버가 한 AZ에만
  expect(v.msgs.join()).toContain('웹 서버 뒤의 앱 서버가 한 AZ에만');
  const flow = await flowPairs(page);
  expect(flow).toEqual(expect.arrayContaining(['webA>app', 'pubB>app', 'app>rds']));
  expect(flow.some(f => f.startsWith('app>web') || f.startsWith('app>pubB'))).toBe(false);
  const sim = await page.evaluate(() => { const r = simulateTraffic(100); return { ok: r.successRate, stuck: [...r.nodes.values()].filter(x => x.stuck).length }; });
  expect(sim).toEqual({ ok: 1, stuck: 0 });                                              // 예전에는 웹 EC2가 "연결 끊김"(0%)
  // 앱 서버가 NAT와도 이어져 있어도(서버가 시작한 통신 선) 웹 → 앱으로 넘김 (사용자 확인에서 찾은 "연결 끊김")
  const withNat = await page.evaluate(() => {
    const app = state.nodes.filter(n => n.type === 'ec2')[2], nat = state.nodes.find(n => n.type === 'nat');
    state.edges.push({ id: newId('e'), from: app.id, to: nat.id, fromSide: null, toSide: null, mid: null });
    render();
    const r = simulateTraffic(100);
    return { ok: r.successRate, stuck: [...r.nodes.values()].filter(x => x.stuck).length };
  });
  expect(withNat).toEqual({ ok: 1, stuck: 0 });
  const sg = await page.evaluate(() => networkSecurityGroup(state.nodes.filter(n => n.type === 'ec2')[2]).rules.map(r => r.source));
  expect(sg).toEqual(['웹 서버(EC2)의 보안 그룹']);
});

test('Load Balancer와 이어지지 않은 퍼블릭 EC2는 점프 서버로 짐작: 관리 접속 선, 흐름이 되돌아가지 않음, 제안 6·SSH 규칙', async ({ page }) => {
  await openApp(page);
  await buildTiers(page, true);
  expect((await ec2s(page)).map(e => e.role)).toEqual(['web', 'bastion', 'app']);
  const kinds = await page.evaluate(() => state.edges.map(e => edgeInfoOf(e).kind).filter(k => k === 'admin').length);
  expect(kinds).toBe(1);                                                                 // 점프 서버 — 앱 서버
  const flow = await flowPairs(page);
  expect(flow.some(f => f.includes('pubB'))).toBe(false);                                // 사용자 요청은 점프 서버로 가지 않음
  const v = await verdict(page);
  expect(v.issues).not.toContain(11);
  expect(v.sug).toContain(6);                                                            // Session Manager로 바꾸기
  await expect(page.locator('.edge-legend')).toContainText('관리 접속');
  const sg = await page.evaluate(() => {
    const [, pb, pv] = state.nodes.filter(n => n.type === 'ec2');
    return { bastion: networkSecurityGroup(pb).rules.map(r => r.port), app: networkSecurityGroup(pv).rules.map(r => r.source) };
  });
  expect(sg.bastion).toEqual(['SSH 22']);
  expect(sg.app).toContain('점프 서버의 보안 그룹');
});

test('설명 패널 "역할" 칸: 점프 서버를 [웹]으로 바꾸면 판정 26(요청이 앱 → 웹으로 되돌아감), [자동]으로 돌아오고 되돌리기도 된다', async ({ page }) => {
  await openApp(page);
  await buildTiers(page, true);
  const c = await page.evaluate(() => centerOf(state.nodes.filter(n => n.type === 'ec2')[1]));
  const p = await toScreen(page, c.x, c.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#info-panel .ip-role-box')).toContainText('점프 서버');
  await expect(page.locator('#info-panel .ip-role.active')).toHaveText('자동 (점프)');
  const click = async sel => { const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  await click('#info-panel .ip-role[data-role="web"]');
  await expect(page.locator('#info-panel .ip-role.active')).toHaveText('웹');
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'ec2')[1].role)).toBe('web');
  let v = await verdict(page);
  expect(v.issues).toContain(26);
  expect(v.msgs.join()).toContain('요청이 앱 서버에서 웹 서버로 되돌아가는');
  expect(await flowPairs(page)).not.toContain('app>pubB');                               // 거꾸로 가는 선에는 흐름 점 없음
  await page.keyboard.press('Control+z');                                                // 되돌리기 → 자동
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'ec2')[1].role)).toBeUndefined();
  v = await verdict(page);
  expect(v.issues).not.toContain(26);
});

test('판정 25: 점프 서버가 프라이빗 서브넷이면 오류, 판정 26: 점프 서버가 Load Balancer와 이어지면 경고', async ({ page }) => {
  await openApp(page);
  await buildTiers(page);
  await page.evaluate(() => { state.nodes.filter(n => n.type === 'ec2')[2].role = 'bastion'; render(); });
  let v = await verdict(page);
  expect(v.issues).toContain(25);
  expect(v.status).toBe('error');
  await buildTiers(page);
  await page.evaluate(() => { state.nodes.filter(n => n.type === 'ec2')[0].role = 'bastion'; render(); });
  v = await verdict(page);
  expect(v.issues).toContain(26);
  expect(v.msgs.join()).toContain('점프 서버가 Load Balancer와 이어져');
});

test('역할이 섞이지 않은 기본 3-Tier는 그대로: 이름표·관리 접속 범례 없음, 판정 25·26·제안 25 없음', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('basic'));
  expect((await ec2s(page)).map(e => e.role)).toEqual(['app', 'app']);
  await expect(page.locator('.node .node-role')).toHaveCount(0);
  const v = await verdict(page);
  expect(v.status).toBe('ok');
  [25, 26].forEach(id => expect(v.issues).not.toContain(id));
  expect(v.sug).not.toContain(25);
  await expect(page.locator('.edge-legend')).not.toContainText('관리 접속');
});

/* ----- 51-2: 내부 Load Balancer (근거 criteria/roles.md RL-02·03) ----- */
const lbIds = page => page.evaluate(() => state.nodes.filter(n => n.type === 'lb').map(n => n.id));

test('예시 "웹·앱 분리": 아래쪽 LB를 내부용으로 짐작, 요청은 인터넷용 LB → 웹 → 내부 LB → 앱 → DB, 성능·보안 그룹도 그 순서', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('tiers'));
  const info = await page.evaluate(() => {
    const T = k => state.nodes.filter(n => n.type === k);
    const tag = n => `${n.type}:${serverRoleOf(n) || lbSchemeOf(n) || ''}`;
    const r = simulateTraffic(100);
    return {
      roles: T('ec2').map(n => serverRoleOf(n)), schemes: T('lb').map(n => lbSchemeOf(n)),
      flow: [...new Set(computeFlow(new Map()).filter(h => !h.roundTrip && !h.inspect).map(h => `${tag(findNode(h.src))}>${tag(findNode(h.dst))}`))],
      sim: { ok: r.successRate, stuck: [...r.nodes.values()].filter(x => x.stuck).length },
      sg: [...T('lb'), ...T('ec2')].map(n => networkSecurityGroup(n).rules.map(x => x.source).join('|')),
    };
  });
  expect(info.roles).toEqual(['web', 'web', 'app', 'app']);
  expect(info.schemes).toEqual(['internet', 'internal']);
  expect(info.flow).toEqual(['pc:>igw:', 'igw:>lb:internet', 'lb:internet>ec2:web', 'ec2:web>lb:internal', 'lb:internal>ec2:app', 'ec2:app>rds:']);
  expect(info.sim).toEqual({ ok: 1, stuck: 0 });
  expect(info.sg).toEqual(['인터넷 전체 (0.0.0.0/0)', '웹 서버(EC2)의 보안 그룹', 'Load Balancer의 보안 그룹', 'Load Balancer의 보안 그룹',
    '내부 Load Balancer의 보안 그룹', '내부 Load Balancer의 보안 그룹']);
  await expect(page.locator('.node .node-role.r-internal')).toHaveCount(1);
  const v = await verdict(page);
  expect(v.status).toBe('ok');
  const names = await page.evaluate(() => flowSteps.flatMap(st => st.lines.map(l => l.name)));   // 흐름 해설: 웹 서버·내부 LB 문구
  expect(names).toEqual(expect.arrayContaining(['웹 서버', '내부 Load Balancer', 'EC2']));                                                          // 판정 1(IGW와 잇지 않은 LB)·7·27 없음
  [17, 26].forEach(id => expect(v.sug).not.toContain(id));                             // 내부 LB에는 퍼블릭 서브넷 제안 없음, 내부 LB 제안도 없음
  const [, ilb] = await lbIds(page);
  const waf = await page.evaluate(() => validateArchitecture().suggestions.filter(s => s.rule.id === 9).flatMap(s => s.nodeIds));
  expect(waf).not.toContain(ilb);                                                       // 내부 LB는 인터넷 입구가 아니라 WAF 제안 대상 아님
});

test('제안 26: 웹 서버가 앱 서버 2대와 바로 이어지면 내부 LB 제안, 사이에 LB를 두면 사라지고 그 LB는 내부용', async ({ page }) => {
  await openApp(page);
  await buildTiers(page);
  let v = await verdict(page);
  expect(v.sug).not.toContain(26);                                                      // 앱 서버 1대: 나눠 줄 곳이 없음
  await page.evaluate(() => {                                                           // 프라이빗 서브넷 B에 앱 서버 하나 더
    const privs = state.containers.filter(c => c.type === 'private');
    addNode('ec2', privs[1].x + 100, privs[1].y + 70);
    const [pa, pb, , pw] = state.nodes.filter(n => n.type === 'ec2');
    const rds = state.nodes.find(n => n.type === 'rds');
    [[pa, pw], [pb, pw], [pw, rds]].forEach(([x, y]) => state.edges.push({ id: newId('e'), from: x.id, to: y.id, fromSide: null, toSide: null, mid: null }));
    render();
  });
  v = await verdict(page);
  expect(v.sug).toContain(26);
  expect(v.msgs.join()).toContain('웹 서버가 앱 서버 2대와 바로 이어져');
  const scheme = await page.evaluate(() => {                                            // 웹 ↔ 앱 선을 지우고 내부 LB를 사이에
    const [pa, pb, pv, pw] = state.nodes.filter(n => n.type === 'ec2');
    const vpc = state.containers.find(c => c.type === 'vpc');
    const priv = state.containers.find(c => c.type === 'private');
    addNode('lb', vpc.x + 500, priv.y + priv.height / 2);
    const ilb = state.nodes[state.nodes.length - 1];
    state.edges = state.edges.filter(e => !([pa.id, pb.id].includes(e.from) && [pv.id, pw.id].includes(e.to)));
    [[pa, ilb], [pb, ilb], [ilb, pv], [ilb, pw]].forEach(([x, y]) => state.edges.push({ id: newId('e'), from: x.id, to: y.id, fromSide: null, toSide: null, mid: null }));
    render();
    return { scheme: lbSchemeOf(ilb), roles: state.nodes.filter(n => n.type === 'ec2').map(n => serverRoleOf(n)) };
  });
  expect(scheme).toEqual({ scheme: 'internal', roles: ['web', 'web', 'app', 'app'] });
  v = await verdict(page);
  expect(v.sug).not.toContain(26);
  expect(v.issues).not.toContain(7);                                                    // 내부 LB 뒤의 앱 서버가 두 AZ
});

test('설명 패널 "종류" 칸과 판정 27: 내부용으로 정한 LB가 IGW와 이어지면 오류, [인터넷용]·되돌리기', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('tiers'));
  const c = await page.evaluate(() => centerOf(state.nodes.filter(n => n.type === 'lb')[1]));
  const p = await toScreen(page, c.x, c.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#info-panel .ip-scheme.active')).toHaveText('자동 (내부용)');
  await expect(page.locator('#info-panel .ip-role-box')).toContainText('사설 IP만');
  const click = async sel => { const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  await click('#info-panel .ip-scheme[data-scheme="internal"]');
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'lb')[1].scheme)).toBe('internal');
  // 내부용으로 정한 LB에 IGW를 이으면 판정 27 (자동이면 인터넷용으로 짐작해 오류가 아님)
  await page.evaluate(() => {
    const igw = state.nodes.find(n => n.type === 'igw'), ilb = state.nodes.filter(n => n.type === 'lb')[1];
    state.edges.push({ id: newId('e'), from: igw.id, to: ilb.id, fromSide: null, toSide: null, mid: null });
    render();
  });
  let v = await verdict(page);
  expect(v.issues).toContain(27);
  expect(v.status).toBe('error');
  expect(v.praises).not.toContain('V1');                                               // 입구 칭찬도 하지 않음
  expect(v.msgs.join()).toContain('내부 Load Balancer가 IGW와 이어져 있어요');
  await page.keyboard.press('Control+z');                                               // IGW 연결 되돌리기
  await page.mouse.click(p.x, p.y);
  await click('#info-panel .ip-scheme[data-scheme="internet"]');                        // 인터넷용으로 직접 → 이름표 없음, 알림 없음(사용자 결정)
  await expect(page.locator('.node .node-role.r-internal')).toHaveCount(0);
  v = await verdict(page);
  expect(v.issues).not.toContain(27);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'lb')[1].scheme)).toBe('internal');
});

test('기본 3-Tier의 Load Balancer는 그대로 인터넷용: "내부" 이름표 없음, 판정 27·제안 26 없음', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('basic'));
  expect(await page.evaluate(() => state.nodes.filter(n => n.type === 'lb').map(n => lbSchemeOf(n)))).toEqual(['internet']);
  await expect(page.locator('.node .node-role')).toHaveCount(0);
  const v = await verdict(page);
  expect(v.issues).not.toContain(27);
  expect(v.sug).not.toContain(26);
});
