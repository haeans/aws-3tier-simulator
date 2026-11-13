// 면접식 설계 문제 테스트 (43번): 학습 패널 [문제] 탭, [제출] 채점, 모범 답안과 다른 역할·이유, 모범 답안 불러오기·되돌리기, 진행 저장
const { test, expect } = require('@playwright/test');
const { openApp, connect } = require('./helpers');

// 버튼을 실제 마우스로 누르기
async function clickEl(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
async function openProblemTab(page) {
  if (await page.locator('#learn-panel').isHidden()) await clickEl(page, '#btn-learn');
  await clickEl(page, '.learn-tab[data-learn="problem"]');
}
const reqMarks = page => page.locator('.problem-reqs li i').allTextContents();

test('모범 답안은 모두 검증 "정상"이고 자기 문제를 통과하며, 빈 기본 틀은 어느 요구도 채우지 못한다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => PROBLEMS.map(p => {
    loadSpec(p.answer, '');
    const out = { status: validateArchitecture().status, done: gradeProblem(p).done };
    loadTemplate();
    out.empty = gradeProblem(p).doneCount;
    return out;
  }));
  expect(r).toEqual([{ status: 'ok', done: true, empty: 0 }, { status: 'ok', done: true, empty: 0 }, { status: 'ok', done: true, empty: 0 }]);
});

test('같은 역할이면 다른 서비스도 맞다: 컨테이너로 만든 구성도 "회사 게시판"을 통과한다', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => { loadExample('container'); return gradeProblem(PROBLEMS.find(p => p.key === 'board')); });
  expect(r.done).toBe(true);
  // 반대로 기본 3-Tier는 "온라인 쇼핑몰"의 사진·캐시 요구를 못 채우고, 모범 답안에 있는 역할을 이유와 함께 알려 준다
  const shop = await page.evaluate(() => { loadExample('basic'); return gradeProblem(PROBLEMS.find(p => p.key === 'shop')); });
  expect(shop.reqs.map(x => x.done)).toEqual([true, true, false, false]);
  expect(shop.reqs[2].missing.map(m => m.name)).toEqual(['앱 서버 — S3 연결', '사용자 — CloudFront 연결']);
  expect(shop.reqs[3].missing[0].why).toContain('DB까지 가지 않아요');
});

test('문제를 시작해 [제출]하면 요구 사항마다 ✓/✗와 못 채운 역할이 나오고, 고친 뒤 다시 제출하면 통과한다', async ({ page }) => {
  await openApp(page);
  await openProblemTab(page);
  await expect(page.locator('.problem-panel .mission-list li')).toHaveCount(3);
  await expect(page.locator('.problem-level')).toHaveText(['쉬움', '보통', '어려움']);
  await clickEl(page, '.mission-list button[data-key="board"]');
  await expect(page.locator('.learn-msg')).toContainText('문제 1/3 · 회사 게시판 (쉬움)');
  expect(await page.evaluate(() => [state.nodes.length, state.containers.length])).toEqual([0, 9]);   // 빈 기본 틀
  expect(await reqMarks(page)).toEqual(['1', '2', '3', '4']);                          // 제출 전에는 번호만
  await expect(page.locator('#problem-answer')).toHaveCount(0);                       // 모범 답안은 제출해 본 뒤에

  // 앱 서버—RDS 연결만 빠진 구성을 만들어 제출
  await page.evaluate(() => {
    const spec = { ...EXAMPLE_BASIC, edges: EXAMPLE_BASIC.edges.filter(([a, b]) => b !== 'rds') };
    state.nodes = []; state.edges = []; state.containers = [];
    loadSpec(spec, '');
  });
  await clickEl(page, '#problem-submit');
  expect(await reqMarks(page)).toEqual(['✗', '✓', '✓', '✗']);
  await expect(page.locator('.problem-score')).toContainText('요구 사항 2/4개 충족');
  await expect(page.locator('.problem-miss').nth(1)).toContainText('앱 서버 — RDS 연결');
  await expect(page.locator('.problem-miss').first()).toContainText('남은 오류·경고');

  // 구성을 바꾸면 지난 결과는 지우고 다시 제출하라고 알린다
  await connect(page, 'ec2', 'rds', 0, 0);
  await expect(page.locator('.problem-note')).toContainText('다시 [제출]');
  expect(await reqMarks(page)).toEqual(['1', '2', '3', '4']);
  await connect(page, 'ec2', 'rds', 1, 0);
  await clickEl(page, '#problem-submit');
  expect(await reqMarks(page)).toEqual(['✓', '✓', '✓', '✓']);
  await expect(page.locator('.mission-done')).toContainText('통과');
  await expect(page.locator('#toast')).toContainText('문제 1 "회사 게시판" 통과');
  expect(await page.evaluate(() => problemProgress.passed)).toEqual(['board']);
});

test('[모범 답안 불러오기]는 확인 뒤 캔버스를 바꾸고 설계 이유를 보여 주며, 되돌리기 한 번으로 내 설계로 돌아온다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => startProblem('shop', true));
  await page.evaluate(() => { state.nodes = []; state.edges = []; state.containers = []; loadExample('basic'); });   // 내 설계: 기본 3-Tier
  const mine = await page.evaluate(() => state.nodes.map(n => n.type).sort());
  await clickEl(page, '#problem-submit');
  expect(await reqMarks(page)).toEqual(['✓', '✓', '✗', '✗']);
  await clickEl(page, '#problem-answer');                                             // 확인 창은 자동 승인
  expect(await page.evaluate(() => ['s3', 'cloudfront', 'elasticache'].every(t => state.nodes.some(n => n.type === t)))).toBe(true);
  await expect(page.locator('.problem-answer')).toContainText('모범 답안: 기본 3-Tier에 CloudFront');
  await clickEl(page, '#problem-submit');
  expect(await reqMarks(page)).toEqual(['✓', '✓', '✓', '✓']);
  await clickEl(page, '#btn-undo');
  expect(await page.evaluate(() => state.nodes.map(n => n.type).sort())).toEqual(mine);
});

test('통과한 문제와 풀던 문제는 다시 열어도 남고, 목록에서 [이어 하기]·[처음부터]를 고를 수 있다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { startProblem('photo', true); state.nodes = []; state.edges = []; state.containers = []; loadSpec(PROBLEMS[2].answer, ''); });
  await clickEl(page, '#problem-submit');
  await page.reload();
  await expect(page.locator('.learn-tab.active')).toHaveText('문제');
  await expect(page.locator('.learn-msg')).toContainText('문제 3/3 · 사진 공유 앱 (어려움 · 통과)');
  await expect(page.locator('#problem-answer')).toHaveCount(1);                       // 통과한 문제는 바로 모범 답안을 볼 수 있음
  await clickEl(page, '#problem-list');
  await expect(page.locator('.learn-msg')).toContainText('통과 1/3');
  await expect(page.locator('.mission-list li.done b')).toHaveText('사진 공유 앱');
  await expect(page.locator('.mission-list li.current button')).toHaveText(['이어 하기', '처음부터']);
});
