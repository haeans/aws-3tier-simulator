// 네트워크 ② 테스트 (45번): 그린 구성에서 라우팅 테이블·보안 그룹을 계산해 설명 패널에 보여 주기 (입력 없음)
const { test, expect } = require('@playwright/test');
const { openApp, toScreen, connect } = require('./helpers');

// 예시를 불러와 서브넷(종류, AZ 글자)의 라우팅 테이블 / 박스 종류(i번째)의 보안 그룹
const routeOf = (page, type, az) => page.evaluate(([type, az]) => {
  const c = state.containers.find(x => x.type === type && findContainer(x.parentContainer).label.endsWith(az));
  return networkRouteTable(c);
}, [type, az]);
const sgOf = (page, type, i = 0) => page.evaluate(([t, i]) => networkSecurityGroup(state.nodes.filter(n => n.type === t)[i]), [type, i]);
const targets = rt => rt.rows.map(r => `${r.dest} → ${r.target || '없음'}`);

test('기본 3-Tier: 퍼블릭은 IGW, 프라이빗은 NAT, DB는 local만. NAT가 다른 AZ에만 있으면 그렇게 알린다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('basic'));
  expect(targets(await routeOf(page, 'public', 'A'))).toEqual(['VPC 안 → local', '인터넷 전체 → IGW']);
  expect(targets(await routeOf(page, 'private', 'A'))).toEqual(['VPC 안 → local', '인터넷 전체 → NAT (가용 영역 A)']);
  const b = await routeOf(page, 'private', 'B');
  expect(targets(b)).toEqual(['VPC 안 → local', '인터넷 전체 → NAT (가용 영역 A)']);   // NAT는 AZ A에만 (제안 12와 같은 내용)
  expect(b.rows[1].note).toContain('다른 가용 영역의 NAT');
  expect(targets(await routeOf(page, 'db', 'A'))).toEqual(['VPC 안 → local']);
  expect((await routeOf(page, 'public', 'A')).rows[0].cidr).toBe('10.0.0.0/16');
});

test('보안 그룹: LB는 인터넷에서 HTTPS, 서버는 LB의 보안 그룹에서, RDS는 서버의 보안 그룹에서. Standby는 규칙 없이 설명만', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('basic'));
  expect((await sgOf(page, 'lb')).rules).toEqual([{ port: 'HTTPS 443', source: '인터넷 전체 (0.0.0.0/0)', warn: '' }]);
  expect((await sgOf(page, 'ec2')).rules).toEqual([{ port: 'HTTP (예: 80)', source: 'Load Balancer의 보안 그룹', warn: '' }]);
  expect((await sgOf(page, 'rds')).rules).toEqual([{ port: 'DB 포트 (예: MySQL 3306)', source: 'EC2의 보안 그룹', warn: '' }]);
  const sb = await sgOf(page, 'rds-standby');
  expect(sb.rules).toEqual([]);
  expect(sb.notes[0]).toContain('본체와 같은 보안 그룹');
  expect(await sgOf(page, 'nat')).toBe(null);                                          // NAT 게이트웨이는 보안 그룹이 없다
  // 사용자를 서버에 바로 이으면 인터넷에서 서버로 들어오는 규칙이 경고로 생긴다 (판정의 IGW-03과 같은 내용)
  await connect(page, 'pc', 'ec2');
  const bad = (await sgOf(page, 'ec2')).rules.find(r => r.warn);
  expect(bad.source).toBe('인터넷 전체 (0.0.0.0/0)');
});

test('엔드포인트: S3는 게이트웨이 경로가 생기고, 컨테이너의 ECR은 인터페이스라 경로 대신 설명. NAT가 없으면 "없음"', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadSpec(PROBLEM_ANSWER_SHOP, ''));
  expect(targets(await routeOf(page, 'private', 'A'))).toContain('S3 (접두사 목록 pl-…) → VPC Endpoints (게이트웨이)');
  await page.evaluate(() => loadExample('container'));
  const a = await routeOf(page, 'private', 'A');
  expect(targets(a)).toEqual(['VPC 안 → local', '인터넷 전체 → 없음']);
  expect(a.notes.join(' ')).toContain('ECR은 인터페이스 엔드포인트');
  expect((await sgOf(page, 'fargate')).rules[0].source).toBe('Load Balancer의 보안 그룹');
  expect(await sgOf(page, 'ecs')).toBe(null);                                          // ECS 박스는 실행 방식(설정 관계)
});

test('설명 패널: 서브넷을 실제로 누르면 라우팅 테이블이, 서버를 누르면 보안 그룹 칸이 나온다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => loadExample('basic'));
  const vpc = await page.evaluate(() => state.containers.find(c => c.type === 'vpc'));
  const p = await toScreen(page, vpc.x + 100, vpc.y + 300);                           // 프라이빗 서브넷 A의 빈 곳
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#info-panel .ip-name')).toHaveText('프라이빗 서브넷');
  await expect(page.locator('#info-panel .ip-head .tt-cat')).toHaveText('가용 영역 A');
  await expect(page.locator('#info-panel .ip-sec')).toHaveText('라우팅 테이블 (자동 계산)');
  await expect(page.locator('#info-panel .ip-net tbody tr').nth(1)).toContainText('NAT (가용 영역 A)');
  await expect(page.locator('#info-panel .ip-net-note')).toContainText('예시(가정)');
  const ec2 = await page.evaluate(() => centerOf(state.nodes.find(n => n.type === 'ec2')));
  const e = await toScreen(page, ec2.x, ec2.y);
  await page.mouse.click(e.x, e.y);
  await expect(page.locator('#info-panel .ip-sec').last()).toHaveText('보안 그룹 (들어오는 규칙)');
  await expect(page.locator('#info-panel .ip-net')).toContainText('Load Balancer의 보안 그룹');
});
