export type ServiceEntry = { name: string; serviceIds?: string[]; icon?: string; };
export type Category = { category: string; services: ServiceEntry[]; };

export const CATALOG: Category[] = [
  {
    category: 'コンピューティング',
    services: [
      { name: 'EC2',                                  serviceIds: ['svc-ec2-6'],                              icon: '/icons/aws/EC2.png' },
      { name: 'Lightsail',                            serviceIds: ['svc-lightsail-87'],                       icon: '/icons/aws/Lightsail.png' },
      { name: 'Lambda',                               serviceIds: ['2ca534b1-a776-424a-8d0f-0d7a05aab154'],  icon: '/icons/aws/Lambda.png' },
      { name: 'Batch',                                serviceIds: ['svc-batch-59'],                           icon: '/icons/aws/Batch.png' },
      { name: 'Elastic Beanstalk',                    serviceIds: ['svc-elastic-beanstalk-49'],               icon: '/icons/aws/ElasticBeanstalk.png' },
      { name: 'Serverless Application Repository' },
      { name: 'AWS Outposts' },
      { name: 'EC2 Image Builder' },
      { name: 'AWS App Runner',                       serviceIds: ['svc-app-runner-88'],                      icon: '/icons/aws/AppRunner.png' },
      { name: 'パラレルコンピューティングサービス' },
      { name: 'AWS Global View' },
    ],
  },
  {
    category: 'コンテナ',
    services: [
      { name: 'Elastic Container Service',            serviceIds: ['svc-ecs-12'],                             icon: '/icons/aws/ElasticContainerService.png' },
      { name: 'Elastic Kubernetes Service',           serviceIds: ['svc-eks-13'],                             icon: '/icons/aws/ElasticKubernetesService.png' },
      { name: 'AWS Fargate',                          serviceIds: ['svc-fargate-37'],                         icon: '/icons/aws/Fargate.png' },
      { name: 'Red Hat OpenShift Service on AWS' },
      { name: 'Elastic Container Registry',           serviceIds: ['svc-ecr-101'],                            icon: '/icons/aws/ECR.png' },
    ],
  },
  {
    category: 'ストレージ',
    services: [
      { name: 'S3',                                   serviceIds: ['398b303b-1873-4cfb-b4f2-fa71ad5a4b8c'],  icon: '/icons/aws/SimpleStorageService.png' },
      { name: 'EFS',                                  serviceIds: ['svc-efs-31'],                             icon: '/icons/aws/EFS.png' },
      { name: 'EBS',                                  serviceIds: ['svc-ebs-25'],                             icon: '/icons/aws/ElasticBlockStore.png' },
      { name: 'FSx',                                  serviceIds: ['svc-fsx-70'],                             icon: '/icons/aws/FSx.png' },
      { name: 'S3 Glacier',                           serviceIds: ['svc-s3-glacier-44'],                      icon: '/icons/aws/Glacier.png' },
      { name: 'Storage Gateway',                      serviceIds: ['svc-storage-gateway-89'],                 icon: '/icons/aws/StorageGateway.png' },
      { name: 'AWS Backup',                           serviceIds: ['svc-backup-54'],                          icon: '/icons/aws/Backup.png' },
      { name: 'Recycle Bin' },
      { name: 'AWS Elastic Disaster Recovery' },
    ],
  },
  {
    category: 'データベース',
    services: [
      { name: 'Aurora and RDS',                       serviceIds: ['svc-aurora-29', 'svc-rds-7'],             icon: '/icons/aws/Aurora.png' },
      { name: 'ElastiCache',                          serviceIds: ['svc-elasticache-20'],                     icon: '/icons/aws/ElastiCache.png' },
      { name: 'Neptune',                              serviceIds: ['svc-neptune-55'],                         icon: '/icons/aws/Neptune.png' },
      { name: 'Amazon DocumentDB',                    serviceIds: ['svc-documentdb-45'],                      icon: '/icons/aws/DocumentDB.png' },
      { name: 'Amazon Keyspaces',                     serviceIds: ['svc-keyspaces-104'],                      icon: '/icons/aws/Keyspaces.png' },
      { name: 'Amazon Timestream',                    serviceIds: ['svc-timestream-65'],                      icon: '/icons/aws/Timestream.png' },
      { name: 'DynamoDB',                             serviceIds: ['68c89b55-eeb0-4d01-be0a-e37b0e57d76f'],  icon: '/icons/aws/DynamoDB.png' },
      { name: 'Aurora DSQL' },
      { name: 'Amazon MemoryDB',                      serviceIds: ['svc-memorydb-73'],                        icon: '/icons/aws/MemoryDB.png' },
      { name: 'Oracle Database@AWS' },
    ],
  },
  {
    category: '移行と転送',
    services: [
      { name: 'AWS Migration Hub',                    serviceIds: ['svc-migration-hub-105'],                  icon: '/icons/aws/MigrationHub.png' },
      { name: 'AWS Application Migration Service' },
      { name: 'Application Discovery Service' },
      { name: 'Database Migration Service',           serviceIds: ['svc-dms-43'],                             icon: '/icons/aws/DMS.png' },
      { name: 'AWS Transfer Family',                  serviceIds: ['svc-transfer-family-86'],                 icon: '/icons/aws/TransferFamily.png' },
      { name: 'AWS Snow Family',                      serviceIds: ['svc-snowball-90'],                        icon: '/icons/aws/Snowball.png' },
      { name: 'DataSync',                             serviceIds: ['svc-datasync-83'],                        icon: '/icons/aws/DataSync.png' },
      { name: 'AWS Transform' },
      { name: 'AWS Mainframe Modernization' },
      { name: 'Amazon Elastic VMware Service' },
    ],
  },
  {
    category: 'ネットワーキングとコンテンツ配信',
    services: [
      { name: 'VPC',                                  serviceIds: ['svc-vpc-8'],                              icon: '/icons/aws/VPCVirtualprivatecloudVPC.png' },
      { name: 'Elastic Load Balancing',               serviceIds: ['svc-elb-35'],                             icon: '/icons/aws/ElasticLoadBalancing.png' },
      { name: 'CloudFront',                           serviceIds: ['b3d71a09-b495-4573-933f-34be6cbdb9b5'],  icon: '/icons/aws/CloudFront.png' },
      { name: 'API Gateway',                          serviceIds: ['svc-api-gateway-15'],                     icon: '/icons/aws/APIGateway.png' },
      { name: 'Direct Connect',                       serviceIds: ['svc-direct-connect-42'],                  icon: '/icons/aws/DirectConnect.png' },
      { name: 'AWS App Mesh' },
      { name: 'Global Accelerator',                   serviceIds: ['svc-global-accelerator-64'],              icon: '/icons/aws/GlobalAccelerator.png' },
      { name: 'Route 53',                             serviceIds: ['svc-route-53-17'],                        icon: '/icons/aws/Route53.png' },
      { name: 'AWS PrivateLink',                      serviceIds: ['svc-privatelink-72'],                     icon: '/icons/aws/PrivateLink.png' },
      { name: 'AWS Transit Gateway',                  serviceIds: ['svc-transit-gateway-56'],                 icon: '/icons/aws/TransitGateway.png' },
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
      { name: 'CodeCommit',                           serviceIds: ['svc-codecommit-95'],                      icon: '/icons/aws/CodeCommit.png' },
      { name: 'CodeBuild',                            serviceIds: ['svc-codebuild-61'],                       icon: '/icons/aws/CodeBuild.png' },
      { name: 'CodeDeploy',                           serviceIds: ['svc-codedeploy-66'],                      icon: '/icons/aws/CodeDeploy.png' },
      { name: 'CodePipeline',                         serviceIds: ['svc-codepipeline-24'],                    icon: '/icons/aws/CodePipeline.png' },
      { name: 'Cloud9',                               serviceIds: ['svc-cloud9-94'],                          icon: '/icons/aws/Cloud9.png' },
      { name: 'CloudShell' },
      { name: 'X-Ray',                                serviceIds: ['svc-x-ray-47'],                           icon: '/icons/aws/XRay.png' },
      { name: 'AWS FIS' },
      { name: 'Infrastructure Composer' },
      { name: 'AWS App Studio' },
      { name: 'AWS DevOps Agent' },
      { name: 'AWS AppConfig' },
      { name: 'CodeArtifact',                         serviceIds: ['svc-codeartifact-79'],                    icon: '/icons/aws/CodeArtifact.png' },
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
      { name: 'AWS Organizations',                    serviceIds: ['svc-organizations-38'],                   icon: '/icons/aws/Organizations.png' },
      { name: 'CloudWatch',                           serviceIds: ['svc-cloudwatch-10'],                      icon: '/icons/aws/CloudWatch.png' },
      { name: 'AWS Auto Scaling',                     serviceIds: ['svc-auto-scaling-74'],                    icon: '/icons/aws/AutoScaling.png' },
      { name: 'CloudFormation',                       serviceIds: ['svc-cloudformation-16'],                  icon: '/icons/aws/CloudFormation.png' },
      { name: 'AWS Config',                           serviceIds: ['svc-config-51'],                          icon: '/icons/aws/Config.png' },
      { name: 'Service Catalog' },
      { name: 'Systems Manager',                      serviceIds: ['svc-ssm-33'],                             icon: '/icons/aws/SystemsManager.png' },
      { name: 'Trusted Advisor',                      serviceIds: ['svc-trusted-advisor-71'],                 icon: '/icons/aws/TrustedAdvisor.png' },
      { name: 'Control Tower',                        serviceIds: ['svc-control-tower-63'],                   icon: '/icons/aws/ControlTower.png' },
      { name: 'AWS Well-Architected Tool' },
      { name: 'Amazon Q Developer in chat applications' },
      { name: 'Launch Wizard' },
      { name: 'AWS Compute Optimizer',                serviceIds: ['svc-compute-optimizer-81'],               icon: '/icons/aws/ComputeOptimizer.png' },
      { name: 'Resource Groups & Tag Editor' },
      { name: 'Amazon Grafana' },
      { name: 'Amazon Prometheus' },
      { name: 'AWS Resilience Hub' },
      { name: 'Incident Manager' },
      { name: 'AWS for SAP' },
      { name: 'AWS Telco Network Builder' },
      { name: 'AWS Health Dashboard',                 serviceIds: ['svc-health-dashboard-98'],                icon: '/icons/aws/HealthDashboard.png' },
      { name: 'AWS Proton' },
      { name: 'AWS の持続可能性' },
      { name: 'AWS User Notifications' },
      { name: 'AWS Partner Central' },
      { name: 'CloudTrail',                           serviceIds: ['svc-cloudtrail-26'],                      icon: '/icons/aws/CloudTrail.png' },
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
      { name: 'Amazon SageMaker AI',                  serviceIds: ['svc-sagemaker-23'],                       icon: '/icons/aws/SageMakerAI.png' },
      { name: 'Amazon Augmented AI' },
      { name: 'Amazon CodeGuru' },
      { name: 'Amazon DevOps Guru' },
      { name: 'Amazon Comprehend',                    serviceIds: ['svc-comprehend-57'],                      icon: '/icons/aws/Comprehend.png' },
      { name: 'Amazon Forecast',                      serviceIds: ['svc-forecast-93'],                        icon: '/icons/aws/Forecast.png' },
      { name: 'Amazon Fraud Detector' },
      { name: 'Amazon Kendra',                        serviceIds: ['svc-kendra-84'],                          icon: '/icons/aws/Kendra.png' },
      { name: 'Amazon Personalize',                   serviceIds: ['svc-personalize-102'],                    icon: '/icons/aws/Personalize.png' },
      { name: 'Amazon Polly',                         serviceIds: ['svc-polly-85'],                           icon: '/icons/aws/Polly.png' },
      { name: 'Amazon Rekognition',                   serviceIds: ['svc-rekognition-67'],                     icon: '/icons/aws/Rekognition.png' },
      { name: 'Amazon Textract',                      serviceIds: ['svc-textract-92'],                        icon: '/icons/aws/Textract.png' },
      { name: 'Amazon Transcribe',                    serviceIds: ['svc-transcribe-91'],                      icon: '/icons/aws/Transcribe.png' },
      { name: 'Amazon Translate',                     serviceIds: ['svc-translate-77'],                       icon: '/icons/aws/Translate.png' },
      { name: 'AWS Panorama' },
      { name: 'Amazon Monitron' },
      { name: 'AWS HealthLake' },
      { name: 'Amazon Lookout for Equipment' },
      { name: 'Amazon Q Business' },
      { name: 'AWS の Claude プラットフォーム' },
      { name: 'AWS HealthOmics' },
      { name: 'Amazon Nova Act' },
      { name: 'Amazon Bedrock',                       serviceIds: ['svc-bedrock-14'],                         icon: '/icons/aws/Bedrock.png' },
      { name: 'Amazon Bedrock AgentCore' },
      { name: 'Amazon Q' },
      { name: 'Amazon Comprehend Medical' },
      { name: 'Amazon Lex',                           serviceIds: ['svc-lex-72'],                             icon: '/icons/aws/Lex.png' },
      { name: 'Amazon Bio Discovery' },
      { name: 'AWS HealthImaging' },
    ],
  },
  {
    category: '分析',
    services: [
      { name: 'Athena',                               serviceIds: ['svc-athena-36'],                          icon: '/icons/aws/Athena.png' },
      { name: 'Amazon Redshift',                      serviceIds: ['svc-redshift-19'],                        icon: '/icons/aws/Redshift.png' },
      { name: 'CloudSearch' },
      { name: 'Amazon OpenSearch Service',            serviceIds: ['svc-opensearch-52'],                      icon: '/icons/aws/OpenSearch.png' },
      { name: 'Kinesis',                              serviceIds: ['svc-kinesis-18'],                         icon: '/icons/aws/KinesisDataStreams.png' },
      { name: 'QuickSight',                           serviceIds: ['svc-quicksight-48'],                      icon: '/icons/aws/QuickSight.png' },
      { name: 'AWS Data Exchange' },
      { name: 'AWS Lake Formation',                   serviceIds: ['svc-lake-formation-58'],                  icon: '/icons/aws/LakeFormation.png' },
      { name: 'MSK',                                  serviceIds: ['svc-msk-60'],                             icon: '/icons/aws/MSK.png' },
      { name: 'AWS Glue DataBrew' },
      { name: 'Amazon FinSpace' },
      { name: 'Managed Apache Flink' },
      { name: 'EMR',                                  serviceIds: ['svc-emr-41'],                             icon: '/icons/aws/EMR.png' },
      { name: 'AWS Clean Rooms' },
      { name: 'Amazon SageMaker' },
      { name: 'AWS Entity Resolution' },
      { name: 'AWS Glue',                             serviceIds: ['svc-glue-30'],                            icon: '/icons/aws/Glue.png' },
      { name: 'Amazon Data Firehose' },
      { name: 'Amazon DataZone' },
      { name: 'Amazon Quick' },
    ],
  },
  {
    category: 'セキュリティ、ID、およびコンプライアンス',
    services: [
      { name: 'Resource Access Manager' },
      { name: 'Cognito',                              serviceIds: ['svc-cognito-21'],                         icon: '/icons/aws/Cognito.png' },
      { name: 'Secrets Manager',                      serviceIds: ['svc-secrets-manager-40'],                 icon: '/icons/aws/SecretsManager.png' },
      { name: 'GuardDuty',                            serviceIds: ['svc-guardduty-39'],                       icon: '/icons/aws/GuardDuty.png' },
      { name: 'Amazon Inspector',                     serviceIds: ['svc-inspector-50'],                       icon: '/icons/aws/Inspector.png' },
      { name: 'Amazon Macie',                         serviceIds: ['svc-macie-62'],                           icon: '/icons/aws/Macie.png' },
      { name: 'IAM Identity Center',                  serviceIds: ['svc-iam-identity-center-27'],             icon: '/icons/aws/IAMIdentityCenter.png' },
      { name: 'Certificate Manager',                  serviceIds: ['svc-acm-69'],                             icon: '/icons/aws/CertificateManager.png' },
      { name: 'Key Management Service',               serviceIds: ['svc-kms-34'],                             icon: '/icons/aws/KMS.png' },
      { name: 'CloudHSM',                             serviceIds: ['svc-cloudhsm-103'],                       icon: '/icons/aws/CloudHSM.png' },
      { name: 'Directory Service' },
      { name: 'AWS Firewall Manager',                 serviceIds: ['svc-firewall-manager-96'],                icon: '/icons/aws/FirewallManager.png' },
      { name: 'AWS Network Firewall',                 serviceIds: ['svc-network-firewall-76'],                icon: '/icons/aws/NetworkFirewall.png' },
      { name: 'AWS Artifact' },
      { name: 'Detective',                            serviceIds: ['svc-detective-97'],                       icon: '/icons/aws/Detective.png' },
      { name: 'AWS Signer' },
      { name: 'Security Lake' },
      { name: 'AWS Security Agent' },
      { name: 'Amazon Verified Permissions' },
      { name: 'AWS Audit Manager' },
      { name: 'Security Hub CSPM' },
      { name: 'IAM',                                  serviceIds: ['svc-iam-9'],                              icon: '/icons/aws/IAM.png' },
      { name: 'WAF & Shield',                         serviceIds: ['svc-waf-32', 'svc-shield-46'],            icon: '/icons/aws/WAF.png' },
      { name: 'Security Hub',                         serviceIds: ['svc-security-hub-75'],                    icon: '/icons/aws/SecurityHub.png' },
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
      { name: 'AWS Budgets',                          serviceIds: ['svc-budgets-80'],                         icon: '/icons/aws/Budgets.png' },
      { name: 'AWS Cost Explorer',                    serviceIds: ['svc-cost-explorer-68'],                   icon: '/icons/aws/CostExplorer.png' },
      { name: 'AWS Savings Plans',                    serviceIds: ['svc-savings-plans-99'],                   icon: '/icons/aws/SavingsPlans.png' },
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
      { name: 'Step Functions',                       serviceIds: ['svc-step-functions-22'],                  icon: '/icons/aws/StepFunctions.png' },
      { name: 'Amazon AppFlow',                       serviceIds: ['svc-appflow-82'],                         icon: '/icons/aws/AppFlow.png' },
      { name: 'Amazon MQ',                            serviceIds: ['svc-mq-78'],                              icon: '/icons/aws/MQ.png' },
      { name: 'Simple Notification Service',          serviceIds: ['svc-sns-11'],                             icon: '/icons/aws/SimpleNotificationService.png' },
      { name: 'Simple Queue Service',                 serviceIds: ['37a9abeb-8fd3-4549-b88d-485144978ef8'],  icon: '/icons/aws/SimpleQueueService.png' },
      { name: 'SWF' },
      { name: 'マネージド Apache Airflow' },
      { name: 'AWS B2B Data Interchange' },
      { name: 'Amazon EventBridge',                   serviceIds: ['svc-eventbridge-28'],                     icon: '/icons/aws/EventBridge.png' },
    ],
  },
  {
    category: 'ビジネスアプリケーション',
    services: [
      { name: 'Amazon Connect Customer' },
      { name: 'Amazon Chime' },
      { name: 'Amazon Simple Email Service',          serviceIds: ['svc-ses-53'],                             icon: '/icons/aws/SES.png' },
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

/**
 * 今日の図鑑サービスを返す。
 * ホーム画面でDynamoDBサービスがロード済みならそれを優先し、
 * 未ロードの場合はDynamoDB対応済みサービスのみから日付シードで決定論的に選出。
 */
export function getDailyService(uid?: string): ServiceEntry & { category: string } {
  const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // ホーム画面でロードされた今日のDynamoDBサービスを優先
  const dateKey = uid ? `encyclopediaUnlockDate_${uid}` : 'encyclopediaUnlockDate';
  const idKey = uid ? `encyclopediaTodayServiceId_${uid}` : 'encyclopediaTodayServiceId';
  const unlockDate = localStorage.getItem(dateKey);
  const todayId = localStorage.getItem(idKey);
  if (unlockDate === jstDate && todayId) {
    for (const cat of CATALOG) {
      for (const svc of cat.services) {
        if (svc.serviceIds?.includes(todayId)) {
          return { ...svc, category: cat.category };
        }
      }
    }
  }

  // フォールバック: DynamoDB対応済み（serviceIds あり）のサービスのみから選出
  let hash = 0;
  for (let i = 0; i < jstDate.length; i++) {
    hash = (hash * 31 + jstDate.charCodeAt(i)) & 0x7fffffff;
  }
  const mapped = CATALOG.flatMap(cat =>
    cat.services
      .filter(svc => svc.serviceIds?.length)
      .map(svc => ({ ...svc, category: cat.category }))
  );
  return mapped[hash % mapped.length];
}
