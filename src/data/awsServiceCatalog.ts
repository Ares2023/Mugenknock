export type ServiceEntry = { name: string; serviceIds?: string[]; };
export type Category = { category: string; services: ServiceEntry[]; };

export const CATALOG: Category[] = [
  {
    category: 'コンピューティング',
    services: [
      { name: 'EC2',                                  serviceIds: ['svc-ec2-6'] },
      { name: 'Lightsail' },
      { name: 'Lambda',                               serviceIds: ['2ca534b1-a776-424a-8d0f-0d7a05aab154'] },
      { name: 'Batch' },
      { name: 'Elastic Beanstalk' },
      { name: 'Serverless Application Repository' },
      { name: 'AWS Outposts' },
      { name: 'EC2 Image Builder' },
      { name: 'AWS App Runner' },
      { name: 'パラレルコンピューティングサービス' },
      { name: 'AWS Global View' },
    ],
  },
  {
    category: 'コンテナ',
    services: [
      { name: 'Elastic Container Service',            serviceIds: ['svc-ecs-12'] },
      { name: 'Elastic Kubernetes Service',           serviceIds: ['svc-eks-13'] },
      { name: 'Red Hat OpenShift Service on AWS' },
      { name: 'Elastic Container Registry' },
    ],
  },
  {
    category: 'ストレージ',
    services: [
      { name: 'S3',                                   serviceIds: ['398b303b-1873-4cfb-b4f2-fa71ad5a4b8c'] },
      { name: 'EFS',                                  serviceIds: ['svc-efs-31'] },
      { name: 'EBS',                                  serviceIds: ['svc-ebs-25'] },
      { name: 'FSx' },
      { name: 'S3 Glacier' },
      { name: 'Storage Gateway' },
      { name: 'AWS Backup' },
      { name: 'Recycle Bin' },
      { name: 'AWS Elastic Disaster Recovery' },
    ],
  },
  {
    category: 'データベース',
    services: [
      { name: 'Aurora and RDS',                       serviceIds: ['svc-aurora-29', 'svc-rds-7'] },
      { name: 'ElastiCache',                          serviceIds: ['svc-elasticache-20'] },
      { name: 'Neptune' },
      { name: 'Amazon DocumentDB' },
      { name: 'Amazon Keyspaces' },
      { name: 'Amazon Timestream' },
      { name: 'DynamoDB',                             serviceIds: ['68c89b55-eeb0-4d01-be0a-e37b0e57d76f'] },
      { name: 'Aurora DSQL' },
      { name: 'Amazon MemoryDB' },
      { name: 'Oracle Database@AWS' },
    ],
  },
  {
    category: '移行と転送',
    services: [
      { name: 'AWS Migration Hub' },
      { name: 'AWS Application Migration Service' },
      { name: 'Application Discovery Service' },
      { name: 'Database Migration Service' },
      { name: 'AWS Transfer Family' },
      { name: 'AWS Snow Family' },
      { name: 'DataSync' },
      { name: 'AWS Transform' },
      { name: 'AWS Mainframe Modernization' },
      { name: 'Amazon Elastic VMware Service' },
    ],
  },
  {
    category: 'ネットワーキングとコンテンツ配信',
    services: [
      { name: 'VPC',                                  serviceIds: ['svc-vpc-8'] },
      { name: 'CloudFront',                           serviceIds: ['b3d71a09-b495-4573-933f-34be6cbdb9b5'] },
      { name: 'API Gateway',                          serviceIds: ['svc-api-gateway-15'] },
      { name: 'Direct Connect' },
      { name: 'AWS App Mesh' },
      { name: 'Global Accelerator' },
      { name: 'Route 53',                             serviceIds: ['svc-route-53-17'] },
      { name: 'AWS データ転送ターミナル' },
      { name: 'Amazon Route 53 グローバルリゾルバー' },
      { name: 'AWS Cloud Map' },
      { name: 'RTB Fabric' },
      { name: 'Application Recovery Controller' },
    ],
  },
  {
    category: '開発者用ツール',
    services: [
      { name: 'CodeCommit' },
      { name: 'CodeBuild' },
      { name: 'CodeDeploy' },
      { name: 'CodePipeline',                         serviceIds: ['svc-codepipeline-24'] },
      { name: 'Cloud9' },
      { name: 'CloudShell' },
      { name: 'X-Ray' },
      { name: 'AWS FIS' },
      { name: 'Infrastructure Composer' },
      { name: 'AWS App Studio' },
      { name: 'AWS DevOps Agent' },
      { name: 'AWS AppConfig' },
      { name: 'CodeArtifact' },
      { name: 'Amazon Q Developer' },
      { name: 'Amazon CodeCatalyst' },
      { name: 'Kiro' },
    ],
  },
  {
    category: 'Customer Enablement',
    services: [
      { name: 'AWS IQ' },
      { name: 'Managed Services' },
      { name: 'Activate for Startups' },
      { name: 'AWS re:Post Private' },
      { name: 'サポート' },
    ],
  },
  {
    category: 'ブロックチェーン',
    services: [
      { name: 'Amazon Managed Blockchain' },
    ],
  },
  {
    category: '衛星',
    services: [
      { name: 'Ground Station' },
    ],
  },
  {
    category: 'Quantum Technologies',
    services: [
      { name: 'Amazon Braket' },
    ],
  },
  {
    category: '管理とガバナンス',
    services: [
      { name: 'AWS Organizations' },
      { name: 'CloudWatch',                           serviceIds: ['svc-cloudwatch-10'] },
      { name: 'AWS Auto Scaling' },
      { name: 'CloudFormation',                       serviceIds: ['svc-cloudformation-16'] },
      { name: 'AWS Config' },
      { name: 'Service Catalog' },
      { name: 'Systems Manager',                      serviceIds: ['svc-ssm-33'] },
      { name: 'Trusted Advisor' },
      { name: 'Control Tower' },
      { name: 'AWS Well-Architected Tool' },
      { name: 'Amazon Q Developer in chat applications' },
      { name: 'Launch Wizard' },
      { name: 'AWS Compute Optimizer' },
      { name: 'Resource Groups & Tag Editor' },
      { name: 'Amazon Grafana' },
      { name: 'Amazon Prometheus' },
      { name: 'AWS Resilience Hub' },
      { name: 'Incident Manager' },
      { name: 'AWS for SAP' },
      { name: 'AWS Telco Network Builder' },
      { name: 'AWS Health Dashboard' },
      { name: 'AWS Proton' },
      { name: 'AWS の持続可能性' },
      { name: 'AWS User Notifications' },
      { name: 'AWS Partner Central' },
      { name: 'CloudTrail',                           serviceIds: ['svc-cloudtrail-26'] },
      { name: 'AWS License Manager' },
      { name: 'AWS Resource Explorer' },
      { name: 'Service Quotas' },
    ],
  },
  {
    category: 'メディアサービス',
    services: [
      { name: 'Kinesis Video Streams' },
      { name: 'MediaConvert' },
      { name: 'MediaLive' },
      { name: 'MediaPackage' },
      { name: 'MediaStore' },
      { name: 'MediaTailor' },
      { name: 'Elemental Appliances & Software' },
      { name: 'Amazon Interactive Video Service' },
      { name: 'Elemental Inference' },
      { name: 'AWS Deadline Cloud' },
      { name: 'MediaConnect' },
    ],
  },
  {
    category: 'Machine Learning',
    services: [
      { name: 'Amazon SageMaker AI',                  serviceIds: ['svc-sagemaker-23'] },
      { name: 'Amazon Augmented AI' },
      { name: 'Amazon CodeGuru' },
      { name: 'Amazon DevOps Guru' },
      { name: 'Amazon Comprehend' },
      { name: 'Amazon Forecast' },
      { name: 'Amazon Fraud Detector' },
      { name: 'Amazon Kendra' },
      { name: 'Amazon Personalize' },
      { name: 'Amazon Polly' },
      { name: 'Amazon Rekognition' },
      { name: 'Amazon Textract' },
      { name: 'Amazon Transcribe' },
      { name: 'Amazon Translate' },
      { name: 'AWS Panorama' },
      { name: 'Amazon Monitron' },
      { name: 'AWS HealthLake' },
      { name: 'Amazon Lookout for Equipment' },
      { name: 'Amazon Q Business' },
      { name: 'AWS の Claude プラットフォーム' },
      { name: 'AWS HealthOmics' },
      { name: 'Amazon Nova Act' },
      { name: 'Amazon Bedrock',                       serviceIds: ['svc-bedrock-14'] },
      { name: 'Amazon Bedrock AgentCore' },
      { name: 'Amazon Q' },
      { name: 'Amazon Comprehend Medical' },
      { name: 'Amazon Lex' },
      { name: 'Amazon Bio Discovery' },
      { name: 'AWS HealthImaging' },
    ],
  },
  {
    category: '分析',
    services: [
      { name: 'Athena' },
      { name: 'Amazon Redshift',                      serviceIds: ['svc-redshift-19'] },
      { name: 'CloudSearch' },
      { name: 'Amazon OpenSearch Service' },
      { name: 'Kinesis',                              serviceIds: ['svc-kinesis-18'] },
      { name: 'QuickSight' },
      { name: 'AWS Data Exchange' },
      { name: 'AWS Lake Formation' },
      { name: 'MSK' },
      { name: 'AWS Glue DataBrew' },
      { name: 'Amazon FinSpace' },
      { name: 'Managed Apache Flink' },
      { name: 'EMR' },
      { name: 'AWS Clean Rooms' },
      { name: 'Amazon SageMaker' },
      { name: 'AWS Entity Resolution' },
      { name: 'AWS Glue',                             serviceIds: ['svc-glue-30'] },
      { name: 'Amazon Data Firehose' },
      { name: 'Amazon DataZone' },
      { name: 'Amazon Quick' },
    ],
  },
  {
    category: 'セキュリティ、ID、およびコンプライアンス',
    services: [
      { name: 'Resource Access Manager' },
      { name: 'Cognito',                              serviceIds: ['svc-cognito-21'] },
      { name: 'Secrets Manager' },
      { name: 'GuardDuty' },
      { name: 'Amazon Inspector' },
      { name: 'Amazon Macie' },
      { name: 'IAM Identity Center',                  serviceIds: ['svc-iam-identity-center-27'] },
      { name: 'Certificate Manager' },
      { name: 'Key Management Service' },
      { name: 'CloudHSM' },
      { name: 'Directory Service' },
      { name: 'AWS Firewall Manager' },
      { name: 'AWS Artifact' },
      { name: 'Detective' },
      { name: 'AWS Signer' },
      { name: 'Security Lake' },
      { name: 'AWS Security Agent' },
      { name: 'Amazon Verified Permissions' },
      { name: 'AWS Audit Manager' },
      { name: 'Security Hub CSPM' },
      { name: 'IAM',                                  serviceIds: ['svc-iam-9'] },
      { name: 'WAF & Shield',                         serviceIds: ['svc-waf-32'] },
      { name: 'Security Hub' },
      { name: 'AWS Private Certificate Authority' },
      { name: 'AWS Payment Cryptography' },
      { name: 'AWS Security Incident Response' },
    ],
  },
  {
    category: 'クラウド財務管理',
    services: [
      { name: 'AWS Marketplace' },
      { name: 'AWS Billing Conductor' },
      { name: 'Billing and Cost Management' },
    ],
  },
  {
    category: 'モバイル',
    services: [
      { name: 'AWS Amplify' },
      { name: 'AWS AppSync' },
      { name: 'Device Farm' },
      { name: 'Amazon Location Service' },
    ],
  },
  {
    category: 'アプリケーション統合',
    services: [
      { name: 'Step Functions',                       serviceIds: ['svc-step-functions-22'] },
      { name: 'Amazon AppFlow' },
      { name: 'Amazon MQ' },
      { name: 'Simple Notification Service',          serviceIds: ['svc-sns-11'] },
      { name: 'Simple Queue Service',                 serviceIds: ['37a9abeb-8fd3-4549-b88d-485144978ef8'] },
      { name: 'SWF' },
      { name: 'マネージド Apache Airflow' },
      { name: 'AWS B2B Data Interchange' },
      { name: 'Amazon EventBridge',                   serviceIds: ['svc-eventbridge-28'] },
    ],
  },
  {
    category: 'ビジネスアプリケーション',
    services: [
      { name: 'Amazon Connect Customer' },
      { name: 'Amazon Chime' },
      { name: 'Amazon Simple Email Service' },
      { name: 'Amazon WorkDocs' },
      { name: 'Amazon WorkMail' },
      { name: 'Amazon Connect Health' },
      { name: 'Amazon Connect Decisions' },
      { name: 'Amazon Pinpoint' },
      { name: 'AWS Wickr' },
      { name: 'AWS AppFabric' },
      { name: 'AWS End User Messaging' },
      { name: 'Amazon Chime SDK' },
    ],
  },
  {
    category: 'エンドユーザーコンピューティング',
    services: [
      { name: 'WorkSpaces' },
      { name: 'WorkSpaces Applications' },
      { name: 'WorkSpaces Thin Client' },
      { name: 'WorkSpaces Secure Browser' },
    ],
  },
  {
    category: 'IoT',
    services: [
      { name: 'IoT Device Defender' },
      { name: 'IoT Device Management' },
      { name: 'IoT Greengrass' },
      { name: 'IoT SiteWise' },
      { name: 'IoT Core' },
      { name: 'IoT TwinMaker' },
      { name: 'IoT Events' },
      { name: 'AWS IoT FleetWise' },
    ],
  },
  {
    category: 'ゲーム開発',
    services: [
      { name: 'Amazon GameLift Servers' },
      { name: 'Amazon GameLift Streams' },
    ],
  },
];

/** 今日（JST）のサービスを決定論的に返す */
export function getDailyService(): ServiceEntry & { category: string } {
  const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < jstDate.length; i++) {
    hash = (hash * 31 + jstDate.charCodeAt(i)) & 0x7fffffff;
  }
  // flatten with category info
  const all: (ServiceEntry & { category: string })[] = CATALOG.flatMap(cat =>
    cat.services.map(svc => ({ ...svc, category: cat.category }))
  );
  return all[hash % all.length];
}

/** 今日まだ解放されていなければ1サービス解放する */
export function markTodayUnlock(): void {
  const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (localStorage.getItem('encyclopediaUnlockDate') === jstDate) return;

  const svc = getDailyService();
  const key = svc.serviceIds?.[0] ?? svc.name;

  try {
    const unlocked: Record<string, string> = JSON.parse(
      localStorage.getItem('encyclopediaUnlocked') ?? '{}'
    );
    unlocked[key] = jstDate;
    localStorage.setItem('encyclopediaUnlocked', JSON.stringify(unlocked));
    localStorage.setItem('encyclopediaUnlockDate', jstDate);
  } catch {}
}
