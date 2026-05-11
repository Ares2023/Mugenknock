import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS,
  DOMAIN_WEIGHTS, DOMAIN_NAME_EN, PASS_SCORES, EXAM_LEVEL,
} from '../constants';
import { getCached, setCached, SHORT_TTL } from '../utils/cache';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { IconPencil, IconClock, IconTarget } from '../components/Icons';

// ── SVG ドーナツグラフ ──────────────────────────────────────────────
function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx: number, cy: number, outerR: number, innerR: number, s: number, e: number) {
  const os = polarToCartesian(cx, cy, outerR, s);
  const oe = polarToCartesian(cx, cy, outerR, e);
  const is = polarToCartesian(cx, cy, innerR, s);
  const ie = polarToCartesian(cx, cy, innerR, e);
  const large = e - s > 180 ? 1 : 0;
  return `M ${os.x} ${os.y} A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${innerR} ${innerR} 0 ${large} 0 ${is.x} ${is.y} Z`;
}

function getAccColor(acc: number | null) {
  if (acc === null) return 'var(--color-border)';
  if (acc >= 0.70) return 'var(--color-success)';
  if (acc >= 0.50) return 'var(--color-caution)';
  return 'var(--color-danger)';
}

type DomainStat = { tagId: string; correctCount?: number; incorrectCount?: number };

function DomainPieChart({ targetExam, domainStats, lang }: {
  targetExam: string;
  domainStats: DomainStat[];
  lang: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const domains = EXAM_DOMAINS[targetExam] ?? [];
  const rawWeights = DOMAIN_WEIGHTS[targetExam] ?? domains.map(() => 100 / domains.length);
  const totalWeight = rawWeights.reduce((a, b) => a + b, 0);

  const domainData = domains.map((d, i) => {
    const stat = domainStats.find(s => s.tagId === d);
    const total = stat ? (stat.correctCount ?? 0) + (stat.incorrectCount ?? 0) : 0;
    const accuracy = total > 0 ? (stat?.correctCount ?? 0) / total : null;
    return { domain: d, weight: rawWeights[i], accuracy };
  });

  let weightedSum = 0, dataWeight = 0;
  for (const d of domainData) {
    if (d.accuracy !== null) { weightedSum += d.accuracy * d.weight; dataWeight += d.weight; }
  }
  const overallAcc = dataWeight > 0 ? weightedSum / dataWeight : null;

  const size = 140;
  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.43, innerR = size * 0.28;

  const slices: { path: string; color: string; i: number }[] = [];
  let cumDeg = 0;
  for (let i = 0; i < domainData.length; i++) {
    const sweep = (domainData[i].weight / totalWeight) * 360;
    if (sweep < 0.1) { cumDeg += sweep; continue; }
    const startDeg = cumDeg;
    const endDeg = cumDeg + sweep;
    slices.push({ path: donutSlicePath(cx, cy, outerR, innerR, startDeg, endDeg - 0.5), color: getAccColor(domainData[i].accuracy), i });
    cumDeg += sweep;
  }

  const centerText = overallAcc !== null ? `${Math.round(overallAcc * 100)}%` : '—';
  const centerColor = getAccColor(overallAcc);

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
        {slices.map(s => (
          <path
            key={s.i}
            d={s.path}
            fill={s.color}
            stroke="var(--color-bg-white)"
            strokeWidth="2"
            opacity={hovered === null || hovered === s.i ? 1 : 0.55}
            style={{ cursor: 'default', transition: 'opacity 0.15s' }}
            onMouseEnter={() => setHovered(s.i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={size * 0.15} fontWeight="800" fill={centerColor}>
          {centerText}
        </text>
        <text x={cx} y={cy + size * 0.13} textAnchor="middle" dominantBaseline="middle"
          fontSize={size * 0.09} fill="var(--color-text-light)">
          {lang === 'ja' ? '正答率' : 'Accuracy'}
        </text>
      </svg>

      {/* ホバー情報 */}
      <div style={{ minHeight: 28, textAlign: 'center' }}>
        {hovered !== null && domainData[hovered] ? (
          <div style={{ fontSize: 11, color: 'var(--color-text-sub)', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 700, color: getAccColor(domainData[hovered].accuracy) }}>
              {domainData[hovered].accuracy !== null ? `${Math.round(domainData[hovered].accuracy! * 100)}%` : '—'}
            </span>
            {'  '}
            <span style={{ color: 'var(--color-text-light)' }}>
              {lang === 'en' ? (DOMAIN_NAME_EN[domainData[hovered].domain] ?? domainData[hovered].domain) : domainData[hovered].domain}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--color-text-light)' }}>
            {lang === 'ja' ? 'ドメインにカーソルを合わせると詳細表示' : 'Hover over a slice for details'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 模試確認モーダル ────────────────────────────────────────────────
function ExamConfirmModal({ targetExam, lang, onConfirm, onCancel, loading }: {
  targetExam: string;
  lang: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const cfg = EXAM_CONFIGS[targetExam];
  const ja = lang === 'ja';
  const rules = ja
    ? ['タイマーは開始後にカウントダウン', '正誤は全問終了後に確認', '途中で一時停止・再開が可能', 'AI確認済み問題・未回答問題のみ出題']
    : ['Timer counts down after start', 'Results shown after finishing all questions', 'You can pause and resume', 'Only AI-verified and unanswered questions'];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '28px 28px 24px', width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>
          {ja ? '模試を開始しますか？' : 'Start Mock Exam?'}
        </h3>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginBottom: 20 }}>
          {cfg.fullName}
        </div>

        <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '問題数' : 'Questions'}</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-main)' }}>{cfg.totalQuestions}<span style={{ fontSize: 12, fontWeight: 400 }}>{ja ? '問' : ' Q'}</span></div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '制限時間' : 'Time Limit'}</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-main)' }}>{cfg.timeLimitMin}<span style={{ fontSize: 12, fontWeight: 400 }}>{ja ? '分' : ' min'}</span></div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '合格点' : 'Pass Score'}</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-main)' }}>{PASS_SCORES[targetExam]}</div>
          </div>
        </div>

        <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>{ja ? 'ルール' : 'Rules'}</div>
          {rules.map((r, i) => (
            <div key={i} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: i < rules.length - 1 ? 4 : 0 }}>
              <span style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{r}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1, background: '#FF9900', color: '#16191f', borderColor: '#FF9900' }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                {ja ? '準備中...' : 'Preparing...'}
              </span>
            ) : (ja ? '開始する' : 'Start')}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {ja ? 'キャンセル' : 'Cancel'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 今日のサービス ─────────────────────────────────────────────────
type DailyService = {
  serviceId: string;
  name: string;
  shortName?: string;
  category?: string;
  icon: string;
  description: string;
  trivia?: string;
};

function TodayServiceSection({ lang }: { lang: string }) {
  const [service, setService] = useState<DailyService | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCached<DailyService | null>('daily_service_today');
    if (cached !== undefined) { setService(cached); setLoading(false); return; }
    fetch(`${API_ENDPOINT}/daily-service`)
      .then(r => r.json())
      .then(d => {
        const s = d.service ?? null;
        setCached('daily_service_today', s, 60 * 60 * 1000); // 1時間キャッシュ
        setService(s);
      })
      .catch(() => setService(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <Card padding="var(--spacing-md)" style={{ marginBottom: 'var(--spacing-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div className="skeleton" style={{ width: 120, height: 16, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: '50%', height: 20, borderRadius: 4, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: '100%', height: 14, borderRadius: 4, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: '80%', height: 14, borderRadius: 4 }} />
        </div>
      </div>
    </Card>
  );

  if (!service) return null;

  return (
    <Card padding="var(--spacing-md)" style={{ marginBottom: 'var(--spacing-md)', borderLeft: '3px solid var(--color-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14 }}>✨</span>
        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
          {lang === 'ja' ? '今日のサービス' : "Today's Service"}
        </span>
        {service.category && (
          <span style={{
            marginLeft: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px',
            borderRadius: 'var(--border-radius-full)',
            background: 'var(--color-primary-light)', color: 'var(--color-primary)',
          }}>
            {service.category}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* アイコン */}
        <div style={{
          width: 56, height: 56, borderRadius: 12, flexShrink: 0,
          background: 'var(--color-primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>
          {service.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* サービス名 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-main)' }}>
              {service.name}
            </span>
            {service.shortName && (
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-light)', background: 'var(--color-bg-main)', borderRadius: 4, padding: '1px 6px' }}>
                {service.shortName}
              </span>
            )}
          </div>

          {/* 説明文 */}
          <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
            {service.description}
          </p>

          {/* 豆知識 */}
          {service.trivia && (
            <div style={{
              background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)',
              padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
                {service.trivia}
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── ニュースセクション ──────────────────────────────────────────────
const NEWS_RSS_API = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://aws.amazon.com/jp/about-aws/whats-new/recent/feed/')}`;

function NewsSection({ lang }: { lang: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const cached = getCached<any[]>('aws_home_news');
    if (cached) { setItems(cached); setLoading(false); return; }
    fetch(NEWS_RSS_API)
      .then(r => r.json())
      .then(d => {
        const news = (d.items ?? []).slice(0, 5);
        setItems(news);
        setCached('aws_home_news', news, 30 * 60 * 1000);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    } catch { return ''; }
  };

  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').slice(0, 80);

  return (
    <Card padding="var(--spacing-md)">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14 }}>📰</span>
        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
          AWS {lang === 'ja' ? '最新情報' : 'What\'s New'}
        </span>
        <a
          href="https://aws.amazon.com/jp/about-aws/whats-new/recent/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', textDecoration: 'none' }}
        >
          {lang === 'ja' ? 'すべて見る →' : 'View all →'}
        </a>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <div className="sherpa-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
        </div>
      )}
      {error && !loading && (
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic', padding: '8px 0' }}>
          {lang === 'ja' ? 'ニュースを読み込めませんでした' : 'Failed to load news'}
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
          {lang === 'ja' ? 'ニュースがありません' : 'No news available'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {items.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textDecoration: 'none', color: 'inherit',
              padding: '10px 0',
              borderBottom: i < items.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 2,
                }}>
                  {item.title}
                </div>
                {item.description && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-sub)', lineHeight: 1.4 }}>
                    {stripHtml(item.description)}…
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-light)', flexShrink: 0, marginTop: 2 }}>
                {formatDate(item.pubDate)}
              </div>
            </div>
          </a>
        ))}
      </div>
    </Card>
  );
}

// ── メインコンポーネント ────────────────────────────────────────────
const QUICK_PREFS_KEY = 'quickExercisePrefs';
function loadQuickPrefs() {
  try { return JSON.parse(localStorage.getItem(QUICK_PREFS_KEY) ?? '{}'); } catch { return {}; }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Home() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const ja = lang === 'ja';

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem('targetExam'));
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [examLoading, setExamLoading] = useState(false);
  const [showExamConfirm, setShowExamConfirm] = useState(false);

  // モバイル試験選択ドロップダウン
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // サイドバーからの試験変更イベント
  useEffect(() => {
    const handler = (e: Event) => setTargetExam((e as CustomEvent).detail);
    window.addEventListener('targetExamChanged', handler);
    return () => window.removeEventListener('targetExamChanged', handler);
  }, []);

  // モバイルドロップダウン外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(e.target as Node)) {
        setMobileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ドメイン統計取得
  useEffect(() => {
    if (!user) { setDomainStats([]); return; }
    setStatsLoading(true);
    const cached = getCached<DomainStat[]>(`ustats_${user.userId}`);
    if (cached !== null) { setDomainStats(cached); setStatsLoading(false); return; }
    fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`)
      .then(r => r.json())
      .then(d => {
        const stats = d.stats ?? [];
        // 空の場合はキャッシュしない（演習後に即反映されるよう）
        if (stats.length > 0) setCached(`ustats_${user.userId}`, stats, SHORT_TTL);
        setDomainStats(stats);
      })
      .catch(() => setDomainStats([]))
      .finally(() => setStatsLoading(false));
  }, [user]);

  // モバイル試験選択
  const handleMobileExamSelect = (et: string) => {
    localStorage.setItem('targetExam', et);
    setTargetExam(et);
    setMobileDropdownOpen(false);
    window.dispatchEvent(new CustomEvent('targetExamChanged', { detail: et }));
  };

  // 予想スコア計算
  const { estimatedScore } = useMemo(() => {
    if (!targetExam || domainStats.length === 0) return { estimatedScore: null };
    const domains = EXAM_DOMAINS[targetExam] ?? [];
    const weights = DOMAIN_WEIGHTS[targetExam] ?? domains.map(() => 100 / domains.length);
    let weightedSum = 0, dataWeight = 0;
    for (let i = 0; i < domains.length; i++) {
      const stat = domainStats.find(s => s.tagId === domains[i]);
      if (!stat) continue;
      const total = (stat.correctCount ?? 0) + (stat.incorrectCount ?? 0);
      if (total === 0) continue;
      const acc = (stat.correctCount ?? 0) / total;
      weightedSum += acc * weights[i];
      dataWeight += weights[i];
    }
    if (dataWeight === 0) return { estimatedScore: null };
    const wAcc = weightedSum / dataWeight;
    return { estimatedScore: Math.round(100 + wAcc * 900) };
  }, [targetExam, domainStats]);

  const passScore = targetExam ? PASS_SCORES[targetExam] : null;
  const scoreColor = estimatedScore === null ? 'var(--color-text-light)'
    : passScore !== null && estimatedScore >= passScore ? 'var(--color-success)'
    : passScore !== null && estimatedScore >= passScore - 50 ? 'var(--color-caution)'
    : 'var(--color-danger)';

  // サクッと演習開始
  const startQuickExercise = async () => {
    if (!targetExam) {
      alert(ja ? '試験を選択してください' : 'Please select an exam');
      return;
    }
    const prefs = loadQuickPrefs();
    const count = prefs.questionCount ?? 5;
    setQuickLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      let items: any[] = data.items ?? [];
      items = items.filter((q: any) => q.aiVerified === true);
      if (prefs.unansweredOnly && user) {
        const res = await fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json());
        const answered = new Set(res.questionIds ?? []);
        items = items.filter((q: any) => !answered.has(q.questionId));
      }
      items = shuffleArray(items).slice(0, count);
      if (items.length === 0) {
        alert(ja ? 'AI確認済みの問題がありません' : 'No AI-verified questions available');
        return;
      }
      const questionIds = items.map((q: any) => q.questionId);
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exercise', examType: targetExam, questionIds }),
      });
      const sessionData = await sessionRes.json();
      navigate('/exercise/session', {
        state: { sessionId: sessionData.sessionId, questions: items, userId, mode: 'exercise', examType: targetExam },
      });
    } catch (err) {
      console.error(err);
      alert(ja ? '演習の開始に失敗しました' : 'Failed to start exercise');
    } finally {
      setQuickLoading(false);
    }
  };

  // 模試開始
  const startExamFromHome = async () => {
    if (!targetExam) return;
    const cfg = EXAM_CONFIGS[targetExam];
    setExamLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      let items: any[] = data.items ?? [];
      items = items.filter((q: any) => q.aiVerified === true);
      if (user) {
        const res = await fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json());
        const answered = new Set(res.questionIds ?? []);
        items = items.filter((q: any) => !answered.has(q.questionId));
      }
      items = shuffleArray(items).slice(0, cfg.totalQuestions);
      if (items.length === 0) {
        alert(ja ? '条件に合う問題がありません（AI確認済み・未回答問題が0件）' : 'No questions match the criteria');
        setExamLoading(false);
        setShowExamConfirm(false);
        return;
      }
      const questionIds = items.map((q: any) => q.questionId);
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType: targetExam, questionIds }),
      });
      const sessionData = await sessionRes.json();
      navigate('/exam/session', {
        state: { sessionId: sessionData.sessionId, questions: items, userId, examType: targetExam, isMini: false },
      });
    } catch (err) {
      console.error(err);
      alert(ja ? '模試の開始に失敗しました' : 'Failed to start exam');
    } finally {
      setExamLoading(false);
      setShowExamConfirm(false);
    }
  };

  const prefs = loadQuickPrefs();
  const quickCount = prefs.questionCount ?? 5;
  const cfg = targetExam ? EXAM_CONFIGS[targetExam] : null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-lg) var(--spacing-lg)' }} className="page-container">

      {/* モバイルのみ: 試験選択セレクタ */}
      {isMobile && (
        <div ref={mobileDropdownRef} style={{ position: 'relative', marginBottom: 'var(--spacing-md)' }}>
          <button
            onClick={() => setMobileDropdownOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '9px 14px', border: `1.5px solid ${mobileDropdownOpen ? 'var(--color-primary)' : 'var(--color-border)'}`,
              borderRadius: 'var(--border-radius-md)', background: 'var(--color-bg-white)',
              cursor: 'pointer', fontSize: 'var(--font-size-base)', fontWeight: 600,
              color: targetExam ? 'var(--color-text-main)' : 'var(--color-text-light)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--color-primary)' }}><IconTarget size={16} /></span>
              <span>{targetExam ? `${EXAM_LEVEL[targetExam]} / ${targetExam}` : (ja ? '目標試験を選択...' : 'Select target exam...')}</span>
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-primary)', transform: mobileDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
          </button>
          {mobileDropdownOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--color-bg-white)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              zIndex: 300, maxHeight: 260, overflowY: 'auto',
            }}>
              {(['Foundational', 'Associate', 'Professional'] as const).map((level, li) => {
                const items = EXAM_TYPES.filter(et => EXAM_LEVEL[et] === level);
                if (items.length === 0) return null;
                return (
                  <div key={level}>
                    {li > 0 && <div style={{ height: 1, background: 'var(--color-border)' }} />}
                    <div style={{ padding: '5px 12px 2px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{level}</div>
                    {items.map(et => {
                      const sel = targetExam === et;
                      return (
                        <button key={et} onClick={() => handleMobileExamSelect(et)} style={{
                          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', border: 'none',
                          background: sel ? 'var(--color-primary-light)' : 'transparent',
                          cursor: 'pointer', fontSize: 'var(--font-size-sm)',
                          color: sel ? 'var(--color-primary)' : 'var(--color-text-main)',
                          fontWeight: sel ? 700 : 400,
                        }}>
                          <span style={{ fontWeight: 700, minWidth: 36, flexShrink: 0 }}>{et}</span>
                          <span style={{ fontSize: 11, color: sel ? 'var(--color-primary)' : 'var(--color-text-sub)' }}>— {EXAM_CONFIGS[et].fullName}</span>
                          {sel && <span style={{ marginLeft: 'auto', fontSize: 12 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 一段目: 予想点数 + ドメイン円グラフ ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }} className="home-row1-grid">
        {/* 予想点数 */}
        <Card padding="var(--spacing-md)">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            {ja ? '予想スコア' : 'Est. Score'}
          </div>
          {!targetExam ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic', padding: '8px 0' }}>
              {ja ? '試験を選択してください' : 'Select an exam'}
            </div>
          ) : statsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
              <div className="skeleton" style={{ height: 44, width: '60%', borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 14, width: '40%', borderRadius: 4 }} />
            </div>
          ) : estimatedScore === null ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic', padding: '8px 0' }}>
              {ja ? '演習データがありません' : 'No practice data yet'}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 48, fontWeight: 800, color: scoreColor, lineHeight: 1, letterSpacing: '-1px' }}>
                {estimatedScore}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 2 }}>
                / 1000 {ja ? 'スケールスコア' : 'scaled score'}
              </div>
              {passScore !== null && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, background: 'var(--color-bg-main)', borderRadius: 10, height: 6, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, (estimatedScore / 1000) * 100)}%`, height: '100%',
                      borderRadius: 10, background: scoreColor,
                    }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--color-text-light)', flexShrink: 0 }}>
                    {ja ? `合格ライン ${passScore}` : `Pass: ${passScore}`}
                  </span>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ドメイン円グラフ */}
        <Card padding="var(--spacing-md)">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            {ja ? 'ドメイン別成績' : 'Domain Results'}
          </div>
          {!targetExam ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic', padding: '8px 0' }}>
              {ja ? '試験を選択してください' : 'Select an exam'}
            </div>
          ) : statsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
              <DomainPieChart targetExam={targetExam} domainStats={domainStats} lang={lang} />
              {/* ドメイン凡例 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {(EXAM_DOMAINS[targetExam] ?? []).map((d, i) => {
                  const stat = domainStats.find(s => s.tagId === d);
                  const total = stat ? (stat.correctCount ?? 0) + (stat.incorrectCount ?? 0) : 0;
                  const acc = total > 0 ? (stat?.correctCount ?? 0) / total : null;
                  return (
                    <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: getAccColor(acc), flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: 'var(--color-text-sub)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: getAccColor(acc), flexShrink: 0 }}>
                        {acc !== null ? `${Math.round(acc * 100)}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── 二・三段目: 演習・模試ボタン ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
        {/* サクッと演習 */}
        <Card
          padding="var(--spacing-md)"
          style={{ borderTop: '3px solid var(--color-primary)', cursor: targetExam ? 'pointer' : 'default' }}
          onClick={targetExam && !quickLoading ? startQuickExercise : undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: 'var(--color-primary)', display: 'flex' }}><IconPencil size={18} /></span>
            <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
              {ja ? 'サクッと演習' : 'Quick Practice'}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Badge variant="secondary">{quickCount}{ja ? '問' : 'Q'}</Badge>
            </span>
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginBottom: 10, lineHeight: 1.4 }}>
            {ja ? 'AI確認済み問題を即スタート' : 'Start immediately with AI-verified questions'}
          </div>
          <Button
            variant="primary"
            disabled={!targetExam || quickLoading}
            onClick={e => { e.stopPropagation(); if (targetExam && !quickLoading) startQuickExercise(); }}
            style={{ width: '100%', background: '#FF9900', color: '#16191f', borderColor: '#FF9900' }}
          >
            {quickLoading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                {ja ? '準備中...' : 'Loading...'}
              </span>
            ) : (ja ? 'すぐに始める →' : 'Start Now →')}
          </Button>
        </Card>

        {/* カスタム演習 */}
        <Card
          padding="var(--spacing-md)"
          style={{ borderTop: '3px solid var(--color-border)', cursor: 'pointer' }}
          onClick={() => navigate('/exercise/setup')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: 'var(--color-text-sub)', display: 'flex' }}><IconPencil size={16} /></span>
            <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
              {ja ? 'カスタム演習' : 'Custom'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-sub)', marginBottom: 10, lineHeight: 1.4 }}>
            {ja ? 'ドメイン・条件を詳細設定' : 'Configure domains & filters'}
          </div>
          <Button
            variant="outline"
            onClick={e => { e.stopPropagation(); navigate('/exercise/setup'); }}
            style={{ width: '100%', fontSize: 'var(--font-size-sm)' }}
          >
            {ja ? '設定する →' : 'Setup →'}
          </Button>
        </Card>

        {/* 模試ボタン（全幅） */}
        <div style={{ gridColumn: '1 / -1' }}>
          <Card
            padding="var(--spacing-md)"
            style={{ borderTop: '3px solid var(--color-secondary)', cursor: targetExam ? 'pointer' : 'default' }}
            onClick={targetExam ? () => setShowExamConfirm(true) : undefined}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ color: 'var(--color-secondary)', display: 'flex' }}><IconClock size={20} /></span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
                    {ja ? '模試' : 'Mock Exam'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
                    {cfg
                      ? (ja ? `本番と同じ条件 · ${cfg.totalQuestions}問 · ${cfg.timeLimitMin}分` : `Same as real exam · ${cfg.totalQuestions}Q · ${cfg.timeLimitMin}min`)
                      : (ja ? '本番と同じ条件でテスト' : 'Test under real exam conditions')}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                disabled={!targetExam}
                onClick={e => { e.stopPropagation(); if (targetExam) setShowExamConfirm(true); }}
                style={{ borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)', flexShrink: 0 }}
              >
                {ja ? '模試を開始 →' : 'Start Exam →'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── 三.五段目: 今日のサービス ── */}
      <TodayServiceSection lang={lang} />

      {/* ── 四段目: ニュース ── */}
      <NewsSection lang={lang} />

      {/* ── 非ログイン時バナー ── */}
      {!user && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
          gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)',
          background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)',
          borderRadius: 'var(--border-radius-md)', padding: '10px var(--spacing-md)',
          fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)',
        }}>
          <span style={{ lineHeight: 1.6 }}>
            {ja
              ? 'ログインすると演習・模試の結果が保存され、予想スコアが表示されます。'
              : 'Log in to save results and view your estimated score.'}
          </span>
          <Button variant="primary" size="sm" onClick={() => navigate('/login')} style={{ flexShrink: 0 }}>
            {ja ? 'ログイン →' : 'Log in →'}
          </Button>
        </div>
      )}

      {/* 模試確認モーダル */}
      {showExamConfirm && targetExam && (
        <ExamConfirmModal
          targetExam={targetExam}
          lang={lang}
          onConfirm={startExamFromHome}
          onCancel={() => setShowExamConfirm(false)}
          loading={examLoading}
        />
      )}
    </div>
  );
}
