// 단계별 미션 테스트 (42번): [미션] 탭, 목표 자동 체크, 힌트, 다음 미션, 진행 저장, 고치기·개선 미션(42-2)
const { test, expect } = require('@playwright/test');
const { openApp, toScreen, drag, paletteDrop } = require('./helpers');

// 종류로 찾은 박스의 연결점(side) 화면 좌표 (마우스를 먼저 올려야 연결점이 보인다)
async function anchorOf(page, type, side) {
  const c = await page.evaluate(t => centerOf(state.nodes.find(n => n.type === t)), type);
  const body = await toScreen(page, c.x, c.y);
  await page.mouse.move(body.x, body.y);
  const a = await page.evaluate(([t, s]) => anchorPoint(state.nodes.find(n => n.type === t), s), [type, side]);
  return toScreen(page, a.x, a.y);
}
const centerScreen = async (page, type) => {
  const c = await page.evaluate(t => centerOf(state.nodes.find(n => n.type === t)), type);
  return toScreen(page, c.x, c.y);
};
const goalMarks = page => page.locator('.mission-goals li').evaluateAll(els => els.map(e => e.classList.contains('done')));

test('미션 1을 실제 마우스로 끝까지: 놓고 이을 때마다 목표가 체크되고, 완료하면 다음 미션이 캔버스를 이어 쓴다', async ({ page }) => {
  await openApp(page);
  await page.click('.tab[data-tab="mission"]');
  await expect(page.locator('.mission-list li:not(.mission-group)')).toHaveCount(11);
  await expect(page.locator('.mission-list li.mission-group b')).toHaveText(['만들기', '고치기', '개선']);
  await page.click('.mission-list button[data-key="entry"]');
  await expect(page.locator('.result-head .msg')).toContainText('미션 1/11 · 입구 만들기 (목표 0/5)');
  expect(await page.evaluate(() => [state.nodes.length, state.containers.length])).toEqual([0, 9]);   // 기본 틀만

  // 힌트: 아직 못 채운 첫 목표의 힌트
  await page.click('#mission-hint');
  await expect(page.locator('.mission-hint')).toContainText('PC를 끌어');

  const vpc = await page.evaluate(() => state.containers.find(c => c.type === 'vpc'));
  await paletteDrop(page, 'PC', vpc.x - 110, vpc.y + 300);
  expect(await goalMarks(page)).toEqual([true, false, false, false, false]);
  await expect(page.locator('.mission-hint')).toContainText('IGW를 끌어');                          // 힌트가 다음 목표로 넘어감
  await paletteDrop(page, 'IGW', vpc.x + 500, vpc.y + 20);
  await paletteDrop(page, 'Load Balancer', vpc.x + 500, vpc.y + 190);
  expect(await goalMarks(page)).toEqual([true, true, true, false, false]);

  await drag(page, await anchorOf(page, 'pc', 'right'), await centerScreen(page, 'igw'));
  expect(await goalMarks(page)).toEqual([true, true, true, true, false]);
  await drag(page, await anchorOf(page, 'igw', 'bottom'), await centerScreen(page, 'lb'));
  expect(await goalMarks(page)).toEqual([true, true, true, true, true]);
  await expect(page.locator('.mission-done')).toContainText('미션 완료');
  await expect(page.locator('#toast')).toContainText('미션 1 "입구 만들기" 완료');
  await expect(page.locator('#mission-hint')).toHaveCount(0);

  // 다음 미션: 캔버스는 그대로
  await page.click('#mission-next');
  await expect(page.locator('.result-head .msg')).toContainText('미션 2/11 · 앱 서버 놓기 (목표 0/2)');
  expect(await page.evaluate(() => [state.nodes.length, state.edges.length])).toEqual([3, 2]);

  // 선을 지우면 체크가 다시 풀린다 (미션 1로 돌아가 확인)
  await page.click('#mission-list');
  await expect(page.locator('.mission-list li.done')).toHaveCount(1);
  await page.evaluate(() => { state.edges = []; missionProgress.current = 'entry'; missionListOpen = false; render(); });
  expect(await goalMarks(page)).toEqual([true, true, true, false, false]);
});

test('만들기 미션마다 시작 구성은 앞 미션까지만 완성돼 있고, 기본 3-Tier 예시는 모든 미션을 통과한다', async ({ page }) => {
  await openApp(page);
  const keys = await page.evaluate(() => MISSIONS.filter(m => m.kind === 'build').map(m => m.key));
  expect(keys).toEqual(['entry', 'app', 'db', 'multi-az', 'egress']);
  for (let i = 0; i < keys.length; i++) {
    const r = await page.evaluate(i => {
      startMission(MISSIONS[i].key, true);
      return { grades: MISSIONS.slice(0, 5).map(m => gradeMission(m)), tab: resultTab, cur: missionProgress.current };
    }, i);
    expect(r.tab).toBe('mission');
    expect(r.cur).toBe(keys[i]);
    r.grades.slice(0, i).forEach((g, j) => expect(g.done, `${keys[i]} 시작 구성에서 ${keys[j]}`).toBe(true));
    expect(r.grades[i].doneCount, `${keys[i]} 시작 구성에서 자기 목표`).toBe(0);
  }
  // 채점은 구성을 인자로 받는다 (캔버스가 아닌 구성도 채점)
  const empty = await page.evaluate(() => gradeMission(MISSIONS[0], { nodes: [], containers: [], edges: [] }).doneCount);
  expect(empty).toBe(0);
  const all = await page.evaluate(() => { loadExample('basic'); return MISSIONS.slice(0, 5).map(m => gradeMission(m).done); });
  expect(all).toEqual([true, true, true, true, true]);
});

test('마지막 만들기 미션: 검증 결과 "정상"까지 자동으로 확인하고, [미션] 탭에서 [검증하기]를 누르면 검증 결과 탭으로 옮긴다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => startMission('egress', true));
  await expect(page.locator('.result-head .msg')).toContainText('미션 5/11');
  expect(await goalMarks(page)).toEqual([false, false, false, false]);            // NAT가 없어 판정이 경고 → "정상" 목표도 아직
  await page.click('#btn-validate');
  await expect(page.locator('.tab.active')).toHaveText('검증 결과');
  await expect(page.locator('.result-head .status')).toHaveText('경고');
  await page.click('#btn-validate');                                               // 검증 종료
  // NAT를 놓고 잇는다
  await page.evaluate(() => {
    const vpc = state.containers.find(c => c.type === 'vpc');
    const before = takeSnapshot();
    const nat = { id: newId('n'), type: 'nat', x: vpc.x + 120 - NODE_W / 2, y: vpc.y + 190 - NODE_H / 2, parentContainer: null };
    state.nodes.push(nat);
    const link = (a, b) => state.edges.push({ id: newId('e'), from: a, to: b, fromSide: null, toSide: null, mid: null });
    state.nodes.filter(n => n.type === 'ec2').forEach(e => link(e.id, nat.id));
    link(nat.id, state.nodes.find(n => n.type === 'igw').id);
    commit(before, null);
  });
  await page.click('.tab[data-tab="mission"]');
  expect(await goalMarks(page)).toEqual([true, true, true, true]);
  await expect(page.locator('.mission-done')).toContainText('기본 3-Tier 아키텍처를 직접 완성했어요');
  // 다음은 고치기 미션: 이어 가는 미션이 아니라 시작 구성을 새로 불러온다 (지울지 묻는 창은 자동 승인)
  await page.click('#mission-next');
  await expect(page.locator('.result-head .msg')).toContainText('미션 6/11 · 잘못 이은 선 찾기');
  expect(await page.evaluate(() => state.nodes.some(n => n.type === 'nat'))).toBe(true);
  expect(await page.evaluate(() => validateArchitecture().status)).toBe('error');
});

test('미션 진행은 브라우저에 저장되어 다시 열어도 이어지고, 다른 탭에 있을 때는 완료로 기록하지 않는다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => startMission('app', true));
  // 검증 결과 탭에서 예시를 불러와도(목표는 모두 충족) 미션 완료로 기록하지 않는다
  await page.click('.tab[data-tab="validate"]');
  await page.evaluate(() => loadExample('basic'));
  expect(await page.evaluate(() => missionProgress.done)).toEqual([]);
  await page.click('.tab[data-tab="mission"]');
  expect(await page.evaluate(() => missionProgress.done)).toEqual(['app']);
  await page.reload();
  await page.click('.tab[data-tab="mission"]');
  await expect(page.locator('.result-head .msg')).toContainText('미션 2/11 · 앱 서버 놓기 (목표 2/2 · 완료)');
  await page.click('#mission-list');
  await expect(page.locator('.mission-list li.done b')).toHaveText('앱 서버 놓기');
  await expect(page.locator('.mission-list li.current button')).toHaveText(['이어 하기', '처음부터']);
});

// ----- 42-2: 고치기·개선 미션 -----
// 두 종류의 박스를 잇는 연결선을 실제 마우스로 눌러 선택한다 (선의 구간 가운데를 차례로 눌러 그 선이 선택될 때까지)
async function clickEdge(page, a, b) {
  const pts = await page.evaluate(([a, b]) => {
    const T = id => findNode(id).type;
    const ed = state.edges.find(e => [T(e.from), T(e.to)].sort().join() === [a, b].sort().join());
    const p = edgePoints.get(ed.id);
    return { id: ed.id, mids: p.slice(1).map((q, i) => ({ x: (p[i].x + q.x) / 2, y: (p[i].y + q.y) / 2 })) };
  }, [a, b]);
  for (const m of pts.mids) {
    const s = await toScreen(page, m.x, m.y);
    await page.mouse.click(s.x, s.y);
    if (await page.evaluate(() => selectedId) === pts.id) return;
  }
  throw new Error(`${a}—${b} 선을 누르지 못했어요`);
}
const goalTexts = page => page.locator('.mission-goals li span').allTextContents();

test('고치기 미션 "잘못 이은 선 찾기": 남은 문제 수만 보여 주고, 선을 실제로 지우면 줄어들어 완료된다', async ({ page }) => {
  await openApp(page);
  await page.click('.tab[data-tab="mission"]');
  await page.click('.mission-list button[data-key="fix-lines"]');
  await expect(page.locator('.result-head .msg')).toContainText('미션 6/11 · 잘못 이은 선 찾기 (목표 0/2)');
  expect(await goalTexts(page)).toEqual(['검증의 "오류"를 모두 없애기 (지금 2개 남음)', '검증의 "경고"를 모두 없애기 (지금 1개 남음)']);
  // 힌트: 남은 문제 하나를 판정 문구로
  await page.click('#mission-hint');
  await expect(page.locator('.mission-hint')).toContainText('남은 문제 하나:');
  await expect(page.locator('.mission-hint')).toContainText('RDS Standby');

  await clickEdge(page, 'ec2', 'rds-standby');
  await page.keyboard.press('Delete');
  expect(await goalTexts(page)).toEqual(['검증의 "오류"를 모두 없애기 (지금 1개 남음)', '검증의 "경고"를 모두 없애기 (지금 1개 남음)']);
  await clickEdge(page, 'ec2', 'igw');
  await page.keyboard.press('Delete');
  expect(await goalMarks(page)).toEqual([true, false]);
  await clickEdge(page, 'ec2', 'pc');
  await page.keyboard.press('Delete');
  expect(await goalMarks(page)).toEqual([true, true]);
  await expect(page.locator('.mission-done')).toContainText('미션 완료');
  expect(await page.evaluate(() => validateArchitecture().status)).toBe('ok');
  // 다음 고치기 미션은 새 구성을 불러온다
  await page.click('#mission-next');
  await expect(page.locator('.result-head .msg')).toContainText('미션 7/11 · 잘못 놓인 박스 찾기 (목표 1/2)');
});

test('고치기 미션 "잘못 놓인 박스 찾기": 박스를 실제로 끌어 제자리에 놓으면 완료되고, 랜덤 미션은 항상 문제가 있는 구성으로 시작한다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => startMission('fix-places', true));
  expect(await goalMarks(page)).toEqual([true, false]);                             // 오류는 없고 경고만 있는 구성
  const vpc = await page.evaluate(() => state.containers.find(c => c.type === 'vpc'));
  const dragTo = async (type, pick, x, y) => {
    const c = await page.evaluate(([type, pick]) => centerOf(state.nodes.filter(n => n.type === type).find(n => zoneOf(n) === pick)), [type, pick]);
    await drag(page, await toScreen(page, c.x, c.y), await toScreen(page, vpc.x + x, vpc.y + y), 12);
  };
  await dragTo('rds', 'public', 260, 510);                                           // RDS: 퍼블릭 서브넷 → AZ A의 DB 서브넷
  expect(await goalTexts(page)).toEqual(['검증의 "오류"를 모두 없애기', '검증의 "경고"를 모두 없애기 (지금 1개 남음)']);
  await dragTo('ec2', 'public', 740, 350);                                           // EC2: 퍼블릭 서브넷 → AZ B의 프라이빗 서브넷
  expect(await goalMarks(page)).toEqual([true, true]);

  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(() => { startMission('fix-random', true); return gradeMission(MISSIONS.find(m => m.key === 'fix-random')); });
    expect(r.done).toBe(false);
  }
});

test('개선 미션: 시작 구성마다 그 미션의 제안만 남아 있고, 고가용성 예시는 개선 미션을 모두 통과한다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => MISSIONS.filter(m => m.kind === 'improve').map(m => {
    startMission(m.key, true);
    const v = validateArchitecture();
    return { key: m.key, status: v.status, sug: v.suggestions.map(s => s.rule.id), goals: gradeMission(m).goals.map(g => g.done) };
  }));
  expect(r).toEqual([
    { key: 'faster',    status: 'ok', sug: [1, 2, 4, 5, 8, 9, 12, 15], goals: [false, false, true] },
    { key: 'safer',     status: 'ok', sug: [4, 5, 8, 9, 12, 15, 18],   goals: [false, false, false, false, true] },
    { key: 'resilient', status: 'ok', sug: [4, 12, 18],                goals: [false, false, false, false, true] },
  ]);
  // 힌트는 그 제안의 이유·할 일 (판정 화면과 같은 문구)
  await page.click('#mission-hint');
  await expect(page.locator('.mission-hint')).toContainText('Auto Scaling 그룹');
  // 제안을 박스를 지워서 없애면 "정상 유지" 목표가 풀린다
  const cut = await page.evaluate(() => {
    state.nodes = state.nodes.filter(n => n.type !== 'ec2');
    state.edges = state.edges.filter(e => findNode(e.from) && findNode(e.to));
    render();
    return gradeMission(MISSIONS.find(m => m.key === 'resilient'));
  });
  expect(cut.goals.slice(-1)[0].done).toBe(false);
  expect(cut.done).toBe(false);
  const ha = await page.evaluate(() => { loadExample('ha'); return MISSIONS.filter(m => m.kind === 'improve').map(m => gradeMission(m).done); });
  expect(ha).toEqual([true, true, true]);
});

test('개선 미션 "더 빠르게 만들기": ElastiCache를 실제로 놓고 이으면 목표가 체크되고, 다음 개선 미션은 캔버스를 이어 쓴다', async ({ page }) => {
  await openApp(page);
  await page.click('.tab[data-tab="mission"]');
  await page.click('.mission-list button[data-key="faster"]');
  await expect(page.locator('.result-head .msg')).toContainText('미션 9/11 · 더 빠르게 만들기 (목표 1/3)');
  const vpc = await page.evaluate(() => state.containers.find(c => c.type === 'vpc'));
  await paletteDrop(page, 'ElastiCache', vpc.x + 400, vpc.y + 510);
  const ec2s = await page.evaluate(() => state.nodes.filter(n => n.type === 'ec2').map(n => n.id));
  for (let i = 0; i < ec2s.length; i++) {                                           // 두 EC2 모두 캐시와 잇는다
    const from = await page.evaluate(id => centerOf(findNode(id)), ec2s[i]);
    const body = await toScreen(page, from.x, from.y);
    await page.mouse.move(body.x, body.y);
    const a = await page.evaluate(id => anchorPoint(findNode(id), 'bottom'), ec2s[i]);
    await drag(page, await toScreen(page, a.x, a.y), await centerScreen(page, 'elasticache'));
  }
  expect(await goalMarks(page)).toEqual([true, false, true]);
  // CloudFront: 사용자 → CloudFront → IGW (사용자—IGW 직접 선은 지움)
  await page.evaluate(() => {
    const before = takeSnapshot();
    const T = t => state.nodes.find(n => n.type === t);
    const pc = T('pc'), igw = T('igw');
    const cf = { id: newId('n'), type: 'cloudfront', x: pc.x + 200, y: pc.y, parentContainer: null };
    state.nodes.push(cf);
    state.edges = state.edges.filter(e => !([e.from, e.to].includes(pc.id) && [e.from, e.to].includes(igw.id)));
    [[pc.id, cf.id], [cf.id, igw.id]].forEach(([a, b]) => state.edges.push({ id: newId('e'), from: a, to: b, fromSide: null, toSide: null, mid: null }));
    commit(before, null);
  });
  expect(await goalMarks(page)).toEqual([true, true, true]);
  const count = await page.evaluate(() => state.nodes.length);
  await page.click('#mission-next');
  await expect(page.locator('.result-head .msg')).toContainText('미션 10/11 · 더 안전하게 운영하기');
  expect(await page.evaluate(() => state.nodes.length)).toBe(count);                // 캔버스 그대로
});
