// 단계별 미션 테스트 (42번): [미션] 탭, 목표 자동 체크, 힌트, 다음 미션, 진행 저장
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
  await expect(page.locator('.mission-list li')).toHaveCount(5);
  await page.click('.mission-list button[data-key="entry"]');
  await expect(page.locator('.result-head .msg')).toContainText('미션 1/5 · 입구 만들기 (목표 0/5)');
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
  await expect(page.locator('.result-head .msg')).toContainText('미션 2/5 · 앱 서버 놓기 (목표 0/2)');
  expect(await page.evaluate(() => [state.nodes.length, state.edges.length])).toEqual([3, 2]);

  // 선을 지우면 체크가 다시 풀린다 (미션 1로 돌아가 확인)
  await page.click('#mission-list');
  await expect(page.locator('.mission-list li.done')).toHaveCount(1);
  await page.evaluate(() => { state.edges = []; missionProgress.current = 'entry'; missionListOpen = false; render(); });
  expect(await goalMarks(page)).toEqual([true, true, true, false, false]);
});

test('미션마다 시작 구성은 앞 미션까지만 완성돼 있고, 기본 3-Tier 예시는 모든 미션을 통과한다', async ({ page }) => {
  await openApp(page);
  const keys = await page.evaluate(() => MISSIONS.map(m => m.key));
  expect(keys).toEqual(['entry', 'app', 'db', 'multi-az', 'egress']);
  for (let i = 0; i < keys.length; i++) {
    const r = await page.evaluate(i => {
      startMission(MISSIONS[i].key, true);
      return { grades: MISSIONS.map(m => gradeMission(m)), tab: resultTab, cur: missionProgress.current };
    }, i);
    expect(r.tab).toBe('mission');
    expect(r.cur).toBe(keys[i]);
    r.grades.slice(0, i).forEach((g, j) => expect(g.done, `${keys[i]} 시작 구성에서 ${keys[j]}`).toBe(true));
    expect(r.grades[i].doneCount, `${keys[i]} 시작 구성에서 자기 목표`).toBe(0);
  }
  // 채점은 구성을 인자로 받는다 (캔버스가 아닌 구성도 채점)
  const empty = await page.evaluate(() => gradeMission(MISSIONS[0], { nodes: [], containers: [], edges: [] }).doneCount);
  expect(empty).toBe(0);
  const all = await page.evaluate(() => { loadExample('basic'); return MISSIONS.map(m => gradeMission(m).done); });
  expect(all).toEqual([true, true, true, true, true]);
});

test('마지막 미션: 검증 결과 "정상"까지 자동으로 확인하고, [미션] 탭에서 [검증하기]를 누르면 검증 결과 탭으로 옮긴다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => startMission('egress', true));
  await expect(page.locator('.result-head .msg')).toContainText('미션 5/5');
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
  await expect(page.locator('.mission-done')).toContainText('만들기 미션을 모두 마쳤어요');
  await expect(page.locator('#mission-next')).toHaveCount(0);
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
  await expect(page.locator('.result-head .msg')).toContainText('미션 2/5 · 앱 서버 놓기 (목표 2/2 · 완료)');
  await page.click('#mission-list');
  await expect(page.locator('.mission-list li.done b')).toHaveText('앱 서버 놓기');
  await expect(page.locator('.mission-list li.current button')).toHaveText(['이어 하기', '처음부터']);
});
