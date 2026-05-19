import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { IconLock, IconLightbulb } from '../components/Icons';

type EncyclopediaService = {
  serviceId: string;
  name: string;
  category?: string;
  icon: string;
  description: string;
  trivia?: string;
  docUrl?: string;
};

type ServiceEntry = {
  name: string;
  serviceIds?: string[];
};

type Category = {
  category: string;
  services: ServiceEntry[];
};

const CATALOG: Category[] = [
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

function renderIcon(service: EncyclopediaService, size: number): React.ReactNode {
  const { icon, name } = service;
  if (icon.startsWith('/') || icon.startsWith('http')) {
    return <img src={icon} alt={name} style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  return <span style={{ fontSize: size * 0.86, lineHeight: 1 }}>{icon}</span>;
}

export default function ServiceEncyclopedia() {
  const { lang } = useLanguage();
  const ja = lang === 'ja';

  const [storedServices, setStoredServices] = useState<Record<string, EncyclopediaService>>({});
  const [selected, setSelected] = useState<EncyclopediaService | null>(null);

  useEffect(() => {
    try {
      setStoredServices(JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}'));
    } catch {
      setStoredServices({});
    }
  }, []);

  const unlockedIds = new Set(Object.keys(storedServices));
  const allServices = CATALOG.flatMap(c => c.services);
  const totalServices = allServices.length;
  const unlockedCount = allServices.filter(s => s.serviceIds?.some(id => unlockedIds.has(id))).length;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 'var(--spacing-lg)' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--font-size-h2)', fontWeight: 700, color: 'var(--color-text-main)' }}>
        {ja ? 'サービス図鑑' : 'Service Encyclopedia'}
      </h2>
      <p style={{ margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
        {ja
          ? `日めくりAWSサービスに登場したサービスが解放されます。${unlockedCount} / ${totalServices} 解放済み`
          : `Services unlocked as they appear in Daily AWS Service. ${unlockedCount} / ${totalServices} unlocked`}
      </p>

      {CATALOG.map(cat => {
        const catUnlocked = cat.services.filter(s => s.serviceIds?.some(id => unlockedIds.has(id))).length;
        return (
          <div key={cat.category} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--color-border)' }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                {cat.category}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-light)', marginLeft: 2 }}>
                {catUnlocked}/{cat.services.length}
              </span>
            </div>
            <div>
              {cat.services.map(svc => {
                const isUnlocked = !!svc.serviceIds?.some(id => unlockedIds.has(id));
                const serviceData = svc.serviceIds?.map(id => storedServices[id]).find(Boolean);

                return (
                  <div
                    key={svc.name}
                    onClick={() => { if (isUnlocked && serviceData) setSelected(serviceData); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 8px', borderRadius: 'var(--border-radius-md)',
                      cursor: isUnlocked ? 'pointer' : 'default',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (isUnlocked) e.currentTarget.style.background = 'var(--color-bg-main)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isUnlocked && serviceData
                        ? renderIcon(serviceData, 28)
                        : <IconLock size={13} />}
                    </div>
                    <span style={{
                      fontSize: 'var(--font-size-sm)',
                      color: isUnlocked ? 'var(--color-text-main)' : 'var(--color-text-light)',
                      fontWeight: isUnlocked ? 600 : 400,
                      flex: 1,
                    }}>
                      {isUnlocked ? svc.name : '???'}
                    </span>
                    {isUnlocked && (
                      <span style={{ color: 'var(--color-text-light)', fontSize: 14 }}>›</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Detail modal */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 24px 20px', width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
            <button
              onClick={() => setSelected(null)}
              style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}
            >✕</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {renderIcon(selected, 44)}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-text-main)' }}>
                  {selected.name}
                </div>
                {selected.category && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--border-radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    {selected.category}
                  </span>
                )}
              </div>
            </div>

            <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.7 }}>
              {selected.description}
            </p>

            {selected.trivia && (
              <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <IconLightbulb size={14} />
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
                  {selected.trivia}
                </span>
              </div>
            )}

            {selected.docUrl && (
              <a
                href={selected.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}
              >
                {ja ? '公式ページを見る →' : 'Official page →'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
