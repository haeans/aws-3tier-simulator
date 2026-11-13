// @ts-check
// js/rules/problems.js — 면접식 설계 문제 채점 (43번). 화면에 기대지 않고 구성 s를 받는다
// 미션 채점(js/rules/missions.js)의 조회 도구(missionContext·mission…)를 함께 쓴다

// 문제 하나를 채점한다. s: 채점할 구성 (없으면 캔버스 구성)
// 돌려주는 값: { reqs: [{ text, done, missing: [{ name, why }] }], doneCount, done(모든 요구 충족) }
//   missing: 못 채운 요구에서 모범 답안에는 있는 역할과 그 이유. 기본 요구(검증 정상)는 남은 오류·경고 문구
function gradeProblem(problem, s = state) {
  const ctx = missionContext(s);
  const reqs = [PROBLEM_BASE_REQ, ...problem.reqs].map(r => {
    if (r.base) {
      const issues = ctx.verdict().issues;
      return { text: r.text, done: !issues.length,
        missing: issues.map(i => ({ name: `${i.rule.level === 'error' ? '오류' : '경고'} · ${i.rule.message}`, why: i.message })) };
    }
    const missing = r.roles.filter(role => !role.has(ctx, s)).map(({ name, why }) => ({ name, why }));
    return { text: r.text, done: !missing.length, missing };
  });
  const doneCount = reqs.filter(r => r.done).length;
  return { reqs, doneCount, done: doneCount === reqs.length };
}

// ----- 역할 판단에 쓰는 조회 도구 (js/data/problems.js의 has가 실행 시점에 부른다) -----
// 프라이빗 서브넷의 앱 서버 (EC2·컨테이너. 판정 규칙 7·11과 같은 APP_TYPES)
function problemApps(ctx) {
  return ctx.ofType(...APP_TYPES).filter(n => ctx.zoneOf(n) === 'private');
}
// 사용자 — CloudFront — IGW로 들어오는 길이 있는지 (CloudFront를 거쳐도 입구는 IGW 하나)
function problemViaCdn(ctx) {
  return ctx.ofType(...USER_TYPES).some(u => ctx.neighborsOf(u, 'cloudfront').some(cf => ctx.neighborsOf(cf, 'igw').length > 0));
}
