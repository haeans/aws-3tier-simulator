# 마이그레이션 근거 — MGN(서버)·DMS(DB) (49번)

- 확인한 날: 2026-11-13
- 방법: docs.aws.amazon.com·aws.amazon.com 페이지를 WebFetch로 직접 열어 본문에서 문장을 확인했다 (하위 에이전트가 조사, 인용·주소를 그대로 옮김)
- 참고: MGN(AWS Application Migration Service)은 문서에서 "AWS Transform MGN"이라는 이름으로도 나온다
- 등급: criteria/README.md의 A 오류 / B 경고 / C 제안 / X 제외

---

## MGN — 서버 옮기기 (rehost, lift-and-shift)

### MG-01 · 등급 A (구성 요소)
- 요약: 원본 서버마다 AWS Replication Agent를 설치하면, 블록 단위 변경을 복제 서버로 계속 복제한다
- 근거: https://docs.aws.amazon.com/mgn/latest/ug/what-is-application-migration-service.html
- 인용: "Software that you install on each source server to add it to MGN... captures writes and replicates block-level changes to the replication server."
- 표현 방식: 온프레미스 서버 → MGN 복제 서버 선(복제·전달). 원본 서버가 없는 MGN 박스는 오류

### MG-02 · 등급 C (스테이징 서브넷)
- 요약: 복제 서버는 스테이징 영역 서브넷에 뜨는 가벼운 EC2다. 기존 서브넷도 되지만 전용 서브넷을 새로 만드는 것이 모범 사례
- 근거: https://docs.aws.amazon.com/mgn/latest/ug/Network-Requirements.html
- 인용: "While you can use an existing subnet in your AWS account, the best practice is to create a new dedicated subnet for this purpose."
- 인용 2 (what-is 페이지): "A lightweight Amazon EC2 instance that replicates data between your source servers and AWS... launches... in the staging area subnet."
- 표현 방식: MGN 복제 서버가 앱 서버(EC2 등)와 같은 서브넷에 있으면 제안 (전용 서브넷)

### MG-03 · 등급 A (네트워크)
- 요약: 원본 서버는 스테이징 서브넷의 복제 서버와 TCP 1500으로, MGN API 엔드포인트와 TCP 443으로 계속 통신한다. 복제 서버도 443으로 MGN·S3·EC2 엔드포인트에 닿아야 한다(IGW+공인 IP 또는 NAT)
- 근거: https://docs.aws.amazon.com/mgn/latest/ug/Network-Requirements.html
- 인용: "Each source server with an installed AWS Replication Agent continuously communicates with the replication servers in the staging area subnet over TCP port 1500."
- 인용 2: "Each source server that is added to MGN must continuously communicate with the MGN API endpoint over TCP port 443."
- 표현 방식: 45번 보안 그룹에 "TCP 1500 ← 원본 서버" 규칙. 복제 서버가 밖으로 나가는 길(NAT·IGW)은 설명에 적는다

### MG-04 · 등급 A (연결 방식 설명)
- 요약: 복제 데이터는 기본으로 공용 인터넷으로 가고, "프라이빗 IP 사용"을 고르면 VPN·Direct Connect·VPC 피어링 같은 사설망으로 보낸다
- 근거: https://docs.aws.amazon.com/mgn/latest/ug/replication-server-settings.html
- 인용: "Choose the Use private IP option if you want to route the replicated data... through a private network with a VPN, AWS Direct Connect, VPC peering..."
- 인용 2: "By default, data is sent from the source servers to the replication servers over the public internet."
- 표현 방식: 온프레미스 서버 → MGN 선은 IDC에서 AWS로 바로 가도 된다 (판정 20의 예외). VPN·Direct Connect가 있으면 설명에 "사설망으로 보낼 수 있어요"

### MG-05 · 등급 A (테스트·전환)
- 요약: 테스트 인스턴스와 전환(cutover) 인스턴스는 각 원본 서버의 시작 템플릿에 정한 서브넷에 뜬다. 전환 뒤 "전환 완료 → MGN 연결 끊기 → 원본 서버 보관 또는 삭제" 순서
- 근거: https://docs.aws.amazon.com/mgn/latest/ug/Network-Requirements.html
- 인용: "Test and cutover instances are launched in a subnet you specify in the Amazon EC2 launch template associated with each source server."
- 근거 2: https://docs.aws.amazon.com/mgn/latest/ug/server-post-migration.html ("Finalize cutover", "Disconnect from AWS Transform MGN", "Archive the source server or delete the source server")
- 주의: 보관(archive)은 MGN 목록에서 빼는 것일 뿐, 실제 장비를 정리하라는 문장은 없다
- 표현 방식: MGN → EC2 선(복제·전달) = 전환할 대상 서버. 대상 서버가 없는 MGN 박스는 오류

### MG-06 · 등급 X (설명만)
- 요약: 대규모 lift-and-shift 마이그레이션은 대부분 MGN을 쓴다. 다시 호스팅(rehost)은 현대화로 가는 빠른 첫걸음
- 근거: https://docs.aws.amazon.com/prescriptive-guidance/latest/migration-database-rehost-tools/mgn.html
- 인용: "Most large lift-and-shift migrations to AWS use AWS Transform MGN."
- 주의: "권장(recommend)" 문장은 확인하지 못했다(검색 요약에서만 봄). 규칙은 만들지 않고 설명 문구에만 쓴다

## DMS — DB 옮기기

### DM-01 · 등급 A (서브넷 그룹)
- 요약: DMS 복제 인스턴스는 항상 VPC 안에 만들고, 복제 서브넷 그룹에는 서로 다른 AZ의 서브넷이 2개 이상 있어야 한다
- 근거: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.VPC.html
- 인용: "You create a replication subnet group to define which subnets to use. You must specify subnets in at least two Availability Zones."
- 인용 2: "AWS DMS always creates the replication instance in a VPC based on Amazon VPC."
- 표현 방식: DMS 복제 인스턴스는 VPC 안 서브넷에. 서로 다른 AZ의 서브넷이 2개 미만이면 오류 (판정 19 EKS와 같은 방식)

### DM-02 · 등급 A (원본·대상)
- 요약: 복제 인스턴스가 원본 DB에 접속해 읽고, 대상 DB에 넣는다. 온프레미스 원본은 Direct Connect·VPN 또는 인터넷으로 닿는다
- 근거: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.html
- 인용: "AWS DMS uses a replication instance to connect to your source data store... A replication instance also loads the data into the target data store."
- 근거 2 (CHAP_ReplicationInstance.VPC.html): "...connected by using Direct Connect or a VPN to a VPC that contains the replication instance and a target database on an Amazon RDS DB instance."
- 표현 방식: 원본 DB(온프레미스 DB) → DMS → 대상 DB(RDS) 선(복제·전달). 원본이나 대상이 없으면 오류. 온프레미스 DB → DMS 선은 IDC에서 AWS로 바로 가도 된다 (판정 20의 예외, 인터넷 경로)

### DM-03 · 등급 A (설명)
- 요약: 전체 로드 + 변경 데이터 캡처(CDC)로 기존 데이터를 옮긴 뒤 원본의 변경을 계속 반영한다. 다운타임을 거의 없게 한다(제품 페이지)
- 근거: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html
- 인용: "Full load plus CDC – The task migrates existing data and then updates the target database based on changes to the source database."
- 인용 2 (https://aws.amazon.com/dms/): "Minimize operational disruption with near-zero downtime and zero data loss."
- 주의: "AWS DMS CDC does not provide real-time replication."
- 표현 방식: DMS 설명 문구

### DM-04 · 등급 X (기능 설명만)
- 요약: Multi-AZ로 만들면 다른 AZ에 동기식 예비 복제 인스턴스를 둔다
- 근거: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.html
- 인용: "In a Multi-AZ deployment, AWS DMS automatically provisions and maintains a synchronous standby replica of the replication instance in a different Availability Zone."
- 주의: 기능 설명이고 권장 문장이 아니라 규칙은 만들지 않는다

### DM-05 · 등급 A (보안 그룹)
- 요약: 원본·대상 DB 엔드포인트의 보안 그룹은 복제 인스턴스에서 오는 연결을 허용해야 한다 (복제 인스턴스의 보안 그룹이나 IP). 복제 인스턴스의 보안 그룹은 나가는 연결을 모두 허용
- 근거: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.VPC.html
- 인용: "The database endpoints must include network access control lists (ACLs) and security group rules (if applicable) that allow incoming access from the replication instance."
- 표현 방식: 45번 보안 그룹 — RDS에 "DB 포트 ← DMS의 보안 그룹" 규칙

### DM-06 · 등급 X (설명만)
- 요약: 다른 엔진으로 옮기면(이기종) 스키마 변환(DMS Schema Conversion 또는 AWS SCT)을 쓴다. 같은 엔진(동종)은 엔진의 기본 도구로 같은 형태로 옮긴다
- 근거: https://docs.aws.amazon.com/dms/latest/userguide/Welcome.html
- 인용: "To migrate to a different database engine, you can use DMS Schema Conversion... Alternatively, you can download the AWS Schema Conversion Tool (AWS SCT)."
- 주의: "동종은 스키마 변환이 필요 없다"는 문장은 찾지 못했다 (추론). 엔진을 입력받지 않으므로 규칙 없음

### DM-07 · 등급 C
- 요약: 가능하면 복제 인스턴스를 대상과 같은 리전, 같은 VPC나 서브넷에 둔다. VPC가 다르면 피어링으로 잇는다
- 근거: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.VPC.html
- 인용: "When practical, we recommend that you create a DMS replication instance in the same Region as your target endpoint, and in the same VPC or subnet as your target endpoint."
- 표현 방식: 앱이 VPC 하나만 다루므로 규칙은 만들지 않고, DMS를 VPC 안에 두는 배치 규칙(DM-01)으로 충분하다
