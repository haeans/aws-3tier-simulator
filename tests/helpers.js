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

// 팔레트 항목(이름이 정확히 같은 것)을 캔버스의 (wx, wy)에 놓기 (맨 위 추천 묶음이 아니라 일반 묶음에서)
async function paletteDrop(page, name, wx, wy) {
  const item = page.locator('#palette > .cat-items .svc, #palette > .cat-items .area-chip').filter({ hasText: new RegExp(`^${name}$`) }).first();
  await item.scrollIntoViewIfNeeded();   // 추천 묶음이 생기면 팔레트 항목이 아래로 밀릴 수 있음
  const box = await item.boundingBox();
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await toScreen(page, wx, wy), 12);
}

// 기본 틀 + 정상 3-Tier 구성 (사용자→IGW→LB→EC2 2대→RDS, NAT, RDS Standby)
// 기본 틀을 예전 위치(VPC 왼쪽 위 280, 80)에 만든다. 기존 테스트의 캔버스 좌표가 이 위치 기준이다
// (실제 버튼은 캔버스 한가운데에 만든다: placement.spec.js의 기본 틀 위치 테스트)
const loadTemplateAt = page => page.evaluate(() => loadTemplate({ x: 280, y: 80 }));

async function buildValidArch(page) {
  await page.evaluate(() => {
    loadTemplate({ x: 280, y: 80 });
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

// 박스 종류로 연결선 하나 더하기 (i, j = 같은 종류 중 몇 번째)
const connect = (page, a, b, i = 0, j = 0) => page.evaluate(([a, b, i, j]) => {
  const T = (t, k) => state.nodes.filter(n => n.type === t)[k];
  state.edges.push({ id: newId('e'), from: T(a, i).id, to: T(b, j).id, fromSide: null, toSide: null, mid: null });
  render();
}, [a, b, i, j]);
// 검증을 새로 돌려 결과 요약을 돌려준다 (이미 결과가 떠 있으면 한 번 종료했다가 다시 검증)
const verdict = async page => {
  if (await page.locator('#btn-validate').textContent() === '검증 종료') await page.click('#btn-validate');
  await page.click('#btn-validate');
  return page.evaluate(() => ({
    status: validation.status,
    issues: validation.issues.map(i => i.rule.id),
    praises: validation.praises.map(p => (p.rule.level ? 'V' : 'S') + p.rule.id),
    sug: validation.suggestions.map(s => s.rule.id),
    msgs: [...validation.issues.map(i => i.message), ...validation.suggestions.map(s => s.reason)],
  }));
};

// 박스 종류로 찾은 박스를 (x, y)로 옮기고 소속을 다시 계산 (idx = 같은 종류 중 몇 번째)
const moveNode = (page, type, x, y, idx = 0) => page.evaluate(([type, x, y, idx]) => {
  const n = state.nodes.filter(n => n.type === type)[idx];
  n.x = x; n.y = y;
  recomputeParents(); render();
}, [type, x, y, idx]);

module.exports = { APP_URL, openApp, loadTemplateAt, toScreen, drag, dragWorld, paletteDrop, buildValidArch, nodesOf, areasOf, connect, verdict, moveNode };
