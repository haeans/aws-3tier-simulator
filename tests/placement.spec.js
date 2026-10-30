// 배치·영역·겹침·스냅·크기 조절·저장 테스트
const { test, expect } = require('@playwright/test');
const { openApp, loadTemplateAt, toScreen, drag, dragWorld, paletteDrop, nodesOf, areasOf } = require('./helpers');

test('앱이 오류 없이 열리고 팔레트가 채워진다', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.palette .svc')).toHaveCount(32);
  await expect(page.locator('.palette .area-chip')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('팔레트에서 끌어 놓으면 배치되고, 허용되지 않는 위치는 거부된다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await paletteDrop(page, 'EC2', 540, 430);                 // 프라이빗 서브넷 A
  expect(await nodesOf(page, 'ec2')).toHaveLength(1);
  await paletteDrop(page, 'S3', 540, 590);                  // DB 서브넷 → S3는 VPC 밖 전용
  expect(await nodesOf(page, 's3')).toHaveLength(0);
  await expect(page.locator('#toast')).toContainText('VPC 밖에서 사용하는 서비스');
});

test('VPC Endpoints는 VPC 안과 모든 서브넷(퍼블릭·프라이빗·DB)에 놓을 수 있다 (VPCE-03)', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await paletteDrop(page, 'VPC Endpoints', 540, 430);       // 프라이빗 서브넷 A (인터페이스 엔드포인트)
  await paletteDrop(page, 'VPC Endpoints', 1200, 110);      // VPC 안, AZ 밖 (게이트웨이 엔드포인트)
  expect(await nodesOf(page, 'vpce')).toHaveLength(2);
  await paletteDrop(page, 'VPC Endpoints', 540, 270);       // 퍼블릭 서브넷 A (문서는 서브넷 종류를 제한하지 않음)
  await paletteDrop(page, 'VPC Endpoints', 540, 590);       // DB 서브넷 A
  expect(await nodesOf(page, 'vpce')).toHaveLength(4);
});

test('영역 중첩 규칙: AZ는 VPC 밖에 놓을 수 없다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await paletteDrop(page, 'AZ \\(가용 영역\\)', 200, 900);
  expect(await areasOf(page, 'az')).toHaveLength(2);
  await expect(page.locator('#toast')).toContainText('VPC 안에 놓아야');
});

test('서비스 박스끼리 겹치면 거부된다 (원래 박스 우선)', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await paletteDrop(page, 'EC2', 540, 430);
  await paletteDrop(page, 'NAT', 560, 440);
  expect(await nodesOf(page, 'nat')).toHaveLength(0);
  await expect(page.locator('#toast')).toContainText('EC2 박스와 겹쳐요');
});

test('IGW를 VPC 경계선 근처에 놓으면 경계선에 붙는다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await paletteDrop(page, 'IGW', 320, 610);                 // VPC 왼쪽 경계(x=280)에서 40px 안쪽
  const [igw] = await nodesOf(page, 'igw');
  expect(igw.x + 50).toBe(280);
});

test('서브넷끼리 겹치게 옮기면 원래 자리로 돌아가고, 안의 박스 소속이 유지된다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
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
  await loadTemplateAt(page);
  await paletteDrop(page, 'EC2', 1000, 430);                // 프라이빗 서브넷 B
  const [ec2] = await nodesOf(page, 'ec2');
  const az = (await areasOf(page, 'az'))[1];
  await dragWorld(page, { x: az.x + 220, y: az.y + 10 }, { x: az.x + 220, y: az.y + 30 });
  const [ec2b] = await nodesOf(page, 'ec2');
  expect(ec2b.y).toBe(ec2.y + 20);
});

test('좌상단 손잡이로 크기를 늘릴 수 있고, 안의 박스보다 작게 줄일 수 없다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
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
  await loadTemplateAt(page);
  await paletteDrop(page, 'EC2', 540, 430);
  await page.click('#zoom-out');
  await page.reload();
  await expect(page.locator('.node')).toHaveCount(1);
  await expect(page.locator('#zoom-reset')).toHaveText('90%');
  await expect(page.locator('#toast')).toContainText('이전에 작업하던 배치');
});

test('영역 삭제 시 안의 항목도 함께 지워진다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await paletteDrop(page, 'EC2', 540, 430);
  await page.evaluate(() => deleteContainer(state.containers.find(c => c.type === 'az').id));
  expect(await nodesOf(page, 'ec2')).toHaveLength(0);
  expect(await areasOf(page, 'az')).toHaveLength(1);
});

test('Ctrl+Z로 이동·배치를 되돌리고, [다시 실행]으로 되살린다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
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
  await loadTemplateAt(page);
  await paletteDrop(page, 'EC2', 540, 430);
  const count = await page.evaluate(() => undoStack.length);
  await paletteDrop(page, 'NAT', 560, 440);                 // 겹쳐서 거부
  expect(await page.evaluate(() => undoStack.length)).toBe(count);
  await page.keyboard.press('Control+z');                   // EC2 배치가 되돌려져야 함
  expect(await nodesOf(page, 'ec2')).toHaveLength(0);
});

test('초기화도 되돌릴 수 있고, 새 동작을 하면 다시 실행 목록은 비워진다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
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
  await loadTemplateAt(page);
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
  await loadTemplateAt(page);
  await paletteDrop(page, 'Auto Scaling 그룹', 300, 900);
  expect(await areasOf(page, 'asg')).toHaveLength(0);
  await paletteDrop(page, 'Auto Scaling 그룹', 1200, 430);  // 오른쪽이 VPC 밖으로 삐져나감
  expect(await areasOf(page, 'asg')).toHaveLength(0);
  await expect(page.locator('#toast')).toContainText('Auto Scaling 그룹은 VPC 안에');
});

test('예전 Auto Scaling 박스가 저장되어 있으면 지우고 안내한다', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, idSeq: 9, zoom: 1, state: {
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
  await loadTemplateAt(page);
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

test('Shift+클릭으로 여러 박스를 골라 함께 옮기고, 연결선을 다시 정리한다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await page.evaluate(() => {
    addNode('ec2', 540, 430); addNode('ec2', 1020, 430); addNode('rds', 540, 590);
    const [a, b, r] = state.nodes;
    state.edges.push({ id: 'e-ab', from: a.id, to: b.id, fromSide: 'right', toSide: 'left', mid: { axis: 'x', value: 780 } });
    state.edges.push({ id: 'e-ar', from: a.id, to: r.id, fromSide: 'bottom', toSide: 'top', mid: { axis: 'y', value: 520 } });
    select(null);
    render();
  });
  const [a0, b0] = await nodesOf(page, 'ec2');
  const pa = await toScreen(page, a0.x + 50, a0.y + 30), pb = await toScreen(page, b0.x + 50, b0.y + 30);
  await page.keyboard.down('Shift');
  await page.mouse.click(pa.x, pa.y);
  await page.mouse.click(pb.x, pb.y);
  await page.keyboard.up('Shift');
  expect(await page.evaluate(() => multiSel.size)).toBe(2);
  await expect(page.locator('#info-panel')).toBeHidden();   // 여러 개일 땐 설명 패널 숨김

  await dragWorld(page, { x: a0.x + 50, y: a0.y + 30 }, { x: a0.x + 50, y: a0.y + 10 });   // 위로 20
  const [a1, b1] = await nodesOf(page, 'ec2');
  expect([a1.y, b1.y]).toEqual([a0.y - 20, b0.y - 20]);
  const edges = await page.evaluate(() => state.edges);
  expect(edges.find(e => e.id === 'e-ab').mid).toEqual({ axis: 'x', value: 780 });   // 양 끝 모두 이동: 모양 유지
  expect(edges.find(e => e.id === 'e-ar')).toMatchObject({ fromSide: null, toSide: null, mid: null });   // 한쪽만: 자동으로
});

test('Shift+드래그로 범위 안의 박스를 고르고 Delete로 함께 지운 뒤 되돌린다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await page.evaluate(() => { addNode('ec2', 540, 430); addNode('ec2', 1020, 430); addNode('rds', 540, 590); select(null); });
  const s = await toScreen(page, 330, 380), e = await toScreen(page, 1250, 500);   // 프라이빗 서브넷 줄만 감쌈
  await page.keyboard.down('Shift');
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(e.x, e.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect(await page.evaluate(() => multiSel.size)).toBe(2);
  expect(await areasOf(page, 'private')).toHaveLength(2);   // 영역은 움직이지 않음
  await page.keyboard.press('Delete');
  expect(await nodesOf(page, 'ec2')).toHaveLength(0);
  expect(await nodesOf(page, 'rds')).toHaveLength(1);
  await page.keyboard.press('Control+z');
  expect(await nodesOf(page, 'ec2')).toHaveLength(2);
});

test('흰 배경을 끌면 화면이 움직이고, 스페이스바를 누른 채 끌면 영역 위에서도 화면만 움직인다', async ({ page }) => {
  await openApp(page);
  const scroll = () => page.evaluate(() => ({ x: $wrap.scrollLeft, y: $wrap.scrollTop }));
  await dragWorld(page, { x: 600, y: 500 }, { x: 400, y: 350 });   // 빈 캔버스(흰 배경) 끌기
  expect(await scroll()).toEqual({ x: 200, y: 150 });

  await loadTemplateAt(page);                               // 화면을 맨 위로 되돌리고 영역을 채움
  const sub = await page.evaluate(() => { const c = state.containers.find(c => c.type === 'public'); return { x: c.x + 50, y: c.y + 50 }; });
  const before = await page.evaluate(() => state.containers.map(c => [c.x, c.y]));
  const s = await toScreen(page, sub.x, sub.y);
  await page.keyboard.down('Space');
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(s.x - 150, s.y - 100, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  expect(await scroll()).toEqual({ x: 150, y: 100 });
  expect(await page.evaluate(() => state.containers.map(c => [c.x, c.y]))).toEqual(before);   // 영역은 그대로
});

test('[기본 틀 불러오기]는 캔버스 한가운데에 만들고, 화면도 그 가운데로 옮긴다', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-template');
  const r = await page.evaluate(() => {
    const vpc = state.containers.find(c => c.type === 'vpc');
    const world = { w: $world.offsetWidth, h: $world.offsetHeight };
    const el = elMap.get(vpc.id).getBoundingClientRect(), stage = $wrap.getBoundingClientRect();
    return { vpc, world, vcx: el.left + el.width / 2, scx: stage.left + stage.width / 2,
             vcy: el.top + el.height / 2, scy: stage.top + stage.height / 2 };
  });
  expect(r.vpc.x).toBeGreaterThan(800);                                       // 왼쪽·위에 여백
  expect(r.vpc.y).toBeGreaterThan(500);
  expect(r.world.w - (r.vpc.x + r.vpc.width)).toBeGreaterThan(700);          // 오른쪽·아래에도 여백
  expect(r.world.h - (r.vpc.y + r.vpc.height)).toBeGreaterThan(500);
  expect(Math.abs((r.vcx - 100) - r.scx)).toBeLessThanOrEqual(25);            // 사용자 자리(왼쪽 200)까지 포함해 화면 가운데
  expect(Math.abs(r.vcy - r.scy)).toBeLessThanOrEqual(25);
});

test('박스를 고르면 팔레트 맨 위에 추천 묶음이 뜨고, 거기서 끌어 놓으면 선택한 박스와 연결된다', async ({ page }) => {
  await openApp(page);
  await loadTemplateAt(page);
  await paletteDrop(page, 'EC2', 400, 430);
  await paletteDrop(page, 'Load Balancer', 400, 270);
  const ec2 = (await nodesOf(page, 'ec2'))[0];
  const lb = (await nodesOf(page, 'lb'))[0];
  await page.evaluate(([a, b]) => { state.edges.push({ id: newId('e'), from: a, to: b, fromSide: null, toSide: null, mid: null }); render(); select(a); }, [ec2.id, lb.id]);

  const rec = page.locator('#palette-rec');
  await expect(rec).toBeVisible();
  await expect(rec.locator('.rec-title')).toHaveText('★ EC2에 연결하기 좋아요');
  await expect(rec.locator('.svc', { hasText: 'Load Balancer' })).toHaveClass(/rec-done/);   // 이미 연결됨 ✓
  await expect(rec.locator('.svc', { hasText: /^RDS✓?$/ })).not.toHaveClass(/rec-done/);
  await expect(rec.locator('.svc', { hasText: 'RDS Standby' })).toHaveCount(0);   // Standby는 앱이 접속하지 않음 (DB-02)

  const item = await rec.locator('.svc', { hasText: /^RDS✓?$/ }).boundingBox();     // 추천에서 RDS를 DB 서브넷에 놓기
  await drag(page, { x: item.x + item.width / 2, y: item.y + item.height / 2 }, await toScreen(page, 400, 590), 12);
  const rds = await nodesOf(page, 'rds');
  expect(rds).toHaveLength(1);
  const linked = await page.evaluate(([a, b]) => state.edges.some(e => (e.from === a && e.to === b) || (e.from === b && e.to === a)), [ec2.id, rds[0].id]);
  expect(linked).toBe(true);
  expect(await page.evaluate(() => selectedId)).toBe(ec2.id);                       // 선택은 EC2 그대로
  await expect(rec.locator('.svc', { hasText: /^RDS✓?$/ })).toHaveClass(/rec-done/);

  const edgesBefore = await page.evaluate(() => state.edges.length);                // 놓을 수 없는 곳(다른 박스와 겹침)은 박스·연결 모두 취소
  const item2 = await rec.locator('.svc', { hasText: /^RDS✓?$/ }).boundingBox();
  await drag(page, { x: item2.x + item2.width / 2, y: item2.y + item2.height / 2 }, await toScreen(page, 400, 430), 12);   // EC2와 겹치는 자리
  expect(await nodesOf(page, 'rds')).toHaveLength(1);
  expect(await page.evaluate(() => state.edges.length)).toBe(edgesBefore);

  await page.keyboard.press('Escape');                                              // 선택을 풀면 추천 묶음도 사라짐
  await expect(rec).toBeHidden();
});
