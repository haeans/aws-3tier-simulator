// 리팩터링 기준선: 여러 구성의 판정·제안·잘한 점·성능 시뮬레이션 결과를 스냅샷 파일과 비교한다
// - 코드 구조만 바꾸는 작업 뒤에도 결과가 한 글자도 바뀌지 않았는지 확인하는 용도
// - 판정을 일부러 바꾼 경우에만 `npx playwright test regression --update-snapshots`로 새로 저장한다
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

// 구성 만들기·요약은 모두 앱 안에서 실행한다 (박스 id는 "종류#순번"으로 바꿔 비교)
function collect() {
  const C = (x, y) => ({ x: x - NODE_W / 2, y: y - NODE_H / 2 });
  // 정상 구성 (helpers.js의 buildValidArch와 같은 배치)
  const VALID = {
    nodes: [['pc', 120, 300], ['igw', 290, 300], ['lb', 400, 270], ['nat', 650, 270],
      ['ec2', 400, 430], ['ec2', 880, 430], ['rds', 400, 590], ['rds-standby', 880, 590]],
    edges: [['pc', 'igw'], ['igw', 'lb'], ['lb', 'ec2'], ['lb', 'ec2#1'], ['rds', 'ec2']],
  };
  // 거의 모든 서비스를 넣은 구성
  const RICH = {
    nodes: [
      ['waf', 120, 60], ['route53', 120, 140], ['cloudfront', 120, 220], ['pc', 120, 300], ['smartphone', 120, 380],
      ['tablet', 120, 460], ['dbadmin', 120, 620],
      ['igw', 290, 300], ['clientvpn', 290, 620], ['vpce', 1290, 300],
      ['lb', 400, 270], ['nat', 650, 270], ['lb', 880, 270],
      ['ec2', 400, 430], ['ecs', 560, 430], ['ec2', 880, 430], ['fargate', 1020, 430], ['eks', 1160, 430],
      ['rds', 400, 590], ['elasticache', 560, 590], ['rds-replica', 680, 590], ['rds-standby', 880, 590],
      ['s3', 1400, 300], ['dynamodb', 1400, 380], ['ecr', 1400, 460], ['sessionmanager', 1400, 540], ['cloudtrail', 1400, 620],
      ['codecommit', 1520, 140], ['codebuild', 1520, 220], ['codepipeline', 1520, 300], ['codedeploy', 1520, 380],
      ['iam', 1520, 460], ['cloudformation', 1520, 540], ['cloudwatch', 1520, 620],
    ],
    edges: [
      ['route53', 'pc'], ['pc', 'cloudfront'], ['cloudfront', 'lb'], ['waf', 'cloudfront'], ['smartphone', 'igw'], ['tablet', 'igw'],
      ['pc', 'igw'], ['igw', 'lb'], ['lb', 'ec2'], ['lb', 'ec2#1'], ['lb', 'ecs'], ['igw', 'lb#1'], ['lb#1', 'fargate'],
      ['ec2', 'rds'], ['ec2#1', 'rds'], ['ec2', 'elasticache'], ['rds', 'rds-replica'], ['ecs', 'rds'],
      ['ec2', 'nat'], ['nat', 'igw'], ['ec2', 'vpce'], ['vpce', 's3'], ['vpce', 'dynamodb'], ['ec2#1', 'sessionmanager'],
      ['ecs', 'ecr'], ['ecs', 'fargate'], ['eks', 'fargate'], ['cloudtrail', 'cloudwatch'], ['dbadmin', 'clientvpn'], ['clientvpn', 'rds'],
      ['codecommit', 'codebuild'], ['codebuild', 'codepipeline'], ['codepipeline', 'codedeploy'], ['codedeploy', 'ec2'],
    ],
  };
  // 옮겨 볼 자리: VPC 밖, AZ A 퍼블릭·프라이빗·DB 서브넷, AZ B 프라이빗, VPC 안 서브넷 밖(AZ A 위쪽 여백)
  const SPOTS = { out: [1400, 720], pubA: [620, 300], privA: [700, 460], dbA: [700, 630], privB: [1150, 460], vpc: [520, 110] };

  const ref = (key) => { const [t, i] = key.split('#'); return state.nodes.filter(n => n.type === t)[+(i || 0)]; };
  function build(def) {
    state.nodes = []; state.edges = []; state.containers = [];
    loadTemplate();
    def.nodes.forEach(([t, x, y]) => state.nodes.push({ id: newId('n'), type: t, ...C(x, y), parentContainer: null }));
    state.nodes.forEach(snapToVpcEdge);
    def.edges.forEach(([a, b]) => state.edges.push({ id: newId('e'), from: ref(a).id, to: ref(b).id, fromSide: null, toSide: null, mid: null }));
    (def.areas || []).forEach(([t, x, y, w, h]) => state.containers.push({ id: newId('c'), type: t, x, y, width: w, height: h, parentContainer: null, label: t }));
    recomputeParents();
  }
  const key = id => {
    const n = findNode(id);
    if (n) return n.type + '#' + state.nodes.filter(m => m.type === n.type).indexOf(n);
    const c = findContainer(id);
    if (c) return c.type + '#' + state.containers.filter(m => m.type === c.type).indexOf(c);
    return id.startsWith('v:') ? 'v' : 'edge' + state.edges.findIndex(e => e.id === id);
  };
  const ids = arr => arr.map(key).join(',');
  const r4 = v => typeof v === 'number' ? +v.toFixed(4) : v;
  function verdictLine(name, detail) {
    const v = validateArchitecture();
    let line = `${name} | ${v.status} | ` +
      v.issues.map(i => `${i.rule.level[0].toUpperCase()}${i.rule.id}(${ids(i.nodeIds)})`).join(' ') + ' | ' +
      v.suggestions.map(s => `S${s.rule.id}(${ids(s.nodeIds)})`).join(' ') + ' | ' +
      v.praises.map(p => `${p.rule.level ? 'V' : 'S'}${p.rule.id}(${ids(p.nodeIds)})`).join(' ');
    if (detail) {
      line += '\n' + v.issues.map(i => '  ! ' + i.message).join('\n') +
        '\n' + v.suggestions.map(s => '  ? ' + s.reason + ' → ' + s.action).join('\n') +
        '\n' + v.praises.map(p => '  + ' + p.text).join('\n');
    }
    return line;
  }
  function simLine(r) {
    const nodes = [...r.nodes.entries()].map(([id, s]) => `${key(id)}:${Object.entries(s).map(([k, v]) => k[0] + r4(v)).join('/')}`).join(' ');
    const links = r.links.map(l => `${key(l.edgeId)}:${key(l.src)}>${key(l.dst)}:${r4(l.amount)}${l.virtual ? 'v' : ''}`).join(' ');
    return `rps${r.rps} atk${r.attack}${r.attackBlocked ? 'B' : ''} served${r4(r.served)} ok${r4(r.successRate)} lat${r4(r.latency)}\n    N ${nodes}\n    L ${links}`;
  }
  function diag(r) {
    const busiest = [...r.nodes.entries()].filter(([, s]) => s.capacity).sort((a, b) => b[1].util - a[1].util)[0];
    const stuck = [...r.nodes.entries()].filter(([, s]) => s.stuck > 0);
    const blocked = [...r.nodes.entries()].filter(([, s]) => s.blocked && s.load > 0);
    const d = simDiagnose(r, busiest, stuck, blocked);
    return d ? `${d.level}: ${d.msg}${d.fix ? ' → ' + d.fix : ''}` : '-';
  }
  // 장애 넣고 시간 진행: 15초마다 결과 기록
  function timeline(name, rps, setup, until = 240) {
    const f = createFaults();
    const out = [`# ${name} rps${rps}`];
    let last = simulateTraffic(rps, simFaultOptions(f));
    for (let t = 1; t <= until; t++) {
      if (t === 10) setup(f);
      stepFaults(f, t, last);
      last = simulateTraffic(rps, simFaultOptions(f));
      if (t % 15 === 0) out.push(`  t${t} ${simLine(last)}\n    D ${diag(last)}`);
    }
    out.push('  log: ' + f.log.map(l => `${l.t}:${l.text}`).join(' / '));
    return out.join('\n');
  }

  const out = [];
  // 1) 판정·제안·잘한 점
  state.nodes = []; state.edges = []; state.containers = [];
  out.push(verdictLine('empty', true));
  build(VALID); out.push(verdictLine('valid', true));
  build(RICH); out.push(verdictLine('rich', true));
  // 정상 구성에 연결선 하나씩 더하기 (모든 짝)
  build(VALID);
  const vKeys = state.nodes.map(n => key(n.id));
  for (let i = 0; i < vKeys.length; i++) for (let j = i + 1; j < vKeys.length; j++) {
    build({ ...VALID, edges: [...VALID.edges, [vKeys[i], vKeys[j]]] });
    out.push(verdictLine(`valid+${vKeys[i]}-${vKeys[j]}`));
  }
  // 풍부한 구성에서 박스 하나씩 / 연결선 하나씩 빼기
  build(RICH);
  const rKeys = state.nodes.map(n => key(n.id));
  rKeys.forEach(k => {
    build(RICH);
    const n = ref(k);
    state.nodes = state.nodes.filter(m => m !== n);
    state.edges = state.edges.filter(e => e.from !== n.id && e.to !== n.id);
    recomputeParents();
    out.push(verdictLine(`rich-${k}`));
  });
  RICH.edges.forEach((e, i) => {
    build({ ...RICH, edges: RICH.edges.filter((_, j) => j !== i) });
    out.push(verdictLine(`rich-edge(${e.join('-')})`));
  });
  // 풍부한 구성에서 박스 하나씩 여러 자리로 옮기기
  rKeys.forEach(k => Object.entries(SPOTS).forEach(([s, [x, y]]) => {
    build(RICH);
    Object.assign(ref(k), C(x, y));
    recomputeParents();
    out.push(verdictLine(`rich:${k}@${s}`));
  }));
  // Auto Scaling 그룹: 한 AZ만 / 두 AZ에 걸침
  build({ ...VALID, areas: [['asg', 340, 370, 400, 120]] }); out.push(verdictLine('valid+asgA'));
  build({ ...VALID, areas: [['asg', 340, 370, 880, 120]] }); out.push(verdictLine('valid+asgAB'));
  // 컨테이너만 있는 앱 계층 (EC2 없음, CTR-05 현재 동작 기록)
  build({ nodes: [['pc', 120, 300], ['igw', 290, 300], ['lb', 400, 270], ['ecs', 400, 430], ['fargate', 880, 430], ['rds', 400, 590], ['rds-standby', 880, 590], ['ecr', 1400, 460]],
    edges: [['pc', 'igw'], ['igw', 'lb'], ['lb', 'ecs'], ['ecs', 'fargate'], ['ecs', 'rds'], ['ecs', 'ecr']] });
  out.push(verdictLine('container-only', true));

  // 2) 성능 시뮬레이션
  [['valid', VALID], ['rich', RICH]].forEach(([name, def]) => {
    build(def);
    [0, 200, 600, 2000].forEach(rps => {
      const r = simulateTraffic(rps, simFaultOptions(createFaults()));
      out.push(`# ${name} ${simLine(r)}\n    D ${diag(r)}`);
    });
    out.push(`# ${name} attack ${simLine(simulateTraffic(200, simFaultOptions(createFaults()), 500))}`);
  });
  build(VALID);
  out.push(timeline('valid ec2#0 down', 200, f => f.down.add(ref('ec2').id)));
  out.push(timeline('valid rds down', 200, f => f.down.add(ref('rds').id)));
  out.push(timeline('valid AZ A down', 200, f => f.downAzs.add(state.containers.find(c => c.type === 'az').id)));
  build({ ...VALID, areas: [['asg', 340, 370, 880, 120]] });
  out.push(timeline('asgAB surge', 900, () => {}, 600));
  out.push(timeline('asgAB ec2 down', 400, f => f.down.add(ref('ec2').id)));
  build(RICH);
  out.push(timeline('rich AZ B down', 300, f => f.downAzs.add(state.containers.filter(c => c.type === 'az')[1].id)));
  return out.join('\n');
}

test('리팩터링 기준선: 판정·제안·잘한 점·시뮬레이션 결과가 저장된 스냅샷과 같다', async ({ page }) => {
  const errors = await openApp(page);
  const text = await page.evaluate(`(${collect.toString()})()`);
  expect(text + '\n').toMatchSnapshot('baseline.txt');
  expect(errors).toEqual([]);
});
