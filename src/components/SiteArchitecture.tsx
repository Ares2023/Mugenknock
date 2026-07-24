'use client';
import React, { useState } from 'react';
import { ServiceIconImg, IconCloudflare, IconMonitorSmartphone, IconDatabase, IconChevronDown } from './Icons';

// ── このサイトの構成図 ────────────────────────────────────────
// ユーザー → Cloudflare Pages（フロント）→ API Gateway → Lambda → DynamoDB
// 認証(Cognito/Amplify)はフロント直下に、点線コネクタで並べる。
// アイコン: AWS公式サービスアイコン / Cloudflare公式 / Lucide。

type NodeKind = 'lucide' | 'cloudflare' | 'aws';
interface ArchNode {
  kind: NodeKind;
  awsIcon?: string;
  LucideIcon?: React.FC<{ size?: number }>;
  tint: string;        // アイコン枠の色
  title: string;
  sub: string;
  subEn: string;
  tech?: string;
  detail: string;      // タップで展開する詳細説明（このサイトでの役割）
  detailEn: string;
}

const MAIN_NODES: ArchNode[] = [
  {
    kind: 'lucide', LucideIcon: IconMonitorSmartphone, tint: '#64748b',
    title: 'ユーザー / ブラウザ', sub: 'スマホ・PCからアクセス', subEn: 'Access from mobile & PC',
    detail: 'スマートフォン・PCのブラウザから無限ノックにアクセスします。ここから先の全ての処理はこの画面をきっかけに始まります。',
    detailEn: 'Users access Mugenknock from a browser on mobile or PC. Every request below starts here.',
  },
  {
    kind: 'cloudflare', tint: '#F38020',
    title: 'Cloudflare Pages', sub: 'フロントエンド配信（AWSサービスではありません）', subEn: 'Frontend hosting (not an AWS service)', tech: 'Next.js 静的サイト',
    detail: 'Next.jsで静的サイトとしてビルドしたフロントエンドを配信するホスティングサービスです。世界中のエッジサーバーから配信するため表示が高速です。AWSではなくCloudflare社が提供するサービスで、この構成図内で唯一のAWS以外のサービスです。',
    detailEn: 'Hosts the frontend, built as a static Next.js site, and serves it from edge servers worldwide for fast page loads. This is a Cloudflare service, not an AWS service — the only non-AWS component in this diagram.',
  },
  {
    kind: 'aws', awsIcon: '/icons/aws/APIGateway.svg', tint: '#a166ff',
    title: 'Amazon API Gateway', sub: 'APIの入口・ルーティング', subEn: 'API entry & routing',
    detail: 'フロントエンドからのAPIリクエストを受け付ける入口です。検証(dev)・本番(prod)の2つのステージでLambda関数の呼び分けを行います。',
    detailEn: 'The single entry point for all API requests from the frontend. Routes to different Lambda functions via dev/prod stages.',
  },
  {
    kind: 'aws', awsIcon: '/icons/aws/Lambda.svg', tint: '#ed7100',
    title: 'AWS Lambda', sub: 'サーバーレス処理', subEn: 'Serverless backend', tech: 'Node.js',
    detail: '問題の取得・採点・ユーザーデータの読み書きなど、サーバー側のロジックを実行するサーバーレス関数です。常時稼働のサーバーを持たずリクエスト時のみ実行されます。',
    detailEn: 'Runs the server-side logic (fetching questions, scoring, reading/writing user data) as serverless functions that execute only on request.',
  },
  {
    kind: 'aws', awsIcon: '/icons/aws/DynamoDB.svg', tint: '#4d72f3',
    title: 'Amazon DynamoDB', sub: 'NoSQL データベース', subEn: 'NoSQL database',
    detail: '練習問題・ユーザーの解答履歴・統計情報などを保存するNoSQLデータベースです。低レイテンシで大量のアクセスに応答できます。',
    detailEn: 'Stores practice questions, answer history, and user statistics. A NoSQL database that responds to high volumes of requests with low latency.',
  },
];

// 各主要ノード間のコネクタのラベル（i番目のノードの下）
const CONNECTORS: (string | null)[] = ['HTTPS', 'API リクエスト', null, 'データ読み書き'];
const CONNECTORS_EN: (string | null)[] = ['HTTPS', 'API request', null, 'Read / write'];

// 認証（Cloudflare = index 1 の直下に並べる）
const AUTH_NODE: ArchNode = {
  kind: 'aws', awsIcon: '/icons/aws/Cognito.svg', tint: '#dd344c',
  title: 'Amazon Cognito', sub: 'ユーザー認証（Amplify）', subEn: 'User auth (Amplify)',
  detail: 'ログイン・会員登録などのユーザー認証を担当します。パスワードなどの認証情報は無限ノックのサーバーには保存されず、Cognitoが安全に管理します。',
  detailEn: 'Handles login and sign-up. Credentials are never stored on Mugenknock’s own servers — Cognito manages them securely.',
};

function NodeIcon({ node, size }: { node: ArchNode; size: number }) {
  if (node.kind === 'cloudflare') return <IconCloudflare size={size} />;
  if (node.kind === 'aws' && node.awsIcon) return <ServiceIconImg icon={node.awsIcon} name={node.title} size={size} />;
  if (node.kind === 'lucide' && node.LucideIcon) { const I = node.LucideIcon; return <span style={{ color: node.tint }}><I size={size} /></span>; }
  return <IconDatabase size={size} />;
}

function ArchCard({ node, ja, isMobile, delayMs }: { node: ArchNode; ja: boolean; isMobile: boolean; delayMs: number }) {
  const [open, setOpen] = useState(false);
  const iconBox = isMobile ? 46 : 52;
  const iconSize = isMobile ? 30 : 34;
  return (
    <button
      type="button"
      className="arch-node"
      onClick={() => setOpen(o => !o)}
      aria-expanded={open}
      style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        background: 'var(--color-bg-white)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--box-shadow-sm)',
        width: '100%', boxSizing: 'border-box',
        animationDelay: `${delayMs}ms`,
        cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 14, padding: isMobile ? '10px 12px' : '12px 16px' }}>
        <div style={{
          width: iconBox, height: iconBox, flexShrink: 0, borderRadius: 'var(--border-radius-md)',
          background: `${node.tint}14`, border: `1px solid ${node.tint}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <NodeIcon node={node} size={iconSize} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: isMobile ? 'var(--font-size-base)' : 'var(--font-size-lg)', color: 'var(--color-text-main)' }}>{node.title}</span>
            {node.tech && (
              <span style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: node.tint, background: `${node.tint}14`, border: `1px solid ${node.tint}33`, borderRadius: 'var(--border-radius-full)', padding: '1px 8px', whiteSpace: 'nowrap' }}>{node.tech}</span>
            )}
          </div>
          <div style={{ fontSize: isMobile ? 'var(--font-size-xs)' : 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginTop: 2 }}>{ja ? node.sub : node.subEn}</div>
        </div>
        <span style={{ color: 'var(--color-text-light)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex', flexShrink: 0 }}>
          <IconChevronDown size={16} />
        </span>
      </div>
      <div style={{
        maxHeight: open ? 200 : 0, overflow: 'hidden', transition: 'max-height 0.25s ease',
      }}>
        <div style={{
          padding: isMobile ? '0 12px 12px' : '0 16px 14px',
          fontSize: isMobile ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
          color: 'var(--color-text-sub)', lineHeight: 1.7,
          borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: -2,
        }}>
          {ja ? node.detail : node.detailEn}
        </div>
      </div>
    </button>
  );
}

function Connector({ label, delayMs, dashed }: { label: string | null; delayMs: number; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0' }}>
      <span className="arch-line" style={{ width: 0, height: 16, borderLeft: `3px ${dashed ? 'dashed' : 'solid'} var(--color-text-sub)`, display: 'block', animationDelay: `${delayMs}ms` }} />
      {label && (
        <span className="arch-node" style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-sub)', background: 'var(--color-bg-main)', border: '1px solid var(--color-text-light)', borderRadius: 'var(--border-radius-full)', padding: '1px 10px', animationDelay: `${delayMs + 60}ms` }}>{label}</span>
      )}
      <svg className="arch-line" width="16" height="11" viewBox="0 0 14 10" style={{ animationDelay: `${delayMs + 80}ms` }}><path d="M1 1l6 6 6-6" fill="none" stroke="var(--color-text-sub)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

// 構成図本体（マウント時＝表示時にアニメーション再生）
export function SiteArchitecture({ ja, isMobile, maxWidth = 440 }: { ja: boolean; isMobile: boolean; maxWidth?: number }) {
  let delay = 0;
  const step = 150;
  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <style>{`
        @keyframes archIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
        .arch-node { animation: archIn 0.5s cubic-bezier(.2,.7,.3,1) both; }
        .arch-line { transform-origin: top center; animation: archIn 0.35s ease both; }
        @media (prefers-reduced-motion: reduce) { .arch-node, .arch-line { animation: none !important; } }
      `}</style>

      {MAIN_NODES.map((node, i) => {
        const nodeDelay = delay; delay += step;
        return (
          <React.Fragment key={node.title}>
            <ArchCard node={node} ja={ja} isMobile={isMobile} delayMs={nodeDelay} />

            {/* Cloudflare(=index1) の直下に認証(Cognito)を同じ幅で並べる（点線コネクタ） */}
            {i === 1 && (() => {
              const cDelay = delay; delay += step * 0.5;
              const authDelay = delay; delay += step;
              return (
                <React.Fragment>
                  <Connector label={ja ? 'ログイン認証' : 'Login auth'} delayMs={cDelay} dashed />
                  <ArchCard node={AUTH_NODE} ja={ja} isMobile={isMobile} delayMs={authDelay} />
                </React.Fragment>
              );
            })()}

            {i < MAIN_NODES.length - 1 && (() => {
              const connLabel = ja ? CONNECTORS[i] : CONNECTORS_EN[i];
              const cDelay = delay; delay += step * 0.5;
              return <Connector label={connLabel} delayMs={cDelay} />;
            })()}
          </React.Fragment>
        );
      })}

      <p style={{ marginTop: isMobile ? 16 : 20, fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-light)', textAlign: 'center', lineHeight: 1.7 }}>
        {ja
          ? 'アイコンは AWS 公式サービスアイコン / Cloudflare 公式ロゴ / Lucide を使用しています。'
          : 'Icons: official AWS service icons / Cloudflare logo / Lucide.'}
      </p>
    </div>
  );
}
