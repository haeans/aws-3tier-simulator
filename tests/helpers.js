// 테스트 공통 도구
// - 앱은 서버 없이 index.html을 파일로 직접 연다 (실제 사용과 같은 조건)
// - 화면 조작은 실제 마우스(page.mouse)로, 준비·확인은 앱 전역 함수(page.evaluate)로 한다
const path = require('path');
const { pathToFileURL } = require('url');
const { expect } = require('@playwright/test');

const APP_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

// 앱 열기: 확인 창(confirm)은 자동 승인, 스크립트 오류는 모아서 돌려준다
async function openApp(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(APP_URL);
  await expect(page.locator('.palette .svc').first()).toBeVisible();
  return errors;
}

// 캔버스(world) 좌표 → 화면 좌표
const toScreen = (page, x, y) => page.evaluate(([x, y]) => worldToClient(x, y), [x, y]);

// 실제 마우스로 끌기 (중간 지점을 거쳐 이동)
async function drag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

// 캔버스 좌표 기준으로 끌기
async function dragWorld(page, a, b) {
  await drag(page, await toScreen(page, a.x, a.y), await toScreen(page, b.x, b.y));
}

// 팔레트 항목(이름이 정확히 같은 것)을 캔버스의 (wx, wy)에 놓기
async function paletteDrop(page, name, wx, wy) {
  const item = page.locator('.palette .svc, .palette .area-chip').filter({ hasText: new RegExp(`^${name}$`) }).first();
  const box = await item.boundingBox();
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await toScreen(page, wx, wy), 12);
}

// 기본 틀 + 정상 3-Tier 구성 (사용자→IGW→LB→EC2 2대→RDS, NAT, RDS Standby)
async function buildValidArch(page) {
  await page.evaluate(() => {
    loadTemplate();
    addNode('pc', 120, 300); addNode('igw', 290, 300); addNode('lb', 400, 270); addNode('nat', 650, 270);
    addNode('ec2', 400, 430); addNode('ec2', 880, 430); addNode('rds', 400, 590); addNode('rds-standby', 880, 590);
    const T = t => state.nodes.filter(n => n.type === t);
    const E = (a, b) => state.edges.push({ id: newId('e'), from: a.id, to: b.id, fromSide: null, toSide: null, mid: null });
    E(T('pc')[0], T('igw')[0]); E(T('igw')[0], T('lb')[0]); E(T('lb')[0], T('ec2')[0]); E(T('lb')[0], T('ec2')[1]);
    E(T('rds')[0], T('ec2')[0]);   // 일부러 RDS→EC2 순서로 저장 (방향 없는 연결 확인용)
    render();
  });
}

// 종류별 박스 목록 / 영역 목록 (앱 상태 읽기)
const nodesOf = (page, type) => page.evaluate(t => state.nodes.filter(n => n.type === t), type);
const areasOf = (page, type) => page.evaluate(t => state.containers.filter(c => c.type === t), type);

module.exports = { APP_URL, openApp, toScreen, drag, dragWorld, paletteDrop, buildValidArch, nodesOf, areasOf };
