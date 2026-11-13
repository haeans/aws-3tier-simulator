// @ts-check
// js/rules/missions.js — 미션 채점 (42번). 화면에 기대지 않고 구성 s를 받아 목표별 달성 여부를 돌려준다
// 43번(면접식 설계 과제)에서도 같은 틀(과제 = 시작 상태 + 목표 목록)을 쓴다

// 미션 하나를 채점한다. s: 채점할 구성 (없으면 캔버스 구성)
// 돌려주는 값: { goals: [{ text, hint, done }], doneCount, done(모든 목표 달성) }
function gradeMission(mission, s = state) {
  const ctx = buildContext(true, s);
  const goals = mission.goals.map(g => ({ text: g.text, hint: g.hint, done: !!g.check(ctx, s) }));
  const doneCount = goals.filter(g => g.done).length;
  return { goals, doneCount, done: doneCount === goals.length };
}

// ----- 목표 조건에 쓰는 조회 도구 (js/data/missions.js의 check가 실행 시점에 부른다) -----
// a 종류 박스 중 b 종류 박스와 직접 연결된 것이 있는지
function missionLinked(ctx, aTypes, bTypes) {
  return ctx.ofType(...aTypes).some(n => ctx.neighborsOf(n, ...bTypes).length > 0);
}
// 프라이빗 서브넷의 EC2
function missionEc2s(ctx) {
  return ctx.ofType('ec2').filter(n => ctx.zoneOf(n) === 'private');
}
// 박스들이 놓인 서로 다른 AZ 수
function missionAzCount(ctx, nodes) {
  return new Set(nodes.map(ctx.azOf).filter(Boolean)).size;
}
// DB 서브넷에 있고, 어떤 RDS와 다른 AZ에 있는 RDS Standby
function missionStandbys(ctx) {
  const rdsAzs = ctx.ofType('rds').map(ctx.azOf).filter(Boolean);
  return ctx.ofType('rds-standby').filter(sb => {
    const az = ctx.azOf(sb);
    return ctx.zoneOf(sb) === 'db' && !!az && rdsAzs.some(a => a !== az);
  });
}
