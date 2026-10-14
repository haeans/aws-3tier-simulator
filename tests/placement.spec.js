// 배치·영역·겹침·스냅·크기 조절·저장 테스트
const { test, expect } = require('@playwright/test');
const { openApp, toScreen, dragWorld, paletteDrop, nodesOf, areasOf } = require('./helpers');

test('앱이 오류 없이 열리고 팔레트가 채워진다', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.palette .svc')).toHaveCount(30);
  await expect(page.locator('.palette .area-chip')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('팔레트에서 끌어 놓으면 배치되고, 허용되지 않는 위치는 거부된다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 540, 430);                 // 프라이빗 서브넷 A
  expect(await nodesOf(page, 'ec2')).toHaveLength(1);
  await paletteDrop(page, 'S3', 540, 590);                  // DB 서브넷 → S3는 VPC 밖 전용
  expect(await nodesOf(page, 's3')).toHaveLength(0);
  await expect(page.locator('#toast')).toContainText('VPC 밖에서 사용하는 서비스');
});

test('영역 중첩 규칙: AZ는 VPC 밖에 놓을 수 없다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'AZ \\(가용 영역\\)', 200, 900);
  expect(await areasOf(page, 'az')).toHaveLength(2);
  await expect(page.locator('#toast')).toContainText('VPC 안에 놓아야');
});

test('서비스 박스끼리 겹치면 거부된다 (원래 박스 우선)', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 540, 430);
  await paletteDrop(page, 'NAT', 560, 440);
  expect(await nodesOf(page, 'nat')).toHaveLength(0);
  await expect(page.locator('#toast')).toContainText('EC2 박스와 겹쳐요');
});

test('IGW를 VPC 경계선 근처에 놓으면 경계선에 붙는다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'IGW', 320, 610);                 // VPC 왼쪽 경계(x=280)에서 40px 안쪽
  const [igw] = await nodesOf(page, 'igw');
  expect(igw.x + 50).toBe(280);
});

test('서브넷끼리 겹치게 옮기면 원래 자리로 돌아가고, 안의 박스 소속이 유지된다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 540, 430);
  const [pv] = await areasOf(page, 'private');
  await dragWorld(page, { x: pv.x + 300, y: pv.y + 120 }, { x: pv.x + 300, y: pv.y + 60 });
  const [pv2] = await areasOf(page, 'private');
  expect(pv2.y).toBe(pv.y);
  const [ec2] = await nodesOf(page, 'ec2');
  expect(ec2.parentContainer).toBe(pv.id);
  await expect(page.locator('#toast')).toContainText('서브넷끼리는 겹칠 수 없어요');
});

test('영역을 옮기면 안의 박스도 함께 움직인다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 1000, 430);                // 프라이빗 서브넷 B
  const [ec2] = await nodesOf(page, 'ec2');
  const az = (await areasOf(page, 'az'))[1];
  await dragWorld(page, { x: az.x + 220, y: az.y + 10 }, { x: az.x + 220, y: az.y + 30 });
  const [ec2b] = await nodesOf(page, 'ec2');
  expect(ec2b.y).toBe(ec2.y + 20);
});

test('좌상단 손잡이로 크기를 늘릴 수 있고, 안의 박스보다 작게 줄일 수 없다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 1000, 430);
  const pv = (await areasOf(page, 'private'))[1];
  const pick = await toScreen(page, pv.x + 200, pv.y + 120);
  await page.mouse.click(pick.x, pick.y);                   // 선택하면 손잡이가 보인다
  await dragWorld(page, { x: pv.x, y: pv.y }, { x: pv.x - 20, y: pv.y });
  const grown = (await areasOf(page, 'private'))[1];
  expect([grown.x, grown.width]).toEqual([pv.x - 20, pv.width + 20]);
  // 박스(EC2) 오른쪽 너머까지 줄이기 → EC2 왼쪽에서 멈춤
  const [ec2] = await nodesOf(page, 'ec2');
  await dragWorld(page, { x: grown.x, y: grown.y }, { x: ec2.x + 80, y: grown.y });
  const shrunk = (await areasOf(page, 'private'))[1];
  expect(shrunk.x).toBeLessThanOrEqual(ec2.x);
});

test('새로고침해도 배치와 줌이 유지된다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 540, 430);
  await page.click('#zoom-out');
  await page.reload();
  await expect(page.locator('.node')).toHaveCount(1);
  await expect(page.locator('#zoom-reset')).toHaveText('90%');
  await expect(page.locator('#toast')).toContainText('이전에 작업하던 배치');
});

test('영역 삭제 시 안의 항목도 함께 지워진다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 540, 430);
  await page.evaluate(() => deleteContainer(state.containers.find(c => c.type === 'az').id));
  expect(await nodesOf(page, 'ec2')).toHaveLength(0);
  expect(await areasOf(page, 'az')).toHaveLength(1);
});

test('Ctrl+Z로 이동·배치를 되돌리고, [다시 실행]으로 되살린다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await expect(page.locator('#btn-redo')).toBeDisabled();
  await paletteDrop(page, 'EC2', 540, 430);
  const [ec2] = await nodesOf(page, 'ec2');
  const x0 = ec2.x;
  await dragWorld(page, { x: ec2.x + 50, y: ec2.y + 20 }, { x: ec2.x + 150, y: ec2.y + 20 });
  expect((await nodesOf(page, 'ec2'))[0].x).toBe(x0 + 100);

  await page.keyboard.press('Control+z');                   // 이동 되돌리기
  expect((await nodesOf(page, 'ec2'))[0].x).toBe(x0);
  await page.keyboard.press('Control+z');                   // 배치 되돌리기
  expect(await nodesOf(page, 'ec2')).toHaveLength(0);

  await page.click('#btn-redo');                            // 배치 다시
  await page.click('#btn-redo');                            // 이동 다시
  expect((await nodesOf(page, 'ec2'))[0].x).toBe(x0 + 100);
  await expect(page.locator('#btn-redo')).toBeDisabled();
});

test('거부된 동작은 되돌리기 목록에 쌓이지 않는다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 540, 430);
  const count = await page.evaluate(() => undoStack.length);
  await paletteDrop(page, 'NAT', 560, 440);                 // 겹쳐서 거부
  expect(await page.evaluate(() => undoStack.length)).toBe(count);
  await page.keyboard.press('Control+z');                   // EC2 배치가 되돌려져야 함
  expect(await nodesOf(page, 'ec2')).toHaveLength(0);
});

test('초기화도 되돌릴 수 있고, 새 동작을 하면 다시 실행 목록은 비워진다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'EC2', 540, 430);
  await page.click('#btn-reset');                           // 확인 창은 자동 승인
  expect(await areasOf(page, 'vpc')).toHaveLength(0);
  await page.click('#btn-undo');
  expect(await areasOf(page, 'vpc')).toHaveLength(1);
  expect(await nodesOf(page, 'ec2')).toHaveLength(1);
  await expect(page.locator('#btn-redo')).toBeEnabled();
  await paletteDrop(page, 'EC2', 1020, 430);                // 새 동작
  await expect(page.locator('#btn-redo')).toBeDisabled();
});

test('Auto Scaling 그룹은 AZ 경계를 넘어 놓을 수 있고, 안의 EC2 소속은 서브넷 그대로다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'Auto Scaling 그룹', 780, 430);   // 두 AZ의 프라이빗 서브넷에 걸침
  const [asg] = await areasOf(page, 'asg');
  const [vpc] = await areasOf(page, 'vpc');
  expect(asg.parentContainer).toBe(vpc.id);
  await paletteDrop(page, 'EC2', 640, 430);                 // 그룹 영역 안 + 프라이빗 서브넷 A
  const [pv] = await areasOf(page, 'private');
  expect((await nodesOf(page, 'ec2'))[0].parentContainer).toBe(pv.id);

  // 그룹 안의 EC2도 실제 마우스로 끌 수 있다 (그룹 영역이 클릭을 막지 않음)
  const [ec2] = await nodesOf(page, 'ec2');
  await dragWorld(page, { x: ec2.x + 50, y: ec2.y + 20 }, { x: ec2.x + 10, y: ec2.y + 20 });
  expect((await nodesOf(page, 'ec2'))[0].x).toBe(ec2.x - 40);

  // AZ를 옮겨도 그룹은 그대로, VPC를 옮기면 함께 움직인다
  await dragWorld(page, { x: 330, y: 650 }, { x: 330, y: 610 });
  expect((await areasOf(page, 'az'))[0].y).toBe(100);
  expect((await areasOf(page, 'asg'))[0].y).toBe(asg.y);
  await dragWorld(page, { x: 290, y: 400 }, { x: 330, y: 400 });
  expect((await areasOf(page, 'asg'))[0].x).toBe(asg.x + 40);
});

test('Auto Scaling 그룹은 VPC 밖이나 VPC 테두리에 걸치게 놓을 수 없다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await paletteDrop(page, 'Auto Scaling 그룹', 300, 900);
  expect(await areasOf(page, 'asg')).toHaveLength(0);
  await paletteDrop(page, 'Auto Scaling 그룹', 1200, 430);  // 오른쪽이 VPC 밖으로 삐져나감
  expect(await areasOf(page, 'asg')).toHaveLength(0);
  await expect(page.locator('#toast')).toContainText('Auto Scaling 그룹은 VPC 안에');
});

test('예전 Auto Scaling 박스가 저장되어 있으면 지우고 안내한다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('aws-t3-sim:v1', JSON.stringify({ version: 1, idSeq: 9, zoom: 1, state: {
    nodes: [{ id: 'n1', type: 'autoscaling', x: 100, y: 100, parentContainer: null },
            { id: 'n2', type: 'ec2', x: 300, y: 100, parentContainer: null }],
    containers: [], edges: [{ id: 'e3', from: 'n1', to: 'n2', fromSide: null, toSide: null, mid: null }],
  } })));
  await page.reload();
  await expect(page.locator('.node')).toHaveCount(1);
  expect(await page.evaluate(() => state.edges.length)).toBe(0);
  await expect(page.locator('#toast')).toContainText('예전 Auto Scaling 박스 1개를 지웠어요');
});

test('Auto Scaling 그룹은 점선 테두리를 잡아 옮길 수 있다 (안쪽은 아래로 지나감)', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  await page.evaluate(() => addContainer('asg', 780, 430));   // x 540~1020, y 360~520
  const [asg] = await areasOf(page, 'asg');
  const [pv] = await areasOf(page, 'private');
  await dragWorld(page, { x: asg.x, y: asg.y + 80 }, { x: asg.x + 40, y: asg.y + 80 });   // 왼쪽 테두리
  expect((await areasOf(page, 'asg'))[0].x).toBe(asg.x + 40);
  // 안쪽(테두리에서 먼 곳)을 끌면 그룹이 아니라 아래 서브넷이 잡힌다 (겹쳐서 되돌려지므로 선택만 확인)
  await dragWorld(page, { x: asg.x + 100, y: asg.y + 80 }, { x: asg.x + 100, y: asg.y + 60 });
  expect(await page.evaluate(() => selectedId)).toBe(pv.id);
  expect((await areasOf(page, 'asg'))[0].x).toBe(asg.x + 40);
});
