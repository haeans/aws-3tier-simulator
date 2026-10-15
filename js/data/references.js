// @ts-check
// js/data/references.js — 출처·근거 (Well-Architected 기준, 서비스별 AWS 공식 문서 링크)

/* =========================================================
   AWS Well-Architected 기준 (판정·제안 규칙의 근거 태그)
   규칙마다 pillars: [키...], basis: '왜 그런지', ref: '근거 문서 주소' 를 적는다.
   pillars가 비어 있으면 "3-Tier 기본 구조"에 관한 규칙이다.
   ========================================================= */
const WA_DOCS = 'https://docs.aws.amazon.com/wellarchitected/latest/';
const PILLARS = {
  security:    { label: '보안',   url: WA_DOCS + 'security-pillar/welcome.html' },
  reliability: { label: '안정성', url: WA_DOCS + 'reliability-pillar/welcome.html' },
  performance: { label: '성능',   url: WA_DOCS + 'performance-efficiency-pillar/welcome.html' },
  cost:        { label: '비용',   url: WA_DOCS + 'cost-optimization-pillar/welcome.html' },
  operations:  { label: '운영',   url: WA_DOCS + 'operational-excellence-pillar/welcome.html' },
};

/* =========================================================
   서비스별 AWS 공식 문서 (설명 패널의 "AWS 문서" 링크)
   설명 문구(SERVICE_DESC, SERVICE_GUIDE)는 이 문서들을 근거로 쓴다.
   ========================================================= */
const SERVICE_DOCS = {
  // 사용자: AWS 서비스가 아니므로, 인터넷에서 VPC로 들어오는 길(인터넷 게이트웨이) 문서
  smartphone:     'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html',
  tablet:         'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html',
  pc:             'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html',
  // DB 관리자: VPC 안의 DB에 접속하는 방법 (공개하지 않은 DB는 Client VPN 등으로 접속)
  dbadmin:        'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.Scenarios.html',
  route53:        'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html',
  cloudfront:     'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html',
  igw:            'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html',
  nat:            'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html',
  lb:             'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html',
  vpce:           'https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html',
  clientvpn:      'https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/what-is.html',
  ec2:            'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html',
  ecr:            'https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html',
  ecs:            'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html',
  eks:            'https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html',
  fargate:        'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html',
  s3:             'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
  dynamodb:       'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html',
  rds:            'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html',
  'rds-replica':  'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html',
  'rds-standby':  'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html',
  elasticache:    'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html',
  codecommit:     'https://docs.aws.amazon.com/codecommit/latest/userguide/welcome.html',
  codebuild:      'https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html',
  codepipeline:   'https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html',
  codedeploy:     'https://docs.aws.amazon.com/codedeploy/latest/userguide/welcome.html',
  waf:            'https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html',
  sessionmanager: 'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html',
  cloudtrail:     'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html',
  iam:            'https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html',
  cloudwatch:     'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html',
  cloudformation: 'https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html',
};
