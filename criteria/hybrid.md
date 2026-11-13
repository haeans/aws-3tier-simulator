# 하이브리드 연결 근거 — IDC(온프레미스) ↔ VPC (48번)

- 확인한 날: 2026-11-13
- 방법: docs.aws.amazon.com 페이지를 WebFetch로 직접 열어 본문에서 문장을 확인했다 (하위 에이전트가 조사, 인용·주소를 그대로 옮김)
- 등급: criteria/README.md의 A 오류 / B 경고 / C 제안 / X 제외

---

### HY-01 · 등급 A
- 요약: Site-to-Site VPN은 AWS 쪽 가상 프라이빗 게이트웨이(또는 Transit Gateway) + 고객 게이트웨이(AWS에 만드는 리소스) + 고객 게이트웨이 장치(온프레미스)로 이뤄진다
- 근거: https://docs.aws.amazon.com/vpn/latest/s2svpn/how_it_works.html
- 인용: "A Site-to-Site VPN connection consists of the following components: A virtual private gateway or a transit gateway, A customer gateway device, A customer gateway"
- 인용 2: "a resource that you create in AWS that represents the customer gateway device in your on-premises network."
- 표현 방식: IDC 쪽 고객 게이트웨이와 VPC 쪽 가상 프라이빗 게이트웨이가 연결(VPN)로 이어져야 IDC와 VPC가 통신한다

### HY-02 · 등급 A
- 요약: 가상 프라이빗 게이트웨이는 VPC에 붙여야 하고, 한 번에 VPC 하나에만 붙는다
- 근거: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_AttachVpnGateway.html
- 인용: "You can attach one virtual private gateway to one VPC at a time."
- 인용 2 (https://docs.aws.amazon.com/vpn/latest/s2svpn/SetUpVPNConnections.html): "After you create a virtual private gateway, you must attach it to your VPC."
- 표현 방식: 가상 프라이빗 게이트웨이는 VPC 경계에 놓는다 (IGW와 같은 방식)

### HY-03 · 등급 C
- 요약: VPN 연결 하나에는 터널이 2개 있고(서로 다른 AZ에서 끝남), 둘 다 설정해야 이중화된다
- 근거: https://docs.aws.amazon.com/vpn/latest/s2svpn/VPNTunnels.html
- 인용: "Each Site-to-Site VPN connection has two tunnels, with each tunnel using a unique public IP address. It is important to configure both tunnels for redundancy."
- 인용 2: "Each tunnel terminates in a different Availability Zone to provide increased availability."
- 표현 방식: 화면 설명(VPN 선 = 터널 2개). 사용자가 터널을 그리지 않으므로 규칙은 만들지 않는다

### HY-04 · 등급 A
- 요약: VPC의 라우팅 테이블에 온프레미스 네트워크로 가는 경로(대상: 가상 프라이빗 게이트웨이)가 있어야 한다. 경로 전파를 켜면 자동으로 들어간다
- 근거: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html
- 인용: "In your VPC route table, you must add a route for your remote network and specify the virtual private gateway as the target."
- 인용 2: "You can enable route propagation for your route table to automatically propagate your network routes."
- 표현 방식: 45번 라우팅 테이블에 "온프레미스(예: 192.168.0.0/16) → 가상 프라이빗 게이트웨이" 줄 (경로 전파로 자동이라고 설명)

### HY-05 · 등급 A
- 요약: 온프레미스에서 VPC 안 인스턴스에 접속하려면 보안 그룹 규칙에서 그 트래픽을 허용해야 한다
- 근거: https://docs.aws.amazon.com/vpn/latest/s2svpn/SetUpVPNConnections.html
- 인용: "To allow access to instances in your VPC from your network, you must update your security group rules to enable inbound SSH, RDP, and ICMP access."
- 표현 방식: 45번 보안 그룹에 "온프레미스(CIDR)에서 오는 규칙" 줄. 문서 예시는 SSH·RDP·ICMP라 앱 포트는 "예"로만 적는다

### HY-06 · 등급 A (연결 방식 설명)
- 요약: Direct Connect는 사내망을 Direct Connect 위치까지 전용 광케이블로 잇고, 프라이빗 가상 인터페이스로 가상 프라이빗 게이트웨이(또는 Direct Connect 게이트웨이)에 닿아 VPC로 간다
- 근거: https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html
- 인용: "Direct Connect links your internal network to a Direct Connect location over a standard Ethernet fiber-optic cable."
- 인용 2: "Connect a private virtual interface to a Direct Connect gateway to access multiple virtual private gateways…"
- 표현 방식: 고객 게이트웨이—가상 프라이빗 게이트웨이 연결의 종류가 Direct Connect

### HY-07 · 등급 C
- 요약: Direct Connect의 고가용성은 연결을 더 두는 것, 또는 Site-to-Site VPN을 비용 효율적인 백업으로 두는 것 (Well-Architected)
- 근거: https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_network_topology_ha_conn_private_networks.html
- 인용: "You can also consider AWS Site-to-Site VPN ending on an AWS Transit Gateway as a cost-effective backup to your primary AWS Direct Connect connection."
- 인용 2 (https://docs.aws.amazon.com/whitepapers/latest/aws-vpc-connectivity-options/aws-direct-connect.html): "When discussing high availability in AWS Direct Connect, we recommend using additional Direct Connect connections."
- 주의: 인용은 Transit Gateway에서 끝나는 VPN을 말한다. 앱은 Transit Gateway가 없으므로 "연결이 하나뿐이면 이중화 제안"으로만 쓴다
- 표현 방식: IDC와 VPC 사이 연결이 하나뿐이면 제안 (VPN 백업 또는 Direct Connect 하나 더)

### HY-08 · 등급 A (연결 방식 설명)
- 요약: Site-to-Site VPN은 인터넷을 거치는 IPsec(암호화) 연결, Direct Connect는 인터넷을 거치지 않아 대역폭·일관성이 좋다. 단 Direct Connect는 기본으로 암호화되지 않는다
- 근거 VPN: https://docs.aws.amazon.com/whitepapers/latest/aws-vpc-connectivity-options/aws-site-to-site-vpn.html
- 인용: "Amazon VPC provides the option of creating an IPsec VPN connection between your remote networks and Amazon VPC over the internet."
- 근거 DX: https://docs.aws.amazon.com/whitepapers/latest/aws-vpc-connectivity-options/aws-direct-connect.html
- 인용: "Direct Connect can reduce network costs, increase bandwidth throughput, and provide a more consistent network experience than internet-based connections."
- 인용 2 (같은 페이지): "AWS Direct Connect is not encrypted by default."
- 표현 방식: 연결선 종류 설명, 성능 시뮬레이션의 지연(가정: VPN이 Direct Connect보다 느림)

### HY-09 · 등급 C
- 요약: Well-Architected REL02-BP02 — 클라우드와 온프레미스 사이 프라이빗 연결은 이중화한다 (위험도 High). 터널 하나만 쓰거나 같은 AZ에서 끝나는 터널만 쓰는 것은 안티 패턴
- 근거: https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_network_topology_ha_conn_private_networks.html
- 인용: "REL02-BP02 Provision redundant connectivity between private networks in the cloud and on-premises environments"
- 인용 2: "You use only one VPN tunnel or multiple tunnels that end in the same Availability Zone."
- 표현 방식: HY-07과 같은 제안의 근거

### HY-10 · 등급 C
- 요약: 온프레미스와 VPC의 주소 범위(CIDR)는 겹치지 않게 하라고 권장한다. 겹치면 VPC의 local 경로가 우선해 온프레미스로 가지 못한다
- 근거: https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html
- 인용: "When connecting your VPCs to a common on-premises network, we recommend that you use non-overlapping CIDR blocks for your networks."
- 인용 2 (https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html): "If propagated routes from a Site-to-Site VPN connection or Direct Connect connection overlap with the local route for your VPC, the local route is most preferred even if the propagated routes are more specific."
- 표현 방식: 사용자가 CIDR을 입력하지 않으므로(54번 전) 규칙은 만들지 않고, 라우팅 테이블 설명에 예시 주소를 서로 겹치지 않게 둔다(VPC 10.0.0.0/16, 온프레미스 192.168.0.0/16)
