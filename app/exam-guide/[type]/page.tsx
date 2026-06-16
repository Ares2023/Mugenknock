import type { Metadata } from 'next';
import Link from 'next/link';
import { EXAM_TYPES, EXAM_DOMAINS, EXAM_CONFIGS, EXAM_DESC_JA, PASS_SCORES, DOMAIN_WEIGHTS } from '@/constants';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return EXAM_TYPES.map(type => ({ type }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const cfg = EXAM_CONFIGS[type];
  if (!cfg) return {};
  return {
    title: `${cfg.fullName}（${type}）攻略ガイド | 無限ノック`,
    description: `AWS ${cfg.fullName}の試験概要・出題ドメイン・合格スコア・勉強法を徹底解説。${cfg.totalQuestions}問・${cfg.timeLimitMin}分の本番形式で対策できます。`,
    openGraph: {
      title: `${type} 攻略ガイド | 無限ノック`,
      url: `https://mugenknock.com/exam-guide/${type}`,
      siteName: '無限ノック',
    },
  };
}

export default async function ExamGuidePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const cfg = EXAM_CONFIGS[type];
  if (!cfg) notFound();

  const domains = EXAM_DOMAINS[type] ?? [];
  const weights = DOMAIN_WEIGHTS[type] ?? domains.map(() => Math.round(100 / domains.length));
  const passScore = PASS_SCORES[type] ?? 700;
  const desc = EXAM_DESC_JA[type] ?? '';

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      {/* パンくず */}
      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}
        <Link href="/exam-guide" style={{ color: '#0047A3', textDecoration: 'none' }}>試験別攻略ガイド</Link>
        {' › '}{type}
      </nav>

      {/* ヘッダー */}
      <div style={{ marginBottom: 32 }}>
        <span style={{ display: 'inline-block', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: '#fff3e0', color: '#e65100', marginBottom: 12 }}>
          AWS認定試験
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', color: '#1a1a1a', lineHeight: 1.3 }}>
          {cfg.fullName}<br />
          <span style={{ fontSize: 18, color: '#555', fontWeight: 600 }}>（{cfg.examCode}）攻略ガイド</span>
        </h1>
        <p style={{ color: '#555', lineHeight: 1.7, marginTop: 12 }}>{desc}</p>
      </div>

      {/* 試験概要カード */}
      <section style={{ marginBottom: 40, padding: 24, background: '#f8f9fa', borderRadius: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#232f3e', marginBottom: 16 }}>試験概要</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
          {[
            { label: '試験コード', value: cfg.examCode },
            { label: '問題数', value: `${cfg.totalQuestions}問` },
            { label: '試験時間', value: `${cfg.timeLimitMin}分` },
            { label: '合格スコア', value: `${passScore}/1000` },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center', padding: '16px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#232f3e' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 出題ドメイン */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#232f3e', marginBottom: 16 }}>出題ドメインと配点</h2>
        <p style={{ color: '#555', marginBottom: 20, lineHeight: 1.7 }}>
          {type}試験は以下{domains.length}つのドメインから出題されます。
          配点割合が高いドメインを重点的に学習することが合格の近道です。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {domains.map((domain, i) => {
            const weight = weights[i] ?? 0;
            return (
              <div key={domain} style={{ padding: '16px 20px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: '#1a1a1a', fontSize: 15 }}>ドメイン {i + 1}：{domain}</span>
                  <span style={{ fontWeight: 800, color: '#ff9900', fontSize: 18 }}>{weight}%</span>
                </div>
                <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${weight}%`, background: '#ff9900', borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 勉強法 */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#232f3e', marginBottom: 16 }}>効果的な勉強法</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            {
              step: '01',
              title: '試験ガイドで出題範囲を把握',
              desc: 'AWS公式の試験ガイドを確認し、各ドメインの配点と学習優先度を決めましょう。',
            },
            {
              step: '02',
              title: 'サービスの基礎知識を習得',
              desc: 'AWSサービス図鑑で各サービスの概要・特徴・ユースケースを理解します。',
            },
            {
              step: '03',
              title: '反復演習でアウトプット',
              desc: '無限ノックのAIオリジナル問題でドメイン別に繰り返し練習し、弱点を克服します。合格スコアの目安は7割程度です。',
            },
            {
              step: '04',
              title: '模試で本番形式に慣れる',
              desc: `本番と同じ${cfg.totalQuestions}問・${cfg.timeLimitMin}分の模試を解いて時間配分を確認します。`,
            },
          ].map(item => (
            <div key={item.step} style={{ display: 'flex', gap: 16, padding: '16px 20px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10 }}>
              <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: '#ff9900', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                {item.step}
              </span>
              <div>
                <div style={{ fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>{item.title}</div>
                <div style={{ color: '#555', fontSize: 14, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div style={{ padding: 32, background: 'linear-gradient(135deg, #232f3e 0%, #0047A3 100%)', borderRadius: 16, textAlign: 'center', color: '#fff' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
          {type} の練習問題を今すぐ解く
        </h2>
        <p style={{ opacity: 0.85, marginBottom: 24, lineHeight: 1.6 }}>
          AIが生成するオリジナル問題を無制限に演習。<br />
          ドメイン別正答率・予想スコアでリアルタイムに実力把握。
        </p>
        <Link href="/" style={{ display: 'inline-block', padding: '14px 36px', background: '#ff9900', color: '#fff', borderRadius: 28, textDecoration: 'none', fontWeight: 800, fontSize: 18 }}>
          無料で始める →
        </Link>
      </div>

      {/* 他の試験ガイドへのリンク */}
      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#232f3e', marginBottom: 16 }}>他のAWS試験攻略ガイド</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {EXAM_TYPES.filter(t => t !== type).map(t => {
            const c = EXAM_CONFIGS[t];
            return (
              <Link key={t} href={`/exam-guide/${t}`}
                style={{ display: 'block', padding: '10px 14px', border: '1px solid #e0e0e0', borderRadius: 8, textDecoration: 'none', color: '#1a1a1a' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#232f3e' }}>{t}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.4 }}>{c?.fullName.split('–')[0]?.trim()}</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
