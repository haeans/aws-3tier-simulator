// 배치·영역·겹침·스냅·크기 조절·저장 테스트
const { test, expect } = require('@playwright/test');
const { openApp, toScreen, dragWorld, paletteDrop, nodesOf, areasOf } = require('./helpers');

test('앱이 오류 없이 열리고 팔레트가 채워진다', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.palette .svc')).toHaveCount(31);
  await expect(page.locator('.palette .area-chip')).toHaveCount(5);
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
