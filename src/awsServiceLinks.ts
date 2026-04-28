type ServiceLink = { label: string; url: string };

// キー: 小文字・スペース/ハイフン正規化済み → AWS公式紹介ページ
const SERVICE_MAP: Record<string, ServiceLink> = {
  // コンピューティング
  'ec2':                     { label: 'Amazon EC2',                    url: 'https://aws.amazon.com/ec2/' },
  'lambda':                  { label: 'AWS Lambda',                    url: 'https://aws.amazon.com/lambda/' },
  'ecs':                     { label: 'Amazon ECS',                    url: 'https://aws.amazon.com/ecs/' },
  'eks':                     { label: 'Amazon EKS',                    url: 'https://aws.amazon.com/eks/' },
  'fargate':                 { label: 'AWS Fargate',                   url: 'https://aws.amazon.com/fargate/' },
  'elastic beanstalk':       { label: 'AWS Elastic Beanstalk',         url: 'https://aws.amazon.com/elasticbeanstalk/' },
  'elasticbeanstalk':        { label: 'AWS Elastic Beanstalk',         url: 'https://aws.amazon.com/elasticbeanstalk/' },
  'batch':                   { label: 'AWS Batch',                     url: 'https://aws.amazon.com/batch/' },
  'lightsail':               { label: 'Amazon Lightsail',              url: 'https://aws.amazon.com/lightsail/' },
  'app runner':              { label: 'AWS App Runner',                url: 'https://aws.amazon.com/apprunner/' },
  'apprunner':               { label: 'AWS App Runner',                url: 'https://aws.amazon.com/apprunner/' },
  'outposts':                { label: 'AWS Outposts',                  url: 'https://aws.amazon.com/outposts/' },
  'wavelength':              { label: 'AWS Wavelength',                url: 'https://aws.amazon.com/wavelength/' },
  'local zones':             { label: 'AWS Local Zones',               url: 'https://aws.amazon.com/about-aws/global-infrastructure/localzones/' },

  // ストレージ
  's3':                      { label: 'Amazon S3',                     url: 'https://aws.amazon.com/s3/' },
  'ebs':                     { label: 'Amazon EBS',                    url: 'https://aws.amazon.com/ebs/' },
  'efs':                     { label: 'Amazon EFS',                    url: 'https://aws.amazon.com/efs/' },
  'fsx':                     { label: 'Amazon FSx',                    url: 'https://aws.amazon.com/fsx/' },
  'storage gateway':         { label: 'AWS Storage Gateway',           url: 'https://aws.amazon.com/storagegateway/' },
  'storagegateway':          { label: 'AWS Storage Gateway',           url: 'https://aws.amazon.com/storagegateway/' },
  's3 glacier':              { label: 'Amazon S3 Glacier',             url: 'https://aws.amazon.com/s3/storage-classes/glacier/' },
  'glacier':                 { label: 'Amazon S3 Glacier',             url: 'https://aws.amazon.com/s3/storage-classes/glacier/' },
  'backup':                  { label: 'AWS Backup',                    url: 'https://aws.amazon.com/backup/' },
  'snow family':             { label: 'AWS Snow Family',               url: 'https://aws.amazon.com/snow/' },
  'snowball':                { label: 'AWS Snowball',                  url: 'https://aws.amazon.com/snowball/' },
  'snowcone':                { label: 'AWS Snowcone',                  url: 'https://aws.amazon.com/snowcone/' },
  'snowmobile':              { label: 'AWS Snowmobile',                url: 'https://aws.amazon.com/snowmobile/' },

  // データベース
  'rds':                     { label: 'Amazon RDS',                    url: 'https://aws.amazon.com/rds/' },
  'aurora':                  { label: 'Amazon Aurora',                 url: 'https://aws.amazon.com/rds/aurora/' },
  'dynamodb':                { label: 'Amazon DynamoDB',               url: 'https://aws.amazon.com/dynamodb/' },
  'elasticache':             { label: 'Amazon ElastiCache',            url: 'https://aws.amazon.com/elasticache/' },
  'redshift':                { label: 'Amazon Redshift',               url: 'https://aws.amazon.com/redshift/' },
  'documentdb':              { label: 'Amazon DocumentDB',             url: 'https://aws.amazon.com/documentdb/' },
  'neptune':                 { label: 'Amazon Neptune',                url: 'https://aws.amazon.com/neptune/' },
  'timestream':              { label: 'Amazon Timestream',             url: 'https://aws.amazon.com/timestream/' },
  'keyspaces':               { label: 'Amazon Keyspaces',              url: 'https://aws.amazon.com/keyspaces/' },
  'memorydb':                { label: 'Amazon MemoryDB for Redis',     url: 'https://aws.amazon.com/memorydb/' },
  'qldb':                    { label: 'Amazon QLDB',                   url: 'https://aws.amazon.com/qldb/' },

  // ネットワーク
  'vpc':                     { label: 'Amazon VPC',                    url: 'https://aws.amazon.com/vpc/' },
  'route 53':                { label: 'Amazon Route 53',               url: 'https://aws.amazon.com/route53/' },
  'route53':                 { label: 'Amazon Route 53',               url: 'https://aws.amazon.com/route53/' },
  'cloudfront':              { label: 'Amazon CloudFront',             url: 'https://aws.amazon.com/cloudfront/' },
  'alb':                     { label: 'Elastic Load Balancing',        url: 'https://aws.amazon.com/elasticloadbalancing/' },
  'nlb':                     { label: 'Elastic Load Balancing',        url: 'https://aws.amazon.com/elasticloadbalancing/' },
  'elb':                     { label: 'Elastic Load Balancing',        url: 'https://aws.amazon.com/elasticloadbalancing/' },
  'elastic load balancing':  { label: 'Elastic Load Balancing',        url: 'https://aws.amazon.com/elasticloadbalancing/' },
  'api gateway':             { label: 'Amazon API Gateway',            url: 'https://aws.amazon.com/api-gateway/' },
  'apigateway':              { label: 'Amazon API Gateway',            url: 'https://aws.amazon.com/api-gateway/' },
  'transit gateway':         { label: 'AWS Transit Gateway',           url: 'https://aws.amazon.com/transit-gateway/' },
  'transitgateway':          { label: 'AWS Transit Gateway',           url: 'https://aws.amazon.com/transit-gateway/' },
  'direct connect':          { label: 'AWS Direct Connect',            url: 'https://aws.amazon.com/directconnect/' },
  'directconnect':           { label: 'AWS Direct Connect',            url: 'https://aws.amazon.com/directconnect/' },
  'vpn':                     { label: 'AWS VPN',                       url: 'https://aws.amazon.com/vpn/' },
  'global accelerator':      { label: 'AWS Global Accelerator',        url: 'https://aws.amazon.com/global-accelerator/' },
  'privatelink':             { label: 'AWS PrivateLink',               url: 'https://aws.amazon.com/privatelink/' },
  'auto scaling':            { label: 'AWS Auto Scaling',              url: 'https://aws.amazon.com/autoscaling/' },
  'autoscaling':             { label: 'AWS Auto Scaling',              url: 'https://aws.amazon.com/autoscaling/' },

  // セキュリティ・アイデンティティ
  'iam':                     { label: 'AWS IAM',                       url: 'https://aws.amazon.com/iam/' },
  'cognito':                 { label: 'Amazon Cognito',                url: 'https://aws.amazon.com/cognito/' },
  'kms':                     { label: 'AWS KMS',                       url: 'https://aws.amazon.com/kms/' },
  'secrets manager':         { label: 'AWS Secrets Manager',           url: 'https://aws.amazon.com/secrets-manager/' },
  'secretsmanager':          { label: 'AWS Secrets Manager',           url: 'https://aws.amazon.com/secrets-manager/' },
  'certificate manager':     { label: 'AWS Certificate Manager',       url: 'https://aws.amazon.com/certificate-manager/' },
  'acm':                     { label: 'AWS Certificate Manager',       url: 'https://aws.amazon.com/certificate-manager/' },
  'waf':                     { label: 'AWS WAF',                       url: 'https://aws.amazon.com/waf/' },
  'shield':                  { label: 'AWS Shield',                    url: 'https://aws.amazon.com/shield/' },
  'guardduty':               { label: 'Amazon GuardDuty',              url: 'https://aws.amazon.com/guardduty/' },
  'guard duty':              { label: 'Amazon GuardDuty',              url: 'https://aws.amazon.com/guardduty/' },
  'inspector':               { label: 'Amazon Inspector',              url: 'https://aws.amazon.com/inspector/' },
  'macie':                   { label: 'Amazon Macie',                  url: 'https://aws.amazon.com/macie/' },
  'security hub':            { label: 'AWS Security Hub',              url: 'https://aws.amazon.com/security-hub/' },
  'securityhub':             { label: 'AWS Security Hub',              url: 'https://aws.amazon.com/security-hub/' },
  'detective':               { label: 'Amazon Detective',              url: 'https://aws.amazon.com/detective/' },
  'firewall manager':        { label: 'AWS Firewall Manager',          url: 'https://aws.amazon.com/firewall-manager/' },
  'network firewall':        { label: 'AWS Network Firewall',          url: 'https://aws.amazon.com/network-firewall/' },
  'sso':                     { label: 'AWS IAM Identity Center',       url: 'https://aws.amazon.com/iam/identity-center/' },
  'iam identity center':     { label: 'AWS IAM Identity Center',       url: 'https://aws.amazon.com/iam/identity-center/' },
  'ram':                     { label: 'AWS Resource Access Manager',   url: 'https://aws.amazon.com/ram/' },

  // 分析
  'athena':                  { label: 'Amazon Athena',                 url: 'https://aws.amazon.com/athena/' },
  'glue':                    { label: 'AWS Glue',                      url: 'https://aws.amazon.com/glue/' },
  'kinesis':                 { label: 'Amazon Kinesis',                url: 'https://aws.amazon.com/kinesis/' },
  'kinesis data streams':    { label: 'Amazon Kinesis Data Streams',   url: 'https://aws.amazon.com/kinesis/data-streams/' },
  'kinesis data firehose':   { label: 'Amazon Data Firehose',          url: 'https://aws.amazon.com/kinesis/data-firehose/' },
  'kinesis data analytics':  { label: 'Amazon Managed Service for Apache Flink', url: 'https://aws.amazon.com/kinesis/data-analytics/' },
  'emr':                     { label: 'Amazon EMR',                    url: 'https://aws.amazon.com/emr/' },
  'opensearch':              { label: 'Amazon OpenSearch Service',     url: 'https://aws.amazon.com/opensearch-service/' },
  'elasticsearch':           { label: 'Amazon OpenSearch Service',     url: 'https://aws.amazon.com/opensearch-service/' },
  'quicksight':              { label: 'Amazon QuickSight',             url: 'https://aws.amazon.com/quicksight/' },
  'lake formation':          { label: 'AWS Lake Formation',            url: 'https://aws.amazon.com/lake-formation/' },
  'lakeformation':           { label: 'AWS Lake Formation',            url: 'https://aws.amazon.com/lake-formation/' },
  'data exchange':           { label: 'AWS Data Exchange',             url: 'https://aws.amazon.com/data-exchange/' },
  'msk':                     { label: 'Amazon MSK',                    url: 'https://aws.amazon.com/msk/' },

  // 管理・ガバナンス
  'cloudwatch':              { label: 'Amazon CloudWatch',             url: 'https://aws.amazon.com/cloudwatch/' },
  'cloudtrail':              { label: 'AWS CloudTrail',                url: 'https://aws.amazon.com/cloudtrail/' },
  'config':                  { label: 'AWS Config',                    url: 'https://aws.amazon.com/config/' },
  'aws config':              { label: 'AWS Config',                    url: 'https://aws.amazon.com/config/' },
  'systems manager':         { label: 'AWS Systems Manager',           url: 'https://aws.amazon.com/systems-manager/' },
  'ssm':                     { label: 'AWS Systems Manager',           url: 'https://aws.amazon.com/systems-manager/' },
  'cloudformation':          { label: 'AWS CloudFormation',            url: 'https://aws.amazon.com/cloudformation/' },
  'cloud formation':         { label: 'AWS CloudFormation',            url: 'https://aws.amazon.com/cloudformation/' },
  'service catalog':         { label: 'AWS Service Catalog',           url: 'https://aws.amazon.com/servicecatalog/' },
  'control tower':           { label: 'AWS Control Tower',             url: 'https://aws.amazon.com/controltower/' },
  'controltower':            { label: 'AWS Control Tower',             url: 'https://aws.amazon.com/controltower/' },
  'organizations':           { label: 'AWS Organizations',             url: 'https://aws.amazon.com/organizations/' },
  'trusted advisor':         { label: 'AWS Trusted Advisor',           url: 'https://aws.amazon.com/premiumsupport/technology/trusted-advisor/' },
  'trustedadvisor':          { label: 'AWS Trusted Advisor',           url: 'https://aws.amazon.com/premiumsupport/technology/trusted-advisor/' },
  'health':                  { label: 'AWS Health Dashboard',          url: 'https://aws.amazon.com/premiumsupport/technology/personal-health-dashboard/' },
  'personal health dashboard': { label: 'AWS Health Dashboard',        url: 'https://aws.amazon.com/premiumsupport/technology/personal-health-dashboard/' },
  'well-architected':        { label: 'AWS Well-Architected Tool',     url: 'https://aws.amazon.com/well-architected-tool/' },
  'cdk':                     { label: 'AWS CDK',                       url: 'https://aws.amazon.com/cdk/' },
  'sam':                     { label: 'AWS SAM',                       url: 'https://aws.amazon.com/serverless/sam/' },

  // アプリケーション統合
  'sqs':                     { label: 'Amazon SQS',                    url: 'https://aws.amazon.com/sqs/' },
  'sns':                     { label: 'Amazon SNS',                    url: 'https://aws.amazon.com/sns/' },
  'eventbridge':             { label: 'Amazon EventBridge',            url: 'https://aws.amazon.com/eventbridge/' },
  'event bridge':            { label: 'Amazon EventBridge',            url: 'https://aws.amazon.com/eventbridge/' },
  'step functions':          { label: 'AWS Step Functions',            url: 'https://aws.amazon.com/step-functions/' },
  'stepfunctions':           { label: 'AWS Step Functions',            url: 'https://aws.amazon.com/step-functions/' },
  'mq':                      { label: 'Amazon MQ',                     url: 'https://aws.amazon.com/amazon-mq/' },
  'appflow':                 { label: 'Amazon AppFlow',                url: 'https://aws.amazon.com/appflow/' },
  'app flow':                { label: 'Amazon AppFlow',                url: 'https://aws.amazon.com/appflow/' },
  'ses':                     { label: 'Amazon SES',                    url: 'https://aws.amazon.com/ses/' },

  // 開発者ツール
  'codecommit':              { label: 'AWS CodeCommit',                url: 'https://aws.amazon.com/codecommit/' },
  'codebuild':               { label: 'AWS CodeBuild',                 url: 'https://aws.amazon.com/codebuild/' },
  'codedeploy':              { label: 'AWS CodeDeploy',                url: 'https://aws.amazon.com/codedeploy/' },
  'codepipeline':            { label: 'AWS CodePipeline',              url: 'https://aws.amazon.com/codepipeline/' },
  'code pipeline':           { label: 'AWS CodePipeline',              url: 'https://aws.amazon.com/codepipeline/' },
  'codeartifact':            { label: 'AWS CodeArtifact',              url: 'https://aws.amazon.com/codeartifact/' },
  'cloud9':                  { label: 'AWS Cloud9',                    url: 'https://aws.amazon.com/cloud9/' },
  'x-ray':                   { label: 'AWS X-Ray',                     url: 'https://aws.amazon.com/xray/' },
  'xray':                    { label: 'AWS X-Ray',                     url: 'https://aws.amazon.com/xray/' },

  // 機械学習・AI
  'sagemaker':               { label: 'Amazon SageMaker',              url: 'https://aws.amazon.com/sagemaker/' },
  'sage maker':              { label: 'Amazon SageMaker',              url: 'https://aws.amazon.com/sagemaker/' },
  'bedrock':                 { label: 'Amazon Bedrock',                url: 'https://aws.amazon.com/bedrock/' },
  'rekognition':             { label: 'Amazon Rekognition',            url: 'https://aws.amazon.com/rekognition/' },
  'comprehend':              { label: 'Amazon Comprehend',             url: 'https://aws.amazon.com/comprehend/' },
  'translate':               { label: 'Amazon Translate',              url: 'https://aws.amazon.com/translate/' },
  'polly':                   { label: 'Amazon Polly',                  url: 'https://aws.amazon.com/polly/' },
  'transcribe':              { label: 'Amazon Transcribe',             url: 'https://aws.amazon.com/transcribe/' },
  'lex':                     { label: 'Amazon Lex',                    url: 'https://aws.amazon.com/lex/' },
  'textract':                { label: 'Amazon Textract',               url: 'https://aws.amazon.com/textract/' },
  'forecast':                { label: 'Amazon Forecast',               url: 'https://aws.amazon.com/forecast/' },
  'personalize':             { label: 'Amazon Personalize',            url: 'https://aws.amazon.com/personalize/' },
  'kendra':                  { label: 'Amazon Kendra',                 url: 'https://aws.amazon.com/kendra/' },

  // 移行・転送
  'dms':                     { label: 'AWS DMS',                       url: 'https://aws.amazon.com/dms/' },
  'datasync':                { label: 'AWS DataSync',                  url: 'https://aws.amazon.com/datasync/' },
  'data sync':               { label: 'AWS DataSync',                  url: 'https://aws.amazon.com/datasync/' },
  'transfer family':         { label: 'AWS Transfer Family',           url: 'https://aws.amazon.com/aws-transfer-family/' },
  'migration hub':           { label: 'AWS Migration Hub',             url: 'https://aws.amazon.com/migration-hub/' },
  'application migration service': { label: 'AWS Application Migration Service', url: 'https://aws.amazon.com/application-migration-service/' },
  'mgn':                     { label: 'AWS Application Migration Service', url: 'https://aws.amazon.com/application-migration-service/' },

  // コスト管理
  'cost explorer':           { label: 'AWS Cost Explorer',             url: 'https://aws.amazon.com/aws-cost-management/aws-cost-explorer/' },
  'budgets':                 { label: 'AWS Budgets',                   url: 'https://aws.amazon.com/aws-cost-management/aws-budgets/' },
  'savings plans':           { label: 'AWS Savings Plans',             url: 'https://aws.amazon.com/savingsplans/' },
  'compute optimizer':       { label: 'AWS Compute Optimizer',         url: 'https://aws.amazon.com/compute-optimizer/' },
};

// 正規化: 小文字化 + 前後スペース除去
const normalize = (s: string) => s.toLowerCase().trim();

export function getServiceLinks(tags: string[]): ServiceLink[] {
  const seen = new Set<string>();
  const links: ServiceLink[] = [];

  for (const tag of tags) {
    const key = normalize(tag);
    const entry = SERVICE_MAP[key];
    if (entry && !seen.has(entry.url)) {
      seen.add(entry.url);
      links.push(entry);
      if (links.length >= 5) break;
    }
  }

  return links;
}
