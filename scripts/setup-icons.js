// @ts-check
// scripts/setup-icons.js — AWS 공식 아키텍처 아이콘을 icons/ 폴더로 복사한다 (개발 도구, 사용자 실행 파일 아님)
//
// 아이콘 파일은 저장소에 올리지 않는다 (.gitignore). AWS는 아키텍처 그림을 만드는 데 쓰도록 허락하지만,
// 공개 저장소에 다시 배포하는 것에 대한 규정은 없어서다 (23번 사용자 결정, 2026-11-10).
//
// 쓰는 법:
//   1. https://aws.amazon.com/architecture/icons/ 에서 "Icon package" zip을 내려받아 압축을 푼다
//   2. npm run icons -- <압축을 푼 폴더>
// 아이콘이 없어도 앱은 글자 박스로 그대로 동작한다.
const fs = require('fs');
const path = require('path');

// 앱 이름 → 아이콘 파일 이름 (zip 안에서 이 이름의 파일을 찾는다. 같은 그림이면 이름만 바꿔 복사)
// 공식 아이콘이 따로 없는 것: 스마트폰·태블릿(Mobile client), PC(Client), DB 관리자(User), RDS 복제본·예비본(RDS)
const ICON_FILES = {
  smartphone:      'Res_Mobile-client_48_Light.svg',
  tablet:          'Res_Mobile-client_48_Light.svg',
  pc:              'Res_Client_48_Light.svg',
  dbadmin:         'Res_User_48_Light.svg',
  route53:         'Arch_Amazon-Route-53_48.svg',
  cloudfront:      'Arch_Amazon-CloudFront_48.svg',
  igw:             'Res_Amazon-VPC_Internet-Gateway_48.svg',
  nat:             'Res_Amazon-VPC_NAT-Gateway_48.svg',
  lb:              'Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg',
  vpce:            'Res_Amazon-VPC_Endpoints_48.svg',
  clientvpn:       'Arch_AWS-Client-VPN_48.svg',
  ec2:             'Arch_Amazon-EC2_48.svg',
  ecr:             'Arch_Amazon-Elastic-Container-Registry_48.svg',
  ecs:             'Arch_Amazon-Elastic-Container-Service_48.svg',
  eks:             'Arch_Amazon-Elastic-Kubernetes-Service_48.svg',
  fargate:         'Arch_AWS-Fargate_48.svg',
  s3:              'Arch_Amazon-Simple-Storage-Service_48.svg',
  dynamodb:        'Arch_Amazon-DynamoDB_48.svg',
  rds:             'Arch_Amazon-RDS_48.svg',
  'rds-replica':   'Arch_Amazon-RDS_48.svg',
  'rds-standby':   'Arch_Amazon-RDS_48.svg',
  elasticache:     'Arch_Amazon-ElastiCache_48.svg',
  codecommit:      'Arch_AWS-CodeCommit_48.svg',
  codebuild:       'Arch_AWS-CodeBuild_48.svg',
  codepipeline:    'Arch_AWS-CodePipeline_48.svg',
  codedeploy:      'Arch_AWS-CodeDeploy_48.svg',
  waf:             'Arch_AWS-WAF_48.svg',
  sessionmanager:  'Res_AWS-Systems-Manager_Session-Manager_48.svg',
  cloudtrail:      'Arch_AWS-CloudTrail_48.svg',
  iam:             'Arch_AWS-Identity-and-Access-Management_48.svg',
  cloudwatch:      'Arch_Amazon-CloudWatch_48.svg',
  cloudformation:  'Arch_AWS-CloudFormation_48.svg',
  // 영역 이름표 (AZ는 공식 그룹 아이콘이 없음, DB 서브넷은 프라이빗 서브넷 아이콘)
  'area-vpc':      'Virtual-private-cloud-VPC_32.svg',
  'area-public':   'Public-subnet_32.svg',
  'area-private':  'Private-subnet_32.svg',
  'area-asg':      'Auto-Scaling-group_32.svg',
};

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('압축을 푼 아이콘 폴더를 알려주세요.  예) npm run icons -- C:\\Downloads\\Icon-package');
  process.exit(1);
}

// 폴더 전체에서 파일 이름 → 경로 (macOS 압축 잔여물 __MACOSX는 건너뜀)
const found = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__MACOSX') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (!found.has(e.name)) found.set(e.name, p);
  }
})(src);

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
const missing = [];
for (const [key, file] of Object.entries(ICON_FILES)) {
  const from = found.get(file);
  if (!from) { missing.push(`${key} (${file})`); continue; }
  fs.copyFileSync(from, path.join(out, key + '.svg'));
}
console.log(`icons/ 폴더에 ${Object.keys(ICON_FILES).length - missing.length}개를 복사했어요.`);
if (missing.length) {
  console.log('찾지 못한 아이콘 (그 박스는 글자로 보여요):\n  ' + missing.join('\n  '));
  process.exitCode = 1;
}
