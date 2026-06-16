import type { Metadata } from 'next';
import Link from 'next/link';
import { EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, EXAM_DESC_JA } from '@/constants';
import { notFound } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_ENDPOINT
  ?? 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/prod';

type Question = {
  questionId: string;
  questionText: string;
  domain?: number;
};

export function generateStaticParams() {
  return EXAM_TYPES.map(examType => ({ examType }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ examType: string }> }
): Promise<Metadata> {
  const { examType } = await params;
  const cfg = EXAM_CONFIGS[examType];
  if (!cfg) return {};
  return {
    title: `${examType} 練習問題一覧 | 無限ノック`,
    description: `AWS ${cfg.fullName}（${examType}）のAIオリジナル練習問題一覧。全ドメインの問題・解説を無料で閲覧できます。`,
    openGraph: {
      title: `${examType} 練習問題一覧 | 無限ノック`,
      url: `https://mugenknock.com/questions/${examType}`,
      siteName: '無限ノック',
    },
  };
}

async function fetchQuestions(examType: string): Promise<Question[]> {
  try {
    const res = await fetch(`${API}/questions/public?examType=${examType}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

export default async function QuestionListPage(
  { params }: { params: Promise<{ examType: string }> }
) {
  const { examType } = await params;
  const cfg = EXAM_CONFIGS[examType];
  if (!cfg) notFound();

  const questions = await fetchQuestions(examType);
  const domains = EXAM_DOMAINS[examType] ?? [];

  // ドメイン別に分類
  const byDomain: Record<number, Question[]> = {};
  for (const q of questions) {
    const d = q.domain ?? -1;
    if (!byDomain[d]) byDomain[d] = [];
    byDomain[d].push(q);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}
        <Link href="/exam-guide" style={{ color: '#0047A3', textDecoration: 'none' }}>試験別ガイド</Link>
        {' › '}{examType} 練習問題一覧
      </nav>

      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, color: '#1a1a1a' }}>
        {examType} 練習問題一覧
      </h1>
      <p style={{ color: '#555', marginBottom: 8, fontSize: 15 }}>
        {cfg.fullName}
      </p>
      <p style={{ color: '#555', marginBottom: 32, fontSize: 14 }}>
        {EXAM_DESC_JA[examType]}　全 <strong>{questions.length}</strong> 問（AIオリジナル）
      </p>

      {domains.map((domainName, idx) => {
        const dqs = byDomain[idx] ?? [];
        if (dqs.length === 0) return null;
        return (
          <section key={idx} style={{ marginBottom: 40 }}>
            <h2 style={{
              fontSize: 17, fontWeight: 700, color: '#232f3e',
              borderLeft: '4px solid #ff9900', paddingLeft: 12, marginBottom: 16
            }}>
              ドメイン{idx + 1}：{domainName}
              <span style={{ fontSize: 13, fontWeight: 400, color: '#888', marginLeft: 8 }}>
                （{dqs.length}問）
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dqs.map((q, i) => (
                <Link
                  key={q.questionId}
                  href={`/questions/${examType}/${q.questionId}/`}
                  style={{
                    display: 'block', padding: '12px 16px',
                    border: '1px solid #e0e0e0', borderRadius: 8,
                    textDecoration: 'none', color: '#1a1a1a',
                    background: '#fff', fontSize: 14, lineHeight: 1.5,
                  }}
                >
                  <span style={{ color: '#888', marginRight: 8, fontSize: 12 }}>Q{i + 1}</span>
                  {q.questionText.slice(0, 80)}{q.questionText.length > 80 ? '…' : ''}
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <div style={{ marginTop: 48, padding: 28, background: '#f0f7ff', borderRadius: 12, textAlign: 'center' }}>
        <p style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
          ドメイン別正答率・予想スコアで実力把握
        </p>
        <p style={{ color: '#555', marginBottom: 20, fontSize: 14 }}>
          無限ノックの演習モードで{examType}を徹底対策
        </p>
        <Link href="/" style={{
          display: 'inline-block', padding: '12px 32px',
          background: '#ff9900', color: '#fff', borderRadius: 24,
          textDecoration: 'none', fontWeight: 700, fontSize: 16
        }}>
          無料で演習を始める →
        </Link>
      </div>

      <section style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#232f3e', marginBottom: 12 }}>
          他の試験の練習問題
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {EXAM_TYPES.filter(t => t !== examType).map(t => (
            <Link key={t} href={`/questions/${t}/`}
              style={{
                padding: '6px 16px', border: '1px solid #e0e0e0',
                borderRadius: 20, textDecoration: 'none', color: '#1a1a1a', fontSize: 14
              }}>
              {t}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
