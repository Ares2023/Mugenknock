import type { Metadata } from 'next';
import Link from 'next/link';
import { EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, qDomainName } from '@/constants';
import { notFound } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_ENDPOINT
  ?? 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/prod';

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswerIndices: number[];
  correctAnswers: string[];
  choiceExplanations?: string[];
  explanation: string;
  domain?: number;
  isMultiple: boolean;
};

// ビルド時に全試験×全問題のパラメータを生成
export async function generateStaticParams() {
  const params: { examType: string; questionId: string }[] = [];

  for (const examType of EXAM_TYPES) {
    try {
      const res = await fetch(`${API}/questions/public?examType=${examType}`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const q of data.items ?? []) {
        params.push({ examType, questionId: q.questionId });
      }
    } catch {
      // ビルド時にタイムアウトしても他の試験は続行
    }
  }
  return params;
}

async function fetchQuestion(examType: string, questionId: string): Promise<Question | null> {
  try {
    // 該当試験の全問題から該当IDを探す（個別取得APIがないため）
    const res = await fetch(`${API}/questions/public?examType=${examType}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items ?? []).find((q: Question) => q.questionId === questionId) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ examType: string; questionId: string }> }
): Promise<Metadata> {
  const { examType, questionId } = await params;
  const q = await fetchQuestion(examType, questionId);
  if (!q) return {};
  const cfg = EXAM_CONFIGS[examType];
  const domainName = qDomainName(q as any);
  const preview = q.questionText.slice(0, 80);
  return {
    title: `${preview}… | ${examType} 練習問題 | 無限ノック`,
    description: `AWS ${cfg?.fullName}（${examType}）${domainName ? `「${domainName}」` : ''}の練習問題。正解・解説つき。`,
    openGraph: {
      title: `${examType} 練習問題 | 無限ノック`,
      url: `https://mugenknock.com/questions/${examType}/${questionId}`,
      siteName: '無限ノック',
    },
  };
}

const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'];

export default async function QuestionPage(
  { params }: { params: Promise<{ examType: string; questionId: string }> }
) {
  const { examType, questionId } = await params;
  const q = await fetchQuestion(examType, questionId);
  if (!q) notFound();

  const cfg = EXAM_CONFIGS[examType];
  const domainName = qDomainName(q as any);
  const correctSet = new Set(q.correctAnswerIndices);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      {/* パンくず */}
      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}
        <Link href={`/questions/${examType}/`} style={{ color: '#0047A3', textDecoration: 'none' }}>
          {examType} 練習問題一覧
        </Link>
        {' › '}問題
      </nav>

      {/* 試験・ドメインバッジ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-block', fontSize: 12, fontWeight: 700,
          padding: '3px 12px', borderRadius: 20,
          background: '#fff3e0', color: '#e65100'
        }}>
          {examType}
        </span>
        {domainName && (
          <span style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700,
            padding: '3px 12px', borderRadius: 20,
            background: '#e8f5e9', color: '#2e7d32'
          }}>
            {domainName}
          </span>
        )}
        {q.isMultiple && (
          <span style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700,
            padding: '3px 12px', borderRadius: 20,
            background: '#e3f2fd', color: '#1565c0'
          }}>
            複数選択
          </span>
        )}
      </div>

      {/* 問題文 */}
      <div style={{
        background: '#f8f9fa', borderRadius: 12, padding: '24px 28px',
        marginBottom: 28, lineHeight: 1.8, fontSize: 16, color: '#1a1a1a'
      }}>
        <p style={{ margin: 0 }}>{q.questionText}</p>
      </div>

      {/* 選択肢 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        {q.choices.map((choice, i) => {
          const isCorrect = correctSet.has(i);
          return (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '14px 18px',
              borderRadius: 10, border: `2px solid ${isCorrect ? '#2e7d32' : '#e0e0e0'}`,
              background: isCorrect ? '#e8f5e9' : '#fff',
            }}>
              <span style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13,
                background: isCorrect ? '#2e7d32' : '#f0f0f0',
                color: isCorrect ? '#fff' : '#555',
              }}>
                {CHOICE_LABELS[i]}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, lineHeight: 1.6, color: '#1a1a1a' }}>
                  {choice}
                </div>
                {isCorrect && (
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: '#2e7d32' }}>
                    ✓ 正解
                  </div>
                )}
                {/* 選択肢別解説 */}
                {q.choiceExplanations?.[i] && (
                  <div style={{
                    marginTop: 8, fontSize: 13, color: '#555',
                    lineHeight: 1.6, borderTop: '1px solid #e0e0e0', paddingTop: 8
                  }}>
                    {q.choiceExplanations[i]}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 解説 */}
      <section style={{
        padding: '20px 24px', background: '#fff8e1',
        borderRadius: 12, borderLeft: '4px solid #ff9900', marginBottom: 40
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e65100', marginBottom: 12 }}>
          解説
        </h2>
        <p style={{ margin: 0, lineHeight: 1.8, fontSize: 15, color: '#333', whiteSpace: 'pre-wrap' }}>
          {q.explanation}
        </p>
      </section>

      {/* CTA */}
      <div style={{
        padding: 28, background: 'linear-gradient(135deg, #232f3e 0%, #0047A3 100%)',
        borderRadius: 16, textAlign: 'center', color: '#fff', marginBottom: 40
      }}>
        <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
          ドメイン別正答率・予想スコアでリアルタイムに実力把握
        </p>
        <p style={{ opacity: 0.85, marginBottom: 20, fontSize: 14 }}>
          無限ノックで{examType}を徹底対策。全問AI生成のオリジナル問題。
        </p>
        <Link href="/" style={{
          display: 'inline-block', padding: '12px 32px',
          background: '#ff9900', color: '#fff', borderRadius: 28,
          textDecoration: 'none', fontWeight: 800, fontSize: 16
        }}>
          無料で演習を始める →
        </Link>
      </div>

      {/* 問題一覧へ戻る */}
      <div style={{ textAlign: 'center' }}>
        <Link href={`/questions/${examType}/`} style={{
          color: '#0047A3', textDecoration: 'none', fontSize: 14
        }}>
          ← {examType} の問題一覧に戻る
        </Link>
      </div>
    </div>
  );
}
