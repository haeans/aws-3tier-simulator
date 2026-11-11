// @ts-check
// js/model.js — 캔버스 상태와 화면(DOM)에 기대지 않는 도구 (R2)
// 규칙(js/rules/)과 화면(js/ui/)이 함께 쓴다. 그래서 data 다음, rules 앞에 불러온다.
// 여기에는 DOM(document·$요소)을 쓰는 코드를 넣지 않는다.

// ----- 캔버스 상태 -----
const state = {
  nodes: [],       // { id, type, x, y, parentContainer }
  containers: [],  // { id, type, x, y, width, height, parentContainer, label }
  edges: [],       // { id, from, to, fromSide, toSide, mid, kind? } - 연결 변·경로는 null이면 자동 (UI-5 참고). kind: 사용자가 고른 선 종류 (26번, 없으면 자동)
};
let idSeq = 1;
const newId = prefix => `${prefix}${idSeq++}`;   // n=서비스, c=영역, e=연결선

// ----- 박스·영역 찾기 -----
// s: 구성 (R3, 없으면 캔버스 구성 state). map(findNode)처럼 넘기면 두 번째 인자(순번)가 s로 들어가므로 화살표 함수로 감싼다
const findNode = (id, s = state) => s.nodes.find(n => n.id === id);
const findContainer = (id, s = state) => s.containers.find(c => c.id === id);
const isContainer = item => item.width !== undefined;

// ----- 도형 계산 (박스 크기 NODE_W·NODE_H는 js/data/services.js) -----
function rectOf(item) {
  return isContainer(item)
    ? { x: item.x, y: item.y, w: item.width, h: item.height }
    : { x: item.x, y: item.y, w: NODE_W, h: NODE_H };
}
function centerOf(item) {
  const r = rectOf(item);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
function inRect(r, p) {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}
// 테두리 위의 점도 안으로 보는 판정 (VPC 경계선에 걸친 박스용)
function inRectInclusive(r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
// 두 사각형이 겹치는지 (변이 맞닿기만 한 경우는 겹침 아님)
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
