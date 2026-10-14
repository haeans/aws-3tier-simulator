// js/rules/placement.js — 배치 제한 규칙 (서비스 위치, 영역 중첩)

/* =========================================================
   배치 제한 규칙
   ========================================================= */

// 받침 있는 영문 이름 (조사 은/는 선택용)
const BATCHIM_NAMES = new Set([
  'IAM', 'ECR', 'NAT', 'Client VPN', 'CodeCommit', 'CodePipeline',
  'CloudTrail', 'CloudFormation', 'Auto Scaling',
]);
// 이름 뒤에 '은/는'을 붙여 돌려준다
function eunNeun(word) {
  const code = word.charCodeAt(word.length - 1);
  const hasBatchim = (code >= 0xAC00 && code <= 0xD7A3)
    ? (code - 0xAC00) % 28 !== 0
    : BATCHIM_NAMES.has(word);
  return word + (hasBatchim ? '은' : '는');
}

// 서비스 박스의 현재 위치 구역: 'outside' | 'vpc'(VPC·AZ 안, 서브넷 밖) | 'public' | 'private' | 'db'
function zoneOf(node) {
  const p = findContainer(node.parentContainer);
  if (!p) return 'outside';
  if (p.type === 'vpc' || p.type === 'az') return 'vpc';
  return p.type;
}

// allowedZone별 배치 허용 여부와 안내 메시지
const PLACEMENT_RULES = {
  outside: {
    test: zone => zone === 'outside',
    message: name => `${eunNeun(name)} VPC 밖에서 사용하는 서비스예요. VPC 바깥에 놓아주세요.`,
  },
  vpcEdge: {
    test: zone => zone === 'outside' || zone === 'vpc',
    message: name => `${eunNeun(name)} 서브넷 안에는 놓을 수 없어요. VPC 바깥이나 서브넷 밖의 VPC 영역에 놓아주세요.`,
  },
  private: {
    test: zone => zone === 'private',
    message: name => `${eunNeun(name)} 프라이빗 서브넷 안에만 놓을 수 있어요.`,
  },
  // 여러 AZ에 걸치는 그룹(Auto Scaling 등): 프라이빗 서브넷 또는 VPC 안 서브넷 밖
  vpcInner: {
    test: zone => zone === 'private' || zone === 'vpc',
    message: name => `${eunNeun(name)} 프라이빗 서브넷이나, VPC 안의 서브넷 밖(AZ 사이 빈 곳 등)에만 놓을 수 있어요.`,
  },
  db: {
    test: zone => zone === 'db',
    message: name => `${eunNeun(name)} DB 서브넷 안에만 놓을 수 있어요.`,
  },
  any: {
    test: () => true,
    message: () => '',
  },
};

// 영역 중첩 규칙: VPC > AZ > 서브넷 (parentType = 소속 영역 종류, 없으면 null)
const NESTING_RULES = {
  vpc: {
    test: parentType => parentType === null,
    message: () => 'VPC는 다른 영역 안에 놓을 수 없어요. VPC 바깥의 빈 곳에 놓아주세요.',
  },
  az: {
    test: parentType => parentType === 'vpc',
    message: parentType => parentType === null
      ? 'AZ(가용 영역)는 VPC 안에 놓아야 해요.'
      : 'AZ(가용 영역)는 서브넷이나 다른 AZ 안에 놓을 수 없어요. VPC 안의 빈 곳에 놓아주세요.',
  },
  subnet: {
    test: parentType => parentType === 'az',
    message: (parentType, name) => SUBNET_TYPES.includes(parentType)
      ? '서브넷 안에 다른 서브넷을 넣을 수 없어요. AZ 안의 빈 곳에 놓아주세요.'
      : `${eunNeun(name)} AZ(가용 영역) 안에 놓아야 해요.`,
  },
};
const nestingRuleOf = type => NESTING_RULES[SUBNET_TYPES.includes(type) ? 'subnet' : type];

// 전체 상태에서 규칙 위반을 찾는다. 방금 조작한 항목(actedId)의 위반을 우선 안내.
function findViolation(actedId) {
  const list = [];
  state.containers.forEach(c => {
    const parent = findContainer(c.parentContainer);
    const parentType = parent ? parent.type : null;
    const rule = nestingRuleOf(c.type);
    if (!rule.test(parentType)) {
      list.push({ id: c.id, msg: rule.message(parentType, AREA_MAP[c.type].name) });
    }
  });
  state.nodes.forEach(n => {
    const svc = SVC_MAP[n.type];
    const rule = PLACEMENT_RULES[svc.allowedZone];
    if (!rule.test(zoneOf(n))) list.push({ id: n.id, msg: rule.message(svc.name) });
  });
  if (!list.length) return null;
  const own = list.find(v => v.id === actedId);
  return own ? own.msg : `그렇게 하면 다른 항목의 위치가 규칙에 어긋나요. ${list[0].msg}`;
}

