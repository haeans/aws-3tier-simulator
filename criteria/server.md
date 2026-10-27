# 서버 묶음 — EC2 · Auto Scaling 그룹 · 서브넷·AZ 배치 (조사일 2026-10-27)

기준·양식: README.md. 인용은 영어 원문 15단어 이내. 등급 A 오류 / B 경고 / C 제안 / X 제외.
조사 결과 요약: 이 묶음은 규칙이 대부분 이미 근거와 맞는다. 고칠 곳은 하나(SRV-04, 등급이 현실보다 엄격함)이고, 나머지는 반영됨·보류·제외다.

## 서브넷·AZ

### SRV-01 · 등급 A
- 요약: 서브넷은 AZ 하나 안에만 만들 수 있고, 여러 AZ에 걸칠 수 없다
- 근거: [VPC 서브넷](https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html)
- 인용: "Each subnet must reside entirely within one Availability Zone and cannot span zones."
- 반영 규칙: PLACEMENT_RULES (서브넷은 AZ 안에서만 놓을 수 있음, js/rules/placement.js) — 이미 있음
- 상태: 반영됨

### SRV-02 · 등급 C
- 요약: 서버(EC2)는 가능하면 서로 다른 AZ 2곳 이상에 둔다 (한 AZ에만 있으면 그 AZ 장애 때 서비스가 멈춘다)
- 근거: [Well-Architected REL10-BP01](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html) (위험도 High), [Security Hub AutoScaling.2](https://docs.aws.amazon.com/securityhub/latest/userguide/autoscaling-controls.html)
- 인용: "Deploy and operate all production workloads in at least two Availability Zones" (REL10-BP01)
- 주의: 같은 문서에 "Your production workload exists only in a single Availability Zone"가 나쁜 예(anti-pattern)로 나온다. Security Hub는 배치 작업처럼 AZ 하나가 나은 경우도 있다고 밝힌다 → 오류가 아니라 경고 수준이 맞다
- 반영 규칙: VALIDATION #7 고가용성 (경고, 이미 있음) — 현재 수준 유지
- 상태: 반영됨

## Auto Scaling 그룹

### SRV-03 · 등급 B (이미 제안으로 반영)
- 요약: Auto Scaling 그룹은 AZ 2곳 이상에 걸쳐 쓴다. 한 AZ뿐이면 그 AZ가 멈출 때 다른 AZ에서 서버를 새로 못 띄운다
- 근거: [Security Hub AutoScaling.2](https://docs.aws.amazon.com/securityhub/latest/userguide/autoscaling-controls.html) (Medium)
- 인용: "can't launch instances in another AZ to compensate if the configured single AZ becomes unavailable"
- 주의: 문서가 "배치 작업 등은 AZ 하나가 나을 수 있다"고 인정한다 → 경고로 올리지 않고 제안으로 둔 현재 수준이 현실에 맞다
- 반영 규칙: SUGGESTION #4 자동 확장 (그룹의 EC2가 한 AZ뿐일 때 제안, 이미 있음)
- 상태: 반영됨

### SRV-04 · 등급 C (이미 제안으로 반영)
- 요약: Auto Scaling이 서버 수를 유지하고, 문제 있는 서버는 새 서버로 바꾸고, 여러 AZ에 서버를 나눠 둔다
- 근거: [Auto Scaling 그룹](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-groups.html)
- 인용: "the desired capacity is distributed across these Availability Zones" / "terminates the unhealthy instance and launches another instance"
- 반영 규칙: SUGGESTION #4 (이미 있음)
- 상태: 반영됨

### SRV-05 · 등급 C (이미 반영된 내용 확인)
- 요약: Auto Scaling 그룹에 Load Balancer를 연결하면 서버가 자동으로 Load Balancer에 등록된다 (그룹의 EC2는 LB와 이어져 있어야 한다)
- 근거: [ASG에 Load Balancer 붙이기](https://docs.aws.amazon.com/autoscaling/ec2/userguide/attach-load-balancer-asg.html)
- 인용: "Your instances will be automatically registered to the load balancer"
- 반영 규칙: VALIDATION #3(흐름 연결), #7(LB 연결 EC2의 AZ, v1.30) — 그룹 안의 EC2가 LB와 이어졌는지는 이 규칙들이 본다
- 상태: 반영됨

### SRV-06 · 등급 X
- 요약: ELB 상태 확인 사용(AutoScaling.1), 여러 인스턴스 유형(AutoScaling.6), 시작 템플릿(AutoScaling.9), 메타데이터 v2(AutoScaling.3) 등은 설정값이라 다이어그램으로 표현할 수 없다
- 상태: 제외

## EC2

### SRV-07 · 등급 B (이미 반영됨)
- 요약: 서버(EC2)는 인터넷에 직접 열어 두지 말고 Load Balancer 뒤에 둔다
- 근거: [Security Hub AutoScaling.5](https://docs.aws.amazon.com/securityhub/latest/userguide/autoscaling-controls.html) (High), [Security Hub EC2.9](https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html)
- 인용: "Amazon EC2 instances should only be accessible from behind a load balancer" (AutoScaling.5)
- 반영 규칙: VALIDATION #9 서버 노출 (v1.31, IGW-03과 같은 근거), #8 서버 경로 (IGW-02)
- 상태: 반영됨

### SRV-08 · 등급 B → 현재 오류(error)라 근거보다 엄격함 ★ 고칠 곳
- 요약: EC2는 프라이빗 서브넷에 두는 것을 권장한다. 하지만 퍼블릭 서브넷에 두는 것은 문서가 금지하지 않는다 (IGW 경로가 있는 서브넷에서 공개 IP를 가진 EC2는 실제로 인터넷과 통신한다)
- 근거: [VPC 서브넷 보안](https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html), [IGW](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html), [Security Hub EC2.9](https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html)
- 인용: "we recommend that you use private subnets" (서브넷 보안) / "Amazon EC2 instances should not have a public IPv4 address" (EC2.9, High)
- 현재 앱: VALIDATION #2(계층 배치, 오류)가 "EC2는 프라이빗 서브넷에 있어야 해요"라고 오류로 판정한다. 문서 근거는 "권장(C)"와 "공개 IP 금지(B)"뿐이라 오류(A)는 현실보다 엄격하다.
  퍼블릭 서브넷의 EC2는 SUGGESTION #6(Bastion 서버 제거 제안)도 "관리 접속용일 수 있다"고 인정하는데, 판정은 오류라 서로 어긋난다.
- 제안(사용자 결정 필요): EC2의 위치 검사를 규칙 2에서 떼어 새 경고 규칙으로 옮긴다
  - 서브넷 밖(VPC에만 놓음)·DB 서브넷 → 현재처럼 오류 유지 (서브넷이 아니면 공개 IP·경로를 정할 수 없음, DB 서브넷은 DB 전용)
  - 퍼블릭 서브넷의 EC2 → 경고 (EC2.9·권장 근거). 메시지: "EC2가 퍼블릭 서브넷에 있어요. 인터넷에 드러날 수 있으니 프라이빗 서브넷에 두는 것이 안전해요."
  - 칭찬 2("앱 서버를 인터넷에서 숨겼어요")는 EC2가 모두 프라이빗일 때만
- 영향: 퍼블릭 서브넷에 EC2를 두는 테스트·화면의 상태가 "오류" → "경고"로 바뀜
- 반영 규칙: VALIDATION #2 수정(퍼블릭은 제외) + 새 VALIDATION #11 서버 위치(경고), 칭찬 2 보강 (사용자 승인 2026-10-27)
- 상태: 반영됨 (v1.32)

### SRV-09 · 등급 X
- 요약: EC2—EC2 연결, 어느 것과도 이어지지 않은 단독 EC2는 문서에서 문제로 보는 근거가 없다 (작업용·배치용 서버일 수 있음)
- 처리: 오류·경고·제안 모두 만들지 않는다. 판정·칭찬에 영향이 있는지는 위 변이 테스트에서 확인: 칭찬 7은 EC2가 두 AZ에 있을 때 나오는데, 단독 EC2가 AZ 하나를 채워도 나오는 문제는 LB-02(v1.30)가 "LB와 연결된 EC2가 2 AZ"로 이미 막았다
- 상태: 제외

### SRV-10 · 등급 C (보류)
- 요약: 앱 서버 앞에는 Load Balancer를 둔다 — LB와 이어지지 않은 EC2에 제안
- 근거: [REL10-BP01](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html)
- 인용: "place a load balancer in front of your compute"
- 보류 이유: LB와 이어지지 않은 프라이빗 EC2는 작업용(배치) 서버일 수 있어 오탐이 많다. LB-02·SRV-07이 이미 앱 서버(LB와 이어진 EC2)의 위험을 다룬다
- 상태: 보류

## 3b에서 쓸 조사 요약 (반영 우선순위)

| 우선 | ID | 등급 | 바꿀 곳 |
|---|---|---|---|
| 1 | SRV-08 | B (현재 오류) | 퍼블릭 서브넷의 EC2를 오류 → 경고로 (사용자 결정 필요). 나머지 위치 오류는 유지 |
| - | SRV-01~07 | - | 이미 반영됨 — 변경 없음 |
| - | SRV-09 | X | 제외 |
| - | SRV-10 | C | 보류 |
