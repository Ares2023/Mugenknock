import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  API_ENDPOINT, EXAM_DOMAINS,
  DOMAIN_WEIGHTS, DOMAIN_NAME_EN, PASS_SCORES,
} from '../constants';
import { getCached, setCached, deleteCached, DEFAULT_TTL } from '../utils/cache';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { IconLightbulb, IconSettings, IconChevronUp, ServiceIcon, isServiceIconKey } from '../components/Icons';

type DomainStat = { tagId: string; correctCount?: number; incorrectCount?: number };
type SessionEntry = { correct: number; total: number };
type DomainHistory = Record<string, SessionEntry[]>;
type ScoreEntry = { date: string; score: number };

// ── ユーティリティ ───────────────────────────────────────────────
function getGrade(pct: number | null): string {
  if (pct === null) return '—';
  if (pct >= 90) return 'S';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  return 'D';
}

function readDomainHistory(examType: string): DomainHistory {
  try { return JSON.parse(localStorage.getItem(`domain_history_${examType}`) ?? '{}'); } catch { return {}; }
}

function readScoreHistory(examType: string): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(`score_history_${examType}`) ?? '[]'); } catch { return []; }
}

// ── スコア折れ線グラフ ───────────────────────────────────────────
function ScoreLineChart({ data, passScore }: { data: ScoreEntry[]; passScore: number | null }) {
  if (data.length < 2) {
    return (
      <p style={{ color: 'var(--color-text-light)', fontSize: 12, fontStyle: 'italic', margin: 0 }}>
        2日分以上のデータが貯まると表示されます
      </p>
    );
  }
  const W = 300, H = 100, PL = 36, PR = 8, PT = 10, PB = 22;
  const iW = W - PL - PR, iH = H - PT - PB;
  const scores = data.map(d => d.score);
  const minS = Math.max(0, Math.min(...scores) - 50);
  const maxS = Math.min(1000, Math.max(...scores) + 50);
  const range = maxS - minS || 200;
  const cx = (i: number) => PL + (i / (data.length - 1)) * iW;
  const cy = (s: number) => PT + iH - ((s - minS) / range) * iH;
  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${cy(d.score).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      {[minS, maxS].map((s, i) => (
        <text key={i} x={PL - 4} y={i === 0 ? PT + iH + 4 : PT + 4} fontSize={9} fill="var(--color-text-light)" textAnchor="end">{s}</text>
      ))}
      {passScore !== null && passScore >= minS && passScore <= maxS && (
        <>
          <line
            x1={PL} x2={PL + iW} y1={cy(passScore)} y2={cy(passScore)}
            stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3"
          />
          <text x={PL + iW + 2} y={cy(passScore) + 3} fontSize={8} fill="#f59e0b" fontWeight="bold">合格</text>
        </>
      )}
      <path d={pathD} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={cx(i)} cy={cy(d.score)} r={3} fill="var(--color-primary)" />
      ))}
      <text x={cx(0)} y={H - 2} fontSize={9} fill="var(--color-text-light)" textAnchor="middle">{data[0].date.slice(5)}</text>
      <text x={cx(data.length - 1)} y={H - 2} fontSize={9} fill="var(--color-text-light)" textAnchor="middle">{data[data.length - 1].date.slice(5)}</text>
    </svg>
  );
}

// ── 予想スコア詳細モーダル ──────────────────────────────────────
function ScoreDetailModal({ targetExam, estimatedScore, passScore, lang, onClose }: {
  targetExam: string; estimatedScore: number | null; passScore: number | null; lang: string; onClose: () => void;
}) {
  const ja = lang === 'ja';
  const [showTip, setShowTip] = useState(false);
  const history = readScoreHistory(targetExam);
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '20px 24px', width: '100%', maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
            {ja ? '予想スコア詳細' : 'Score Detail'}
          </span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '-1px' }}>{estimatedScore ?? '—'}</span>
          <span style={{ fontSize: 13, color: 'var(--color-text-light)', marginLeft: 6 }}>/1000</span>
          {passScore !== null && (
            <span style={{ fontSize: 11, color: 'var(--color-text-light)', marginLeft: 10 }}>
              {ja ? `合格ライン: ${passScore}` : `Pass: ${passScore}`}
            </span>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 10 }}>
            {ja ? 'スコア推移' : 'Score History'}
          </div>
          <ScoreLineChart data={history} passScore={passScore} />
        </div>

        <div style={{ background: 'var(--color-bg-main)', borderRadius: 8, padding: '8px 12px' }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setShowTip(v => !v)}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub)' }}>
              {ja ? '計算方法' : 'How calculated'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-light)' }}>{showTip ? '▲' : '▼'}</span>
          </div>
          {showTip && (
            <p style={{ fontSize: 11, color: 'var(--color-text-sub)', margin: '8px 0 0', lineHeight: 1.7 }}>
              {ja
                ? '各ドメインの直近10セッション分の正答率 × 出題比率を合計して算出。未演習ドメインは0点扱い（スコアを過大評価しない）。スコア = Σ(正答率 × 出題比率%) × 1000'
                : "Sum of each domain's (accuracy × exam weight%). Unpracticed domains count as 0. Score = Σ(accuracy × domain_weight%) × 1000"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ドメイン別詳細モーダル ──────────────────────────────────────
function DomainDetailModal({ targetExam, domainAccList, lang, onClose }: {
  targetExam: string; domainAccList: { correct: number; total: number; pct: number | null }[]; lang: string; onClose: () => void;
}) {
  const ja = lang === 'ja';
  const domains = EXAM_DOMAINS[targetExam] ?? [];
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '20px 24px', width: '100%', maxWidth: 480, maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
            {ja ? 'ドメイン別成績' : 'Domain Results'}
          </span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>
        {domains.map((d, i) => {
          const { correct, total, pct } = domainAccList[i] ?? { correct: 0, total: 0, pct: null };
          const label = lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;
          return (
            <div key={d} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < domains.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', flexShrink: 0 }}>D{i + 1}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-main)', lineHeight: 1.4 }}>{label}</span>
              </div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 8 }}>
                {[
                  { label: ja ? '演習数' : 'Total', value: total, color: 'var(--color-text-main)' },
                  { label: ja ? '正解数' : 'Correct', value: correct, color: 'var(--color-success)' },
                  { label: ja ? '正答率' : 'Accuracy', value: pct !== null ? `${pct}%` : '—', color: 'var(--color-primary)' },
                ].map(({ label: l, value, color }) => (
                  <div key={l}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-light)', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                  </div>
                ))}
              </div>
              {pct !== null && (
                <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--bar-gradient-primary)' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 日めくりAWSサービス ─────────────────────────────────────────
type DailyService = {
  serviceId: string; name: string; shortName?: string; category?: string;
  icon: string; description: string; trivia?: string; docUrl?: string;
};

function TodayServiceSection({ lang }: { lang: string }) {
  const [service, setService] = useState<DailyService | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cacheKey = `daily_service_${jstDate}`;
    const cached = getCached<DailyService>(cacheKey);
    if (cached !== null) { setService(cached); setLoading(false); return; }
    fetch(`${API_ENDPOINT}/daily-service`)
      .then(r => r.json())
      .then(d => { const s = d.service ?? null; if (s) setCached(cacheKey, s, 60 * 60 * 1000); setService(s); })
      .catch(() => setService(null))
      .finally(() => setLoading(false));
  }, []);

  const calIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
      <path d="M3 20a2 2 0 0 0 2 2h10a2.4 2.4 0 0 0 1.706-.706l3.588-3.588A2.4 2.4 0 0 0 21 16V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/>
      <path d="M15 22v-5a1 1 0 0 1 1-1h5"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/>
    </svg>
  );

  if (loading) return (
    <Card padding="var(--spacing-md)" style={{ marginBottom: 'var(--spacing-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="skeleton" style={{ width: 13, height: 13, borderRadius: 2 }} />
        <div className="skeleton" style={{ width: 120, height: 14, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
        <div className="skeleton" style={{ width: '45%', height: 18, borderRadius: 4 }} />
      </div>
      <div className="skeleton" style={{ width: '100%', height: 13, borderRadius: 4, marginBottom: 5 }} />
      <div className="skeleton" style={{ width: '85%', height: 13, borderRadius: 4 }} />
    </Card>
  );

  if (!service) return null;

  const iconEl = service.icon.startsWith('/') || service.icon.startsWith('http')
    ? <img src={service.icon} alt={service.name} style={{ width: 28, height: 28, objectFit: 'contain' }} />
    : isServiceIconKey(service.icon)
      ? <ServiceIcon name={service.icon} size={24} />
      : <span style={{ fontSize: 22 }}>{service.icon}</span>;

  return (
    <Card padding="var(--spacing-md)" style={{ marginBottom: 'var(--spacing-md)' }}>
      {/* ヘッダー行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {calIcon}
        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
          {lang === 'ja' ? '日めくりAWSサービス' : 'Daily AWS Service'}
        </span>
        {service.category && (
          <span style={{ marginLeft: 2, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--border-radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            {service.category}
          </span>
        )}
      </div>

      {/* アイコン＋名前 横並び */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {iconEl}
        </div>
        <div>
          <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-text-main)' }}>{service.name}</span>
          {service.shortName && (
            <span style={{ marginLeft: 8, fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-light)', background: 'var(--color-bg-main)', borderRadius: 4, padding: '1px 6px' }}>
              {service.shortName}
            </span>
          )}
        </div>
      </div>

      {/* 説明文: アイコン行の下から全幅 */}
      <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.7 }}>
        {service.description}
      </p>

      {service.trivia && (
        <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
          <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', flexShrink: 0 }}><IconLightbulb size={14} /></span>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>{service.trivia}</span>
        </div>
      )}

      {service.docUrl && (
        <a href={service.docUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
          {lang === 'ja' ? '公式ページを見る →' : 'Official page →'}
        </a>
      )}
    </Card>
  );
}

// ── メインコンポーネント ────────────────────────────────────────
const QUICK_PREFS_KEY = 'quickExercisePrefs';
function loadQuickPrefs() {
  try { return JSON.parse(localStorage.getItem(QUICK_PREFS_KEY) ?? '{}'); } catch { return {}; }
}
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const CHEVRON_BTN: React.CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer',
  color: 'var(--color-text-light)', fontSize: 20, lineHeight: 1,
  padding: '0 2px', display: 'flex', alignItems: 'center',
  transition: 'color 0.15s',
};

export default function Home() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const ja = lang === 'ja';

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem('targetExam'));
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);

  // サクッと演習ドラフト（24時間以内のquickセッションのみ）
  const readQuickDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem('exerciseDraft') ?? 'null');
      if (!d?.isQuick || !d?.savedAt || Date.now() - d.savedAt > 24 * 3600 * 1000) return null;
      return d;
    } catch { return null; }
  };
  const [quickDraft, setQuickDraft] = useState<any>(() => readQuickDraft());
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState<Record<string, any>>({});
  const [showScoreDetail, setShowScoreDetail] = useState(false);
  const [showDomainDetail, setShowDomainDetail] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setTargetExam((e as CustomEvent).detail);
    window.addEventListener('targetExamChanged', handler);
    return () => window.removeEventListener('targetExamChanged', handler);
  }, []);

  // ── 成績フェッチ（stale-while-revalidate） ─────────────────────────
  const TS_KEY = (uid: string) => `_ts_ustats_${uid}`;

  const doFetchStats = useCallback(async (userId: string, background: boolean, delayMs = 0) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (background) setStatsRefreshing(true); else setStatsLoading(true);
    try {
      if (delayMs > 0) {
        await new Promise<void>((res, rej) => {
          const t = setTimeout(res, delayMs);
          ctrl.signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); });
        });
      }
      const r = await fetch(`${API_ENDPOINT}/users/me/stats?userId=${userId}`, { signal: ctrl.signal });
      const d = await r.json();
      const stats: DomainStat[] = d.stats ?? [];
      setCached(`ustats_${userId}`, stats, DEFAULT_TTL);
      sessionStorage.setItem(TS_KEY(userId), String(Date.now()));
      setDomainStats(stats);
      setLastUpdated(new Date());
    } catch { /* abort or network error */ }
    finally {
      if (!ctrl.signal.aborted) { setStatsLoading(false); setStatsRefreshing(false); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshStats = useCallback(() => {
    if (!user || statsLoading || statsRefreshing) return;
    deleteCached(`ustats_${user.userId}`);
    sessionStorage.removeItem(TS_KEY(user.userId));
    doFetchStats(user.userId, false);
  }, [user, statsLoading, statsRefreshing, doFetchStats]);

  useEffect(() => {
    if (!user) { setDomainStats([]); setLastUpdated(null); return; }
    const cached = getCached<DomainStat[]>(`ustats_${user.userId}`);
    const tsRaw = sessionStorage.getItem(TS_KEY(user.userId));
    if (tsRaw) setLastUpdated(new Date(parseInt(tsRaw)));

    if (cached !== null) {
      setDomainStats(cached);
      // キャッシュがあっても常にバックグラウンドで最新化
      doFetchStats(user.userId, true);
    } else {
      // キャッシュなし：セッション完了直後かチェックして遅延
      const flagRaw = localStorage.getItem('postSessionRefresh');
      let delay = 0;
      if (flagRaw) {
        localStorage.removeItem('postSessionRefresh');
        const age = Date.now() - parseInt(flagRaw);
        if (age < 30000) delay = 1500; // 30秒以内なら1.5秒待つ
      }
      doFetchStats(user.userId, false, delay);
    }
    return () => { abortRef.current?.abort(); };
  }, [user, doFetchStats]);

  // ── 予想スコア計算（直近10セッション優先、ドメインごとにAPIフォールバック） ──
  const estimatedScore = useMemo(() => {
    if (!targetExam) return null;
    const domainList = EXAM_DOMAINS[targetExam] ?? [];
    const weights = DOMAIN_WEIGHTS[targetExam] ?? domainList.map(() => 100 / domainList.length);
    const totalAllWeights = weights.reduce((s, w) => s + w, 0);
    if (totalAllWeights === 0) return null;
    const hist = readDomainHistory(targetExam);

    let weightedSum = 0, hasAnyData = false;
    for (let i = 0; i < domainList.length; i++) {
      const sessions = hist[domainList[i]];
      if (sessions && sessions.length > 0) {
        // ローカル直近セッション優先
        const totalCorrect = sessions.reduce((s, r) => s + r.correct, 0);
        const totalAnswered = sessions.reduce((s, r) => s + r.total, 0);
        if (totalAnswered === 0) continue;
        weightedSum += (totalCorrect / totalAnswered) * weights[i];
        hasAnyData = true;
      } else {
        // ドメインごとに個別判定でAPIフォールバック
        const stat = domainStats.find(s => s.tagId === domainList[i]);
        if (!stat) continue;
        const total = (stat.correctCount ?? 0) + (stat.incorrectCount ?? 0);
        if (total === 0) continue;
        weightedSum += ((stat.correctCount ?? 0) / total) * weights[i];
        hasAnyData = true;
      }
    }
    if (!hasAnyData) return null;
    return Math.round((weightedSum / totalAllWeights) * 1000);
  }, [targetExam, domainStats]);

  const passScore = targetExam ? PASS_SCORES[targetExam] : null;

  // 前日比
  const jstDate = useMemo(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), []);
  const [prevScore, setPrevScore] = useState<number | null>(null);

  useEffect(() => {
    if (!targetExam || estimatedScore === null) { setPrevScore(null); return; }
    const todayKey = `score_today_${targetExam}`;
    const prevKey = `score_prev_${targetExam}`;
    const todayRaw = localStorage.getItem(todayKey);
    const todayData = todayRaw ? JSON.parse(todayRaw) as { date: string; score: number } : null;
    if (todayData && todayData.date !== jstDate && !localStorage.getItem(prevKey)) {
      localStorage.setItem(prevKey, String(todayData.score));
    }
    localStorage.setItem(todayKey, JSON.stringify({ date: jstDate, score: estimatedScore }));
    setPrevScore(localStorage.getItem(prevKey) ? parseInt(localStorage.getItem(prevKey)!, 10) : null);

    // スコア履歴に追記（折れ線グラフ用）
    const histKey = `score_history_${targetExam}`;
    let scoreHist: ScoreEntry[] = [];
    try { scoreHist = JSON.parse(localStorage.getItem(histKey) ?? '[]'); } catch {}
    const last = scoreHist[scoreHist.length - 1];
    if (last?.date === jstDate) { last.score = estimatedScore; }
    else { scoreHist.push({ date: jstDate, score: estimatedScore }); }
    localStorage.setItem(histKey, JSON.stringify(scoreHist.slice(-30)));
  }, [targetExam, estimatedScore, jstDate]);

  const scoreDelta = prevScore !== null && estimatedScore !== null ? estimatedScore - prevScore : null;

  // サクッと演習ドラフトから再開
  const hasQuickDraft = !!(quickDraft && quickDraft.examType === targetExam);

  const resumeQuickExercise = () => {
    if (!quickDraft) return;
    navigate('/exercise/session', {
      state: {
        sessionId: quickDraft.sessionId,
        questions: quickDraft.questions,
        userId: quickDraft.userId,
        examType: quickDraft.examType,
        mode: 'exercise',
        isQuick: true,
        resumeIndex: quickDraft.currentIndex,
        resumeResults: quickDraft.results,
        resumeAnswered: quickDraft.answered,
        resumeSelectedAnswers: quickDraft.selectedAnswers,
      }
    });
  };

  const discardQuickDraft = () => {
    localStorage.removeItem('exerciseDraft');
    setQuickDraft(null);
  };

  // サクッと演習
  const startQuickExercise = async () => {
    if (!targetExam) { alert(ja ? '試験を選択してください' : 'Please select an exam'); return; }
    discardQuickDraft();
    setQuickLoading(true);
    const qPrefs = loadQuickPrefs();
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true', withValidity: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      let items: any[] = (data.items ?? []).filter((q: any) => !!q.validityCheckedAt);
      if (user && (qPrefs.unansweredOnly || qPrefs.incorrectOnly || qPrefs.bookmarkOnly)) {
        const [answeredRes, incorrectRes, bkmRes] = await Promise.all([
          qPrefs.unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : null,
          qPrefs.incorrectOnly  ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : null,
          qPrefs.bookmarkOnly   ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : null,
        ]);
        if (qPrefs.unansweredOnly && answeredRes) { const s = new Set(answeredRes.questionIds ?? []); items = items.filter((q: any) => !s.has(q.questionId)); }
        if (qPrefs.incorrectOnly  && incorrectRes) { const s = new Set(incorrectRes.questionIds ?? []); items = items.filter((q: any) => s.has(q.questionId)); }
        if (qPrefs.bookmarkOnly   && bkmRes)       { const s = new Set(bkmRes.questionIds ?? []);      items = items.filter((q: any) => s.has(q.questionId)); }
      }
      items = shuffleArray(items).slice(0, qPrefs.questionCount ?? 5);
      if (items.length === 0) { alert(ja ? '条件に合う問題がありません' : 'No questions match the criteria'); return; }
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, mode: 'exercise', examType: targetExam, questionIds: items.map((q: any) => q.questionId) }) });
      const sessionData = await sessionRes.json();
      navigate('/exercise/session', { state: { sessionId: sessionData.sessionId, questions: items, userId, mode: 'exercise', examType: targetExam, isQuick: true } });
    } catch (err) { console.error(err); alert(ja ? '演習の開始に失敗しました' : 'Failed to start exercise'); }
    finally { setQuickLoading(false); }
  };

  // ドメイン別成績（表示用）— API累計統計を使用
  const domains = useMemo(() => targetExam ? (EXAM_DOMAINS[targetExam] ?? []) : [], [targetExam]);
  const domainAccList = useMemo(() => {
    if (!targetExam) return [] as { correct: number; total: number; pct: number | null }[];
    return domains.map(d => {
      const stat = domainStats.find(s => s.tagId === d);
      const correct = stat?.correctCount ?? 0;
      const total = correct + (stat?.incorrectCount ?? 0);
      return { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
    });
  }, [targetExam, domainStats, domains]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-lg) var(--spacing-lg)' }} className="page-container">

      {/* ── 成績セクションヘッダー ── */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
          {lastUpdated && !statsLoading && (
            <span style={{ fontSize: 10, color: 'var(--color-text-light)' }}>
              {(() => {
                const now = new Date();
                const hhmm = `${String(lastUpdated.getHours()).padStart(2, '0')}:${String(lastUpdated.getMinutes()).padStart(2, '0')}`;
                const sameDay = lastUpdated.toDateString() === now.toDateString();
                const label = ja ? '更新' : 'Updated';
                return `${label} ${sameDay ? hhmm : `${lastUpdated.getMonth() + 1}/${lastUpdated.getDate()} ${hhmm}`}`;
              })()}
            </span>
          )}
          <button
            onClick={refreshStats}
            disabled={statsLoading || statsRefreshing}
            title={ja ? '成績を更新' : 'Refresh stats'}
            style={{
              border: 'none', background: 'none',
              cursor: (statsLoading || statsRefreshing) ? 'default' : 'pointer',
              color: 'var(--color-text-light)', padding: '2px 4px', borderRadius: 4,
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 500,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (!statsLoading && !statsRefreshing) { e.currentTarget.style.color = 'var(--color-text-sub)'; } }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-light)'; }}
            aria-label={ja ? '成績を更新' : 'Refresh stats'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: (statsLoading || statsRefreshing) ? 'sherpa-spin 0.8s linear infinite' : 'none', flexShrink: 0 }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {ja ? '成績を更新' : 'Refresh'}
          </button>
        </div>
      )}

      {/* ── スコア + ドメイン (等幅2カラム on desktop, 1カラム on mobile) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>

        {/* 予想スコア */}
        <Card padding="var(--spacing-md)">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {ja ? '予想スコア' : 'Est. Score'}
            </span>
            {estimatedScore !== null && (
              <button
                style={CHEVRON_BTN}
                onClick={() => setShowScoreDetail(true)}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-sub)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-light)'}
                aria-label="詳細を見る"
              >›</button>
            )}
          </div>
          {!targetExam ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
              {ja ? '試験を選択してください' : 'Select an exam'}
            </div>
          ) : statsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 28, width: '55%', borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 7, width: '100%', borderRadius: 4 }} />
            </div>
          ) : estimatedScore === null ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
              {ja ? '演習データがありません' : 'No practice data yet'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '-0.5px' }}>{estimatedScore}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-light)' }}>/1000</span>
                {scoreDelta !== null && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: scoreDelta > 0 ? 'var(--color-success)' : scoreDelta < 0 ? 'var(--color-danger)' : 'var(--color-text-light)' }}>
                    {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta < 0 ? `${scoreDelta}` : '±0'}
                  </span>
                )}
              </div>
              <div style={{ position: 'relative', height: 7, background: 'var(--color-border)', borderRadius: 4, overflow: 'visible', marginTop: passScore !== null ? 18 : 0 }}>
                {passScore !== null && (
                  <div style={{ position: 'absolute', left: `${(passScore / 1000) * 100}%`, transform: 'translateX(-50%)', top: 0, bottom: 0, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* ラベルチップ（バーの上） */}
                    <div style={{ position: 'absolute', bottom: '100%', marginBottom: 3, background: '#f59e0b', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap', lineHeight: 1.5 }}>
                      {ja ? `合格 ${passScore}` : `Pass ${passScore}`}
                    </div>
                    {/* 縦線 */}
                    <div style={{ width: 2, height: '100%', background: '#f59e0b', borderRadius: 1 }} />
                  </div>
                )}
                <div style={{ width: `${Math.min(100, (estimatedScore / 1000) * 100)}%`, height: '100%', borderRadius: 4, background: 'var(--bar-gradient-primary)', transition: 'width 0.5s ease' }} />
              </div>
            </>
          )}
        </Card>

        {/* ドメイン別正答率 */}
        <Card padding="var(--spacing-md)">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {ja ? 'ドメイン別正答率' : 'Domain Accuracy'}
            </span>
            {targetExam && !statsLoading && (
              <button
                style={CHEVRON_BTN}
                onClick={() => setShowDomainDetail(true)}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-sub)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-light)'}
                aria-label="詳細を見る"
              >›</button>
            )}
          </div>
          {!targetExam ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
              {ja ? '試験を選択してください' : 'Select an exam'}
            </div>
          ) : statsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[65, 80, 50, 72, 60].map((w, i) => (
                <div key={i}><div className="skeleton" style={{ height: 12, width: `${w}%`, borderRadius: 3, marginBottom: 3 }} /><div className="skeleton" style={{ height: 5, width: '100%', borderRadius: 3 }} /></div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {domains.map((d, i) => {
                const pct = domainAccList[i]?.pct ?? null;
                const grade = getGrade(pct);
                const label = lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;
                return (
                  <div key={d}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-primary)', minWidth: 14, flexShrink: 0, textAlign: 'center' }}>{grade}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                      {pct !== null && <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--bar-gradient-primary)', transition: 'width 0.4s ease' }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── サクッと演習ボタン行（デスクトップ） ── */}
      {!isMobile && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-sm)', marginBottom: 8 }}>
            <Button variant="primary" fullWidth disabled={!targetExam || quickLoading} onClick={() => { if (hasQuickDraft) resumeQuickExercise(); else if (targetExam && !quickLoading) startQuickExercise(); }}>
              {quickLoading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                  {ja ? '準備中...' : 'Loading...'}
                </span>
              ) : hasQuickDraft ? (ja ? 'サクッと演習（続きから再開）' : 'Quick (Resume)') : (ja ? `サクッと演習 (${loadQuickPrefs().questionCount ?? 5}問)` : `Quick (${loadQuickPrefs().questionCount ?? 5}Q)`)}
            </Button>
            <Button variant="outline" fullWidth onClick={() => { setDraftPrefs({ ...loadQuickPrefs() }); setShowQuickModal(true); }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconSettings size={14} />{ja ? '設定' : 'Settings'}</span>
            </Button>
          </div>
          <Button variant="outline" fullWidth onClick={() => navigate('/practice')} style={{ marginBottom: 'var(--spacing-md)' }}>
            {ja ? 'トレーニング →' : 'Training →'}
          </Button>
        </>
      )}

      {/* ── サクッと演習ボタン（モバイル固定） ── */}
      {isMobile && (
        <>
          {/* プルアップパネル：新規で開始 */}
          {showNewPanel && (
            <>
              <div onClick={() => setShowNewPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 210 }} />
              <div style={{ position: 'fixed', bottom: 116, left: 0, right: 0, zIndex: 211, background: 'var(--color-bg-white)', borderRadius: '14px 14px 0 0', padding: '14px 12px 12px', boxShadow: '0 -4px 20px rgba(0,0,0,0.18)', animation: 'slideUp 0.22s ease' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', textAlign: 'center', marginBottom: 10 }}>
                  {ja ? '現在のセッションを破棄して新規開始します' : 'Discard current session and start new'}
                </div>
                <Button variant="primary" fullWidth style={{ height: 44 }} onClick={() => { setShowNewPanel(false); discardQuickDraft(); startQuickExercise(); }}>
                  {ja ? '新規で開始' : 'Start New'}
                </Button>
              </div>
            </>
          )}
          <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, background: 'var(--color-bg-white)', borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', gap: 6, boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}>
            <Button variant="primary" style={{ flex: 1, minWidth: 0, height: 44 }} disabled={!targetExam || quickLoading} onClick={() => { if (hasQuickDraft) resumeQuickExercise(); else if (targetExam && !quickLoading) startQuickExercise(); }}>
              {quickLoading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                  {ja ? '準備中...' : 'Loading...'}
                </span>
              ) : hasQuickDraft ? (ja ? 'サクッと演習（続きから）' : 'Quick (Resume)') : (ja ? 'サクッと演習' : 'Quick')}
            </Button>
            {hasQuickDraft && (
              <button
                onClick={() => setShowNewPanel(v => !v)}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: '1.5px solid var(--color-primary)', borderRadius: '50%', background: 'transparent', cursor: 'pointer', color: 'var(--color-primary)' }}
                aria-label={ja ? '新規で開始' : 'Start new'}
              >
                <IconChevronUp size={18} />
              </button>
            )}
            <button
              onClick={() => { setDraftPrefs({ ...loadQuickPrefs() }); setShowQuickModal(true); }}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: '1.5px solid var(--color-primary)', borderRadius: '50%', background: 'transparent', cursor: 'pointer', color: 'var(--color-primary)' }}
              aria-label={ja ? '設定' : 'Settings'}
            >
              <IconSettings size={18} />
            </button>
          </div>
        </>
      )}

      {/* ── 日めくりAWSサービス ── */}
      <TodayServiceSection lang={lang} />

      {/* ── 非ログイン時バナー ── */}
      {!user && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)', borderRadius: 'var(--border-radius-md)', padding: '10px var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
          <span style={{ lineHeight: 1.6 }}>{ja ? 'ログインすると演習・模試の結果が保存され、予想スコアが表示されます。' : 'Log in to save results and view your estimated score.'}</span>
          <Button variant="primary" size="sm" onClick={() => navigate('/login')} style={{ flexShrink: 0 }}>{ja ? 'ログイン →' : 'Log in →'}</Button>
        </div>
      )}

      {/* ── サクッと演習 設定モーダル ── */}
      {showQuickModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowQuickModal(false); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 24px 20px', width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                {ja ? 'サクッと演習 設定' : 'Quick Practice Settings'}
              </h3>
              <button onClick={() => setShowQuickModal(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>{ja ? '問題数' : 'Question Count'}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 2 }}>{ja ? '1〜20問' : '1–20'}</div>
                </div>
                <input
                  type="number" min={1} max={20}
                  value={draftPrefs.questionCount ?? 5}
                  onChange={e => setDraftPrefs(p => ({ ...p, questionCount: Math.min(20, Math.max(1, parseInt(e.target.value) || 5)) }))}
                  style={{ width: 64, padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', textAlign: 'center', outline: 'none', background: 'var(--color-bg-white)', color: 'var(--color-text-main)' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                />
              </div>
              {([
                ['unansweredOnly', ja ? '未回答のみ' : 'Unanswered Only', ja ? '一度も回答していない問題のみ出題' : 'Only questions not yet answered'],
                ['incorrectOnly',  ja ? '不正解のみ'  : 'Incorrect Only',  ja ? '過去に不正解だった問題のみ出題'   : 'Only previously incorrect questions'],
                ['bookmarkOnly',   ja ? 'ブックマークのみ' : 'Bookmarked Only', ja ? 'ブックマークした問題のみ出題'  : 'Only bookmarked questions'],
              ] as [string, string, string][]).map(([key, label, desc], i, arr) => {
                const on = !!(draftPrefs[key]);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>{label}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 2 }}>{desc}</div>
                    </div>
                    <button
                      onClick={() => setDraftPrefs(p => ({ ...p, [key]: !on }))}
                      aria-label={label}
                      style={{ display: 'inline-flex', alignItems: 'center', width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: on ? 'var(--color-primary)' : 'var(--color-border)', transition: 'background 0.2s', flexShrink: 0, position: 'relative', padding: 0 }}
                    >
                      <span style={{ position: 'absolute', width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', left: on ? 22 : 2, transition: 'left 0.2s' }} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 16 }}>
              {ja ? '※ AI確認済み問題のみが常に対象です' : '* AI-verified questions are always included'}
            </div>
            <Button
              onClick={() => { localStorage.setItem(QUICK_PREFS_KEY, JSON.stringify(draftPrefs)); setShowQuickModal(false); }}
              variant="primary" style={{ width: '100%' }}
            >
              {ja ? '保存する' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {/* モーダル類 */}
      {showScoreDetail && targetExam && (
        <ScoreDetailModal targetExam={targetExam} estimatedScore={estimatedScore} passScore={passScore} lang={lang} onClose={() => setShowScoreDetail(false)} />
      )}
      {showDomainDetail && targetExam && (
        <DomainDetailModal targetExam={targetExam} domainAccList={domainAccList} lang={lang} onClose={() => setShowDomainDetail(false)} />
      )}
    </div>
  );
}
