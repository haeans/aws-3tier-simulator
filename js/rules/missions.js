// @ts-check
// js/rules/missions.js — 미션 채점 (42번). 화면에 기대지 않고 구성 s를 받아 목표별 달성 여부를 돌려준다
// 43번(면접식 설계 과제)에서도 같은 틀(과제 = 시작 상태 + 목표 목록)을 쓴다

// 미션 하나를 채점한다. s: 채점할 구성 (없으면 캔버스 구성)
// 돌려주는 값: { goals: [{ text, hint, done }], doneCount, done(모든 목표 달성) }
function gradeMission(mission, s = state) {
  const ctx = missionContext(s);
  const say = v => (typeof v === 'function' ? v(ctx, s) : v);   // 문구가 함수면 지금 구성에 맞춰 만든다 (남은 문제 수 등)
  const goals = mission.goals.map(g => ({ text: say(g.text), hint: say(g.hint), done: !!g.check(ctx, s) }));
  const doneCount = goals.filter(g => g.done).length;
  return { goals, doneCount, done: doneCount === goals.length };
}

// 채점용 조회 도구: 제안용 ctx(모든 서비스) + verdict() = 이 구성의 검증 결과 (여러 목표가 물어도 한 번만 계산)
function missionContext(s = state) {
  let v = null;
  return { ...buildContext(true, s), verdict: () => v || (v = validateArchitecture(s)) };
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

// ----- 고치기·개선 미션 (42-2): 검증 결과로 채점 -----
// 남은 판정 문제 (level: 'error' | 'warn', 없으면 모두)
function missionIssues(ctx, level) {
  return ctx.verdict().issues.filter(i => !level || i.rule.level === level);
}
// 남은 제안 중 번호가 id인 것 (없으면 undefined)
function missionSug(ctx, id) {
  return ctx.verdict().suggestions.find(x => x.rule.id === id);
}
// 제안이 남아 있으면 그 제안의 이유·할 일을 힌트로 (판정 화면과 같은 문구)
function missionSugHint(ctx, id) {
  const g = id ? missionSug(ctx, id) : ctx.verdict().suggestions[0];
  return g ? `${g.reason} → ${g.action}` : '이 목표는 이미 달성했어요.';
}
