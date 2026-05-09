import React, { useState, useEffect } from 'react';
import { API_ENDPOINT } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';

type ViewMode = 'daily' | 'monthly';

interface GrowthData {
  daily: { dates: string[]; created: number[]; verified: number[]; createdCumulative: number[]; verifiedCumulative: number[] };
  monthly: { months: string[]; created: number[]; verified: number[]; createdCumulative: number[]; verifiedCumulative: number[] };
  total: number;
  totalVerified: number;
}

function DualBarChart({ labels, s1, s2, label1, label2, color1, color2 }: {
  labels: string[];
  s1: number[];
  s2: number[];
  label1: string;
  label2: string;
  color1: string;
  color2: string;
}) {
  const n = labels.length;
  const safe1 = s1 ?? [];
  const safe2 = s2 ?? [];
  const maxVal = Math.max(...safe1, ...safe2, 1);
  const maxY = Math.ceil(maxVal / 5) * 5;

  const W = 560, H = 200;
  const ML = 30, MR = 10, MT = 28, MB = 28;
  const chartW = W - ML - MR;
  const chartH = H - MT - MB;

  const groupW = chartW / n;
  const barW = Math.min(groupW * 0.165, 8);
  const barGap = 3;
  const groupOffset = (groupW - 2 * barW - barGap) / 2;

  const yTickCount = 4;
  const yStep = maxY / yTickCount;

  const bh = (v: number) => (v / maxY) * chartH;
  const by = (v: number) => chartH - bh(v);
  const bx1 = (i: number) => ML + i * groupW + groupOffset;
  const bx2 = (i: number) => bx1(i) + barW + barGap;
  const lx = (i: number) => ML + (i + 0.5) * groupW;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* Legend */}
      <rect x={ML} y={4} width={9} height={9} fill={color1} rx={2} />
      <text x={ML + 12} y={12} fontSize="9" fill="var(--color-text-sub)">{label1}</text>
      <rect x={ML + 55} y={4} width={9} height={9} fill={color2} rx={2} />
      <text x={ML + 68} y={12} fontSize="9" fill="var(--color-text-sub)">{label2}</text>

      {/* Y-axis grid */}
      {Array.from({ length: yTickCount + 1 }, (_, i) => {
        const val = i * yStep;
        const y = MT + chartH - (val / maxY) * chartH;
        return (
          <g key={i}>
            <line x1={ML} y1={y} x2={ML + chartW} y2={y}
              stroke="var(--color-border)" strokeWidth="1"
              strokeDasharray={i === 0 ? undefined : '3,3'} />
            <text x={ML - 4} y={y + 3.5} textAnchor="end" fontSize="8" fill="var(--color-text-light)">{val}</text>
          </g>
        );
      })}

      {/* Bars */}
      {labels.map((label, i) => (
        <g key={i}>
          <rect x={bx1(i)} y={MT + by(safe1[i])} width={barW}
            height={Math.max(bh(safe1[i]), safe1[i] > 0 ? 2 : 0)}
            fill={color1} rx={2} />
          {safe1[i] > 0 && (
            <text x={bx1(i) + barW / 2} y={MT + by(safe1[i]) - 3}
              textAnchor="middle" fontSize="8" fill={color1} fontWeight="600">{safe1[i]}</text>
          )}
          <rect x={bx2(i)} y={MT + by(safe2[i])} width={barW}
            height={Math.max(bh(safe2[i]), safe2[i] > 0 ? 2 : 0)}
            fill={color2} rx={2} />
          {safe2[i] > 0 && (
            <text x={bx2(i) + barW / 2} y={MT + by(safe2[i]) - 3}
              textAnchor="middle" fontSize="8" fill={color2} fontWeight="600">{safe2[i]}</text>
          )}
          <text x={lx(i)} y={H - MB + 14} textAnchor="middle" fontSize="9" fill="var(--color-text-sub)">{label}</text>
        </g>
      ))}
    </svg>
  );
}

function DualLineChart({ labels, s1, s2, label1, label2, color1, color2 }: {
  labels: string[];
  s1: number[];
  s2: number[];
  label1: string;
  label2: string;
  color1: string;
  color2: string;
}) {
  const safe1 = s1 ?? [];
  const safe2 = s2 ?? [];
  const n = labels.length;
  if (n === 0) return null;

  const maxVal = Math.max(...safe1, ...safe2, 1);
  const rawStep = maxVal / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag;
  const maxY = Math.ceil(maxVal / step) * step;
  const yTickCount = 4;
  const yStep = step;

  const W = 560, H = 200;
  const ML = 42, MR = 10, MT = 28, MB = 28;
  const chartW = W - ML - MR;
  const chartH = H - MT - MB;

  const px = (i: number) => ML + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const py = (v: number) => MT + chartH - (v / maxY) * chartH;
  const fmt = (v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v);

  const pts1 = safe1.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const pts2 = safe2.map((v, i) => `${px(i)},${py(v)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* Legend */}
      <line x1={ML} y1={8} x2={ML + 16} y2={8} stroke={color1} strokeWidth="2" strokeLinecap="round" />
      <circle cx={ML + 8} cy={8} r={3} fill={color1} />
      <text x={ML + 20} y={12} fontSize="9" fill="var(--color-text-sub)">{label1}</text>
      <line x1={ML + 80} y1={8} x2={ML + 96} y2={8} stroke={color2} strokeWidth="2" strokeLinecap="round" />
      <circle cx={ML + 88} cy={8} r={3} fill={color2} />
      <text x={ML + 100} y={12} fontSize="9" fill="var(--color-text-sub)">{label2}</text>

      {/* Y-axis grid */}
      {Array.from({ length: yTickCount + 1 }, (_, i) => {
        const val = i * yStep;
        const y = py(val);
        return (
          <g key={i}>
            <line x1={ML} y1={y} x2={ML + chartW} y2={y}
              stroke="var(--color-border)" strokeWidth="1"
              strokeDasharray={i === 0 ? undefined : '3,3'} />
            <text x={ML - 4} y={y + 3.5} textAnchor="end" fontSize="8" fill="var(--color-text-light)">{fmt(val)}</text>
          </g>
        );
      })}

      {/* Lines */}
      {n > 1 && <polyline points={pts1} fill="none" stroke={color1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {n > 1 && <polyline points={pts2} fill="none" stroke={color2} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

      {/* Data points */}
      {safe1.map((v, i) => <circle key={i} cx={px(i)} cy={py(v)} r={3} fill={color1} />)}
      {safe2.map((v, i) => <circle key={i} cx={px(i)} cy={py(v)} r={3} fill={color2} />)}

      {/* X-axis labels */}
      {labels.map((label, i) => (
        <text key={i} x={px(i)} y={H - MB + 14} textAnchor="middle" fontSize="9" fill="var(--color-text-sub)">{label}</text>
      ))}
    </svg>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div style={{
      background: 'var(--color-bg-white)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--border-radius-lg)',
      padding: '14px 18px',
    }}>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-main)', lineHeight: 1 }}>
        {value}<span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, color: 'var(--color-text-sub)', marginLeft: 4 }}>件</span>
      </div>
    </div>
  );
}

export default function Growth() {
  const { lang } = useLanguage();
  const [view, setView] = useState<ViewMode>('daily');
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/questions/growth-stats`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-light)' }}>
        {lang === 'ja' ? '読み込み中...' : 'Loading...'}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--color-danger)' }}>
        {lang === 'ja' ? 'データの取得に失敗しました' : 'Failed to load data'}
      </div>
    );
  }

  const dailyLabels = data.daily.dates.map(d => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`);
  const todayCreated = data.daily.created[6] ?? 0;
  const todayVerified = data.daily.verified[6] ?? 0;

  const monthlyLabels = data.monthly.months.map(m => `${parseInt(m.slice(5, 7))}月`);
  const thisCreated = data.monthly.created[5] ?? 0;
  const thisVerified = data.monthly.verified[5] ?? 0;

  const thisMonthLabel = data.monthly.months[5] ? `${parseInt(data.monthly.months[5].slice(5, 7))}月` : '今月';

  const cardGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginBottom: 20,
  };

  const chartBoxStyle: React.CSSProperties = {
    background: 'var(--color-bg-white)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--border-radius-lg)',
    padding: '16px 12px 12px',
  };

  return (
    <div style={{ padding: '28px 24px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-h2)', fontWeight: 800, color: 'var(--color-text-main)' }}>
          {lang === 'ja' ? '問題生成・チェック状況' : 'Question Growth & Verification'}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
          {lang === 'ja'
            ? `総問題数 ${data.total.toLocaleString()} 件 — AIによる生成・確認の推移`
            : `Total ${data.total.toLocaleString()} questions — AI generation & verification trends`}
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: 20 }}>
        {(['daily', 'monthly'] as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '10px 20px',
              fontSize: 'var(--font-size-base)',
              fontWeight: view === v ? 700 : 400,
              color: view === v ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderBottom: view === v ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -2,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {v === 'daily' ? (lang === 'ja' ? '日次（直近7日）' : 'Daily (7 days)') : (lang === 'ja' ? '月次（直近6ヶ月）' : 'Monthly (6 months)')}
          </button>
        ))}
      </div>

      {view === 'daily' ? (
        <>
          <div style={cardGridStyle}>
            <SummaryCard
              title={lang === 'ja' ? '今日の生成数' : "Today's Generated"}
              value={todayCreated}
            />
            <SummaryCard
              title={lang === 'ja' ? '今日の確認数' : "Today's Verified"}
              value={todayVerified}
            />
          </div>
          <div style={chartBoxStyle}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
              {lang === 'ja' ? '直近7日の推移' : 'Last 7 days'}
            </div>
            <DualBarChart
              labels={dailyLabels}
              s1={data.daily.created}
              s2={data.daily.verified}
              label1={lang === 'ja' ? '生成' : 'Generated'}
              label2={lang === 'ja' ? '確認済' : 'Verified'}
              color1="var(--color-primary)"
              color2="var(--color-success)"
            />
          </div>
          <div style={{ ...chartBoxStyle, marginTop: 16 }}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
              {lang === 'ja' ? '合計問題量・チェック済数の推移（日次）' : 'Cumulative total — daily'}
            </div>
            <DualLineChart
              labels={dailyLabels}
              s1={data.daily.createdCumulative}
              s2={data.daily.verifiedCumulative}
              label1={lang === 'ja' ? '合計問題数' : 'Total questions'}
              label2={lang === 'ja' ? '合計チェック済' : 'Total verified'}
              color1="var(--color-primary)"
              color2="var(--color-success)"
            />
          </div>
        </>
      ) : (
        <>
          <div style={cardGridStyle}>
            <SummaryCard
              title={lang === 'ja' ? `${thisMonthLabel}の生成数` : `${thisMonthLabel} Generated`}
              value={thisCreated}
            />
            <SummaryCard
              title={lang === 'ja' ? `${thisMonthLabel}の確認数` : `${thisMonthLabel} Verified`}
              value={thisVerified}
            />
          </div>
          <div style={chartBoxStyle}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
              {lang === 'ja' ? '直近6ヶ月の推移' : 'Last 6 months'}
            </div>
            <DualBarChart
              labels={monthlyLabels}
              s1={data.monthly.created}
              s2={data.monthly.verified}
              label1={lang === 'ja' ? '生成' : 'Generated'}
              label2={lang === 'ja' ? '確認済' : 'Verified'}
              color1="var(--color-primary)"
              color2="var(--color-success)"
            />
          </div>
          <div style={{ ...chartBoxStyle, marginTop: 16 }}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
              {lang === 'ja' ? '合計問題量・チェック済数の推移（月次）' : 'Cumulative total — monthly'}
            </div>
            <DualLineChart
              labels={monthlyLabels}
              s1={data.monthly.createdCumulative}
              s2={data.monthly.verifiedCumulative}
              label1={lang === 'ja' ? '合計問題数' : 'Total questions'}
              label2={lang === 'ja' ? '合計チェック済' : 'Total verified'}
              color1="var(--color-primary)"
              color2="var(--color-success)"
            />
          </div>
        </>
      )}
    </div>
  );
}
