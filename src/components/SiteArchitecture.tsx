'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import { ServiceIconImg, IconCloudflare, IconMonitorSmartphone, IconDatabase } from './Icons';

// ── このサイトの構成図 ────────────────────────────────────────
// ユーザー → Cloudflare Pages（フロント）→ API Gateway → Lambda → DynamoDB
// 認証は Cognito(Amplify) をフロントの分岐として表現する。
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
}

const MAIN_NODES: ArchNode[] = [
  { kind: 'lucide', LucideIcon: IconMonitorSmartphone, tint: '#64748b', title: 'ユーザー / ブラウザ', sub: 'スマホ・PCからアクセス', subEn: 'Access from mobile & PC' },
  { kind: 'cloudflare', tint: '#F38020', title: 'Cloudflare Pages', sub: 'フロントエンド配信', subEn: 'Frontend hosting', tech: 'Next.js 静的サイト' },
  { kind: 'aws', awsIcon: '/icons/aws/APIGateway.svg', tint: '#a166ff', title: 'Amazon API Gateway', sub: 'APIの入口・ルーティング', subEn: 'API entry & routing' },
  { kind: 'aws', awsIcon: '/icons/aws/Lambda.svg', tint: '#ed7100', title: 'AWS Lambda', sub: 'サーバーレス処理', subEn: 'Serverless backend', tech: 'Node.js' },
  { kind: 'aws', awsIcon: '/icons/aws/DynamoDB.svg', tint: '#4d72f3', title: 'Amazon DynamoDB', sub: 'NoSQL データベース', subEn: 'NoSQL database' },
];

// 各主要ノード間のコネクタのラベル（i番目のノードの下）
const CONNECTORS: (string | null)[] = ['HTTPS', 'API リクエスト', null, 'データ読み書き'];
const CONNECTORS_EN: (string | null)[] = ['HTTPS', 'API request', null, 'Read / write'];

// 認証の分岐（Cloudflare = index 1 の下にぶら下げる）
const AUTH_NODE: ArchNode = { kind: 'aws', awsIcon: '/icons/aws/Cognito.svg', tint: '#dd344c', title: 'Amazon Cognito', sub: 'ユーザー認証（Amplify）', subEn: 'User auth (Amplify)' };

function NodeIcon({ node, size }: { node: ArchNode; size: number }) {
  if (node.kind === 'cloudflare') return <IconCloudflare size={size} />;
  if (node.kind === 'aws' && node.awsIcon) return <ServiceIconImg icon={node.awsIcon} name={node.title} size={size} />;
  if (node.kind === 'lucide' && node.LucideIcon) { const I = node.LucideIcon; return <span style={{ color: node.tint }}><I size={size} /></span>; }
  return <IconDatabase size={size} />;
}

function ArchCard({ node, ja, isMobile, delayMs, compact }: { node: ArchNode; ja: boolean; isMobile: boolean; delayMs: number; compact?: boolean }) {
  const iconBox = compact ? 40 : (isMobile ? 46 : 52);
  const iconSize = compact ? 26 : (isMobile ? 30 : 34);
  return (
    <div
      className="arch-node"
      style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 14,
        background: 'var(--color-bg-white)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--box-shadow-sm)',
        padding: isMobile ? '10px 12px' : '12px 16px',
        width: '100%', boxSizing: 'border-box',
        animationDelay: `${delayMs}ms`,
      }}
    >
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
    </div>
  );
}

function Connector({ label, delayMs }: { label: string | null; delayMs: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '2px 0' }}>
      <span className="arch-line" style={{ width: 2, height: 16, background: 'var(--color-border)', display: 'block', animationDelay: `${delayMs}ms` }} />
      {label && (
        <span className="arch-node" style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-light)', background: 'var(--color-bg-main)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-full)', padding: '1px 10px', animationDelay: `${delayMs + 60}ms` }}>{label}</span>
      )}
      <svg className="arch-line" width="14" height="10" viewBox="0 0 14 10" style={{ animationDelay: `${delayMs + 80}ms` }}><path d="M1 1l6 6 6-6" fill="none" stroke="var(--color-text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

// 構成図本体（マウント時＝表示時にアニメーション再生）
export function SiteArchitecture({ ja, isMobile }: { ja: boolean; isMobile: boolean }) {
  let delay = 0;
  const step = 150;
  return (
    <div style={{ width: '100%', maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <style>{`
        @keyframes archIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
        .arch-node { animation: archIn 0.5s cubic-bezier(.2,.7,.3,1) both; }
        .arch-line { transform-origin: top center; animation: archIn 0.35s ease both; }
        @media (prefers-reduced-motion: reduce) { .arch-node, .arch-line { animation: none !important; } }
      `}</style>

      {/* 導入：AWS資格の学習サイトが、実はAWS自身で動いているという気づき */}
      <div className="arch-node" style={{ width: '100%', marginBottom: isMobile ? 16 : 20, padding: isMobile ? '12px 14px' : '14px 18px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)', borderRadius: 'var(--border-radius-lg)', animationDelay: '0ms' }}>
        <div style={{ fontWeight: 800, fontSize: isMobile ? 'var(--font-size-base)' : 'var(--font-size-lg)', color: 'var(--color-primary)', marginBottom: 4 }}>
          {ja ? '実は、この学習サイト自体も AWS で動いています。' : 'This study site itself runs on AWS.'}
        </div>
        <div style={{ fontSize: isMobile ? 'var(--font-size-xs)' : 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.7 }}>
          {ja
            ? 'AWS 資格の演習サイトが、まさに学習対象の AWS サービス（Lambda・DynamoDB・API Gateway・Cognito）で構築・運用されています。その全体像がこちらです。'
            : 'An AWS certification practice site, built and operated on the very AWS services you study — Lambda, DynamoDB, API Gateway, Cognito. Here is the whole picture.'}
        </div>
      </div>

      {MAIN_NODES.map((node, i) => {
        const nodeDelay = delay; delay += step;
        return (
          <React.Fragment key={node.title}>
            <ArchCard node={node} ja={ja} isMobile={isMobile} delayMs={nodeDelay} />

            {/* Cloudflare(=index1) の直下に認証(Cognito)の分岐をぶら下げる */}
            {i === 1 && (() => {
              const branchDelay = delay; delay += step;
              return (
                <div style={{ width: '100%', display: 'flex', alignItems: 'stretch', gap: 8, paddingLeft: isMobile ? 14 : 26, marginTop: 2 }}>
                  {/* L字の点線コネクタ */}
                  <span className="arch-line" style={{ width: isMobile ? 16 : 22, marginTop: -6, borderLeft: '2px dashed var(--color-border)', borderBottom: '2px dashed var(--color-border)', borderBottomLeftRadius: 8, alignSelf: 'stretch', animationDelay: `${branchDelay}ms` }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span className="arch-node" style={{ alignSelf: 'flex-start', fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: AUTH_NODE.tint, background: `${AUTH_NODE.tint}14`, border: `1px solid ${AUTH_NODE.tint}33`, borderRadius: 'var(--border-radius-full)', padding: '1px 10px', animationDelay: `${branchDelay + 40}ms` }}>{ja ? 'ログイン認証' : 'Login auth'}</span>
                    <ArchCard node={AUTH_NODE} ja={ja} isMobile={isMobile} delayMs={branchDelay + 80} compact />
                  </div>
                </div>
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

// オーバーレイ（開いた瞬間にマウント＝アニメーション再生）
export default function SiteArchitectureOverlay({ open, onClose, ja, isMobile }: { open: boolean; onClose: () => void; ja: boolean; isMobile: boolean }) {
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open || typeof window === 'undefined') return null;

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 'var(--spacing-lg)' }}
    >
      <div style={{
        background: 'var(--color-bg-main)', width: '100%', maxWidth: 560,
        maxHeight: isMobile ? '88vh' : '90vh', overflowY: 'auto',
        borderRadius: isMobile ? '16px 16px 0 0' : 'var(--border-radius-lg)',
        boxShadow: 'var(--box-shadow-lg)',
        animation: isMobile ? 'archSheetUp 0.28s ease both' : undefined,
      }}>
        <style>{`@keyframes archSheetUp { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
        <div style={{ position: 'sticky', top: 0, background: 'var(--color-bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 16px' : '16px 20px', borderBottom: '1px solid var(--color-border)', zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 800, color: 'var(--color-text-main)' }}>{ja ? 'Webサイトの構成図' : 'Site Architecture'}</h3>
          <button onClick={onClose} aria-label={ja ? '閉じる' : 'Close'} style={{ border: 'none', background: 'none', fontSize: 'var(--font-size-xl)', cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: isMobile ? '20px 16px 28px' : '28px 24px 32px' }}>
          <SiteArchitecture ja={ja} isMobile={isMobile} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
