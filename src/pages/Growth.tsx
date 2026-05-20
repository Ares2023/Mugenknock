import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { API_ENDPOINT } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';

type MainTab = 'generation' | 'check';
type ViewMode = 'daily' | 'monthly';

// チャート色の定義
const COLOR_GENERATION = 'var(--color-primary)';
const COLOR_CHECK = 'var(--color-primary)';

interface GrowthData {
  daily: {
    dates: string[];
    created: number[];
    verified: number[];
    createdCumulative: number[];
    verifiedCumulative: number[];
    createdByExam?: Array<Record<string, number>>;
    verifiedByExam?: Array<Record<string, number>>;
  };
  monthly: {
    months: string[];
    created: number[];
    verified: number[];
    createdCumulative: number[];
    verifiedCumulative: number[];
    createdByExam?: Array<Record<string, number>>;
    verifiedByExam?: Array<Record<string, number>>;
  };
  total: number;
  totalVerified: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DualBarChart({ labels, s1, s2, label1, label2, color1, color2, breakdown }: {
  labels: string[];
  s1: number[];
  s2?: number[];
  label1: string;
  label2?: string;
  color1: string;
  color2?: string;
  breakdown?: Array<Record<string, number>>;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; v1: number; v2?: number; examRows: [string, number][] } | null>(null);
  const n = labels.length;
  const safe1 = s1 ?? [];
  const safe2 = s2 ?? [];
  const dual = !!s2 && !!label2 && !!color2;
  const maxVal = Math.max(...safe1, ...(dual ? safe2 : []), 1);
  const maxY = Math.ceil(maxVal / 5) * 5;

  const W = 560, H = 200;
  const ML = 30, MR = 10, MT = 28, MB = 28;
  const chartW = W - ML - MR;
  const chartH = H - MT - MB;

  const groupW = chartW / n;
  const barW = dual ? Math.min(groupW * 0.165, 8) : Math.min(groupW * 0.4, 12);
  const barGap = 3;
  const groupOffset = dual ? (groupW - 2 * barW - barGap) / 2 : (groupW - barW) / 2;

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
      {dual && color2 && label2 && (
        <>
          <rect x={ML + 55} y={4} width={9} height={9} fill={color2} rx={2} />
          <text x={ML + 68} y={12} fontSize="9" fill="var(--color-text-sub)">{label2}</text>
        </>
      )}

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
        <g key={i}
          onMouseEnter={() => {
            const examRows: [string, number][] = breakdown?.[i]
              ? Object.entries(breakdown[i]).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0)
              : [];
            const minY = dual ? Math.min(by(safe1[i]), by(safe2[i])) : by(safe1[i]);
            setTooltip({ x: lx(i), y: MT + minY, label, v1: safe1[i], v2: dual ? safe2[i] : undefined, examRows });
          }}
          onMouseLeave={() => setTooltip(null)}
          style={{ cursor: 'default' }}
        >
          <rect x={ML + i * groupW} y={MT} width={groupW} height={chartH} fill="transparent" />
          <rect x={bx1(i)} y={MT + by(safe1[i])} width={barW}
            height={Math.max(bh(safe1[i]), safe1[i] > 0 ? 2 : 0)}
            fill={color1} rx={2} />
          {safe1[i] > 0 && (
            <text x={bx1(i) + barW / 2} y={MT + by(safe1[i]) - 3}
              textAnchor="middle" fontSize="8" fill={color1} fontWeight="600">{safe1[i]}</text>
          )}
          {dual && color2 && (
            <>
              <rect x={bx2(i)} y={MT + by(safe2[i])} width={barW}
                height={Math.max(bh(safe2[i]), safe2[i] > 0 ? 2 : 0)}
                fill={color2} rx={2} />
              {safe2[i] > 0 && (
                <text x={bx2(i) + barW / 2} y={MT + by(safe2[i]) - 3}
                  textAnchor="middle" fontSize="8" fill={color2} fontWeight="600">{safe2[i]}</text>
              )}
            </>
          )}
          <text x={lx(i)} y={H - MB + 14} textAnchor="middle" fontSize="9" fill="var(--color-text-sub)">{label}</text>
        </g>
      ))}

      {/* Tooltip: 試験別内訳があれば優先表示、なければ総数 */}
      {tooltip && (() => {
        const { x, y, label, v1, v2, examRows } = tooltip;
        const showBreakdown = examRows.length > 0;
        const bodyLines: { text: string }[] = showBreakdown
          ? examRows.map(([exam, cnt]) => ({ text: `${exam}: ${cnt}` }))
          : [
              { text: `${label1}: ${v1}` },
              ...(v2 !== undefined && label2 ? [{ text: `${label2}: ${v2}` }] : []),
            ];
        const allLines = [{ text: label, bold: true }, ...bodyLines.map(l => ({ ...l, bold: false }))];
        const lineH = 13, pad = 7, boxW = showBreakdown ? 120 : 112;
        const boxH = allLines.length * lineH + pad * 2;
        const boxX = Math.min(x + 8, W - MR - boxW);
        const boxY = Math.max(MT, Math.min(y - boxH / 2, H - MB - boxH));
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={4}
              style={{ fill: 'var(--color-bg-white)', stroke: 'var(--color-border)', strokeWidth: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }} />
            {allLines.map((item, li) => (
              <text key={li} x={boxX + pad} y={boxY + pad + (li + 1) * lineH - 2}
                fontSize={9} fontWeight={item.bold ? '700' : '400'}
                style={{ fill: item.bold ? 'var(--color-text-main)' : 'var(--color-text-sub)' }}>
                {item.text}
              </text>
            ))}
          </g>
        );
      })()}
    </svg>
  );
}

// s2/label2/color2 は optional（省略時は単系列表示）
function DualLineChart({ labels, s1, s2, label1, label2, color1, color2, markerLabel }: {
  labels: string[];
  s1: number[];
  s2?: number[];
  label1: string;
  label2?: string;
  color1: string;
  color2?: string;
  markerLabel?: string;
}) {
  const [tooltip, setTooltip] = useState<{ i: number } | null>(null);
  const line1Ref = useRef<SVGPolylineElement>(null);
  const line2Ref = useRef<SVGPolylineElement>(null);
  const [dash, setDash] = useState({ l1: 0, l2: 0 });
  const [drawn, setDrawn] = useState(false);

  const safe1 = s1 ?? [];
  const safe2 = s2 ?? [];
  const dual = !!s2 && !!label2 && !!color2;
  const n = labels.length;

  useLayoutEffect(() => {
    if (!line1Ref.current) return;
    const l1 = line1Ref.current.getTotalLength();
    const l2 = line2Ref.current?.getTotalLength() ?? 0;
    setDash({ l1, l2 });
    setDrawn(false);
    let r2: number;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setDrawn(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [labels]); // eslint-disable-line react-hooks/exhaustive-deps

  if (n === 0) return null;

  const maxVal = Math.max(...safe1, ...(dual ? safe2 : []), 1);
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
  const pts2 = dual ? safe2.map((v, i) => `${px(i)},${py(v)}`).join(' ') : '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* Legend */}
      <line x1={ML} y1={8} x2={ML + 16} y2={8} stroke={color1} strokeWidth="2" strokeLinecap="round" />
      <circle cx={ML + 8} cy={8} r={3} fill={color1} />
      <text x={ML + 20} y={12} fontSize="9" fill="var(--color-text-sub)">{label1}</text>
      {dual && color2 && label2 && (
        <>
          <line x1={ML + 115} y1={8} x2={ML + 131} y2={8} stroke={color2} strokeWidth="2" strokeLinecap="round" />
          <circle cx={ML + 123} cy={8} r={3} fill={color2} />
          <text x={ML + 135} y={12} fontSize="9" fill="var(--color-text-sub)">{label2}</text>
        </>
      )}

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
      {n > 1 && (
        <polyline ref={line1Ref} points={pts1} fill="none" stroke={color1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray={dash.l1 || undefined}
          strokeDashoffset={drawn ? 0 : dash.l1}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {dual && n > 1 && (
        <polyline ref={line2Ref} points={pts2} fill="none" stroke={color2} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray={dash.l2 || undefined}
          strokeDashoffset={drawn ? 0 : dash.l2}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1) 0.1s' }}
        />
      )}

      {/* Data points — each dot appears as the line reaches it */}
      {safe1.map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r={3} fill={color1}
          style={{ animation: `sherpa-fade-in 0.12s ease ${(i / Math.max(n - 1, 1)) * 1.0}s both` }} />
      ))}
      {dual && color2 && safe2.map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v)} r={3} fill={color2}
          style={{ animation: `sherpa-fade-in 0.12s ease ${0.1 + (i / Math.max(n - 1, 1)) * 1.0}s both` }} />
      ))}

      {/* X-axis labels */}
      {labels.map((label, i) => (
        <text key={i} x={px(i)} y={H - MB + 14} textAnchor="middle" fontSize="9" fill="var(--color-text-sub)">{label}</text>
      ))}

      {/* Last-point vertical marker */}
      {markerLabel && n > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          <line x1={px(n - 1)} y1={MT - 10} x2={px(n - 1)} y2={MT + chartH}
            stroke={color1} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
          <text x={px(n - 1) - 4} y={MT - 13} textAnchor="end" fontSize={10} fontWeight="700" fill={color1}>
            {markerLabel}
          </text>
        </g>
      )}

      {/* Crosshair */}
      {tooltip !== null && (
        <line x1={px(tooltip.i)} y1={MT} x2={px(tooltip.i)} y2={MT + chartH}
          stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3,2" style={{ pointerEvents: 'none' }} />
      )}

      {/* Column hover areas */}
      {labels.map((_, i) => {
        const x0 = i === 0 ? ML : (px(i - 1) + px(i)) / 2;
        const x1 = i === n - 1 ? ML + chartW : (px(i) + px(i + 1)) / 2;
        return (
          <rect key={i} x={x0} y={MT} width={x1 - x0} height={chartH} fill="transparent"
            style={{ cursor: 'default' }}
            onMouseEnter={() => setTooltip({ i })}
            onMouseLeave={() => setTooltip(null)}
          />
        );
      })}

      {/* Tooltip */}
      {tooltip !== null && (() => {
        const { i } = tooltip;
        const x = px(i);
        const y = Math.min(py(safe1[i]), dual ? py(safe2[i]) : Infinity);
        const lines = [
          labels[i],
          `${label1}: ${fmt(safe1[i])}`,
          ...(dual && label2 ? [`${label2}: ${fmt(safe2[i])}`] : []),
        ];
        const lineH = 13, pad = 7, boxW = 140;
        const boxH = lines.length * lineH + pad * 2;
        const boxX = x > W * 0.65 ? x - boxW - 8 : x + 8;
        const boxY = Math.max(MT, Math.min(y - boxH / 2, H - MB - boxH));
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={4}
              style={{ fill: 'var(--color-bg-white)', stroke: 'var(--color-border)', strokeWidth: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }} />
            {lines.map((line, li) => (
              <text key={li} x={boxX + pad} y={boxY + pad + (li + 1) * lineH - 2}
                fontSize={9} fontWeight={li === 0 ? '700' : '400'}
                style={{ fill: li === 0 ? 'var(--color-text-main)' : 'var(--color-text-sub)' }}>
                {line}
              </text>
            ))}
          </g>
        );
      })()}
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
        {value.toLocaleString()}<span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, color: 'var(--color-text-sub)', marginLeft: 4 }}>件</span>
      </div>
    </div>
  );
}

export default function Growth() {
  const { lang } = useLanguage();
  const [mainTab, setMainTab] = useState<MainTab>('generation');
  const [view, setView] = useState<ViewMode>('daily');
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // 日次: 14日、月次: 12ヶ月
    fetch(`${API_ENDPOINT}/questions/growth-stats?dailyDays=14&monthlyMonths=12`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '48px 24px', display: 'flex', justifyContent: 'center' }}>
        <div className="sherpa-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
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
  const monthlyLabels = data.monthly.months.map(m => `${parseInt(m.slice(5, 7))}月`);

  const isDaily = view === 'daily';
  const labels = isDaily ? dailyLabels : monthlyLabels;
  const src = isDaily ? data.daily : data.monthly;

  const checkRate = data.total > 0 ? (data.totalVerified / data.total) * 100 : 0;

  const lastDaily = data.daily.created.length - 1;
  const lastMonthly = data.monthly.created.length - 1;
  const summaryCreated = isDaily ? (data.daily.created[lastDaily] ?? 0) : (data.monthly.created[lastMonthly] ?? 0);
  const summaryVerified = isDaily ? (data.daily.verified[lastDaily] ?? 0) : (data.monthly.verified[lastMonthly] ?? 0);
  const summaryPeriodLabel = isDaily
    ? (lang === 'ja' ? '今日' : 'Today')
    : (data.monthly.months[lastMonthly]
        ? `${parseInt(data.monthly.months[lastMonthly].slice(5, 7))}${lang === 'ja' ? '月' : ''}`
        : (lang === 'ja' ? '今月' : 'This month'));

  const chartBoxStyle: React.CSSProperties = {
    background: 'var(--color-bg-white)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--border-radius-lg)',
    padding: '16px 12px 12px',
  };

  const MAIN_TABS: { key: MainTab; label: string }[] = [
    { key: 'generation', label: lang === 'ja' ? '問題生成' : 'Generation' },
    { key: 'check', label: lang === 'ja' ? '問題チェック' : 'Verification' },
  ];

  return (
    <div style={{ padding: '28px 24px', maxWidth: 820, margin: '0 auto' }}>
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

      {/* メインタブ */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: 0 }}>
        {MAIN_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setMainTab(tab.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 20px',
              fontSize: 'var(--font-size-base)',
              fontWeight: mainTab === tab.key ? 700 : 400,
              color: mainTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderBottom: mainTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 日次/月次トグル（タブの下） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0', marginBottom: 12 }}>
        <div style={{ display: 'flex', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          {(['daily', 'monthly'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '4px 14px', fontSize: 'var(--font-size-sm)', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: view === v ? 'var(--color-primary)' : 'transparent',
                color: view === v ? 'white' : 'var(--color-text-sub)',
                transition: 'all 0.15s',
              }}
            >
              {v === 'daily' ? (lang === 'ja' ? '日次' : 'Daily') : (lang === 'ja' ? '月次' : 'Monthly')}
            </button>
          ))}
        </div>
      </div>

      {/* 問題生成タブ */}
      {mainTab === 'generation' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            <SummaryCard
              title={lang === 'ja' ? `${summaryPeriodLabel}の生成数` : `${summaryPeriodLabel} Generated`}
              value={summaryCreated}
            />
            <SummaryCard
              title={lang === 'ja' ? '累計生成数' : 'Total Generated'}
              value={data.total}
            />
          </div>
          <div style={chartBoxStyle}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
              {lang === 'ja' ? '累計生成数の推移' : 'Cumulative generated'}
            </div>
            <DualLineChart
              labels={labels}
              s1={src.createdCumulative}
              label1={lang === 'ja' ? '累計生成数' : 'Cumulative'}
              color1={COLOR_GENERATION}
            />
          </div>
        </>
      )}

      {/* 問題チェックタブ */}
      {mainTab === 'check' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            <SummaryCard
              title={lang === 'ja' ? `${summaryPeriodLabel}のチェック数` : `${summaryPeriodLabel} Verified`}
              value={summaryVerified}
            />
            <SummaryCard
              title={lang === 'ja' ? '累計チェック数' : 'Total Verified'}
              value={data.totalVerified}
            />
          </div>
          <div style={chartBoxStyle}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)' }}>
                {lang === 'ja' ? '累計チェック数の推移' : 'Cumulative verified'}
              </span>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', flexShrink: 0, marginLeft: 12 }}>
                {lang === 'ja'
                  ? `全 ${data.total.toLocaleString()} 件中 ${data.totalVerified.toLocaleString()} 件チェック済`
                  : `${data.totalVerified.toLocaleString()} / ${data.total.toLocaleString()} checked`}
                <strong style={{ color: COLOR_CHECK, marginLeft: 6 }}>{checkRate.toFixed(1)}%</strong>
              </span>
            </div>
            <DualLineChart
              labels={labels}
              s1={src.verifiedCumulative}
              label1={lang === 'ja' ? '累計チェック数' : 'Cumulative checked'}
              color1={COLOR_CHECK}
              s2={src.createdCumulative}
              label2={lang === 'ja' ? '累計生成数' : 'Cumulative generated'}
              color2="#94a3b8"
              markerLabel={`${checkRate.toFixed(1)}%`}
            />
          </div>
        </>
      )}
    </div>
  );
}
