import type { Metadata } from 'next';
import Link from 'next/link';
import { EXAM_TYPES, EXAM_CONFIGS, EXAM_DESC_JA } from '@/constants';

export const metadata: Metadata = {
  title: 'AWS試験別攻略ガイド一覧 | 無限ノック',
  description: 'CLF・SAA・SAP・DVA・SOA・DOP・DEA・AIF・MLA・GAI・ANS・SCS 全12種類のAWS認定試験の攻略ガイドを解説。試験概要・出題ドメイン・合格スコア・勉強法を紹介。',
};

export default function ExamGuideIndexPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}AWS試験別攻略ガイド
      </nav>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#1a1a1a' }}>
        AWS認定試験 攻略ガイド
      </h1>
      <p style={{ color: '#555', marginBottom: 40, lineHeight: 1.7 }}>
        全12種類のAWS認定試験の概要・出題ドメイン・合格ラインを解説します。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {EXAM_TYPES.map(type => {
          const cfg = EXAM_CONFIGS[type];
          const desc = EXAM_DESC_JA[type];
          if (!cfg) return null;
          return (
            <Link key={type} href={`/exam-guide/${type}`}
              style={{ display: 'block', padding: 20, border: '1px solid #e0e0e0', borderRadius: 12, textDecoration: 'none', color: '#1a1a1a', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#232f3e' }}>{type}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#fff3e0', color: '#e65100' }}>
                  {cfg.totalQuestions}問/{cfg.timeLimitMin}分
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>{desc}</div>
            </Link>
          );
        })}
      </div>

      <div style={{ marginTop: 48, padding: 24, background: '#f8f9fa', borderRadius: 12, textAlign: 'center' }}>
        <p style={{ marginBottom: 16, color: '#555' }}>AWS認定試験の練習問題を解いてスコアアップ</p>
        <Link href="/" style={{ display: 'inline-block', padding: '12px 32px', background: '#ff9900', color: '#fff', borderRadius: 24, textDecoration: 'none', fontWeight: 700, fontSize: 16 }}>
          無料で練習問題を始める →
        </Link>
      </div>
    </div>
  );
}
