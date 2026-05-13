import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  API_ENDPOINT, EXAM_CONFIGS, EXAM_DOMAINS,
  DOMAIN_WEIGHTS, DOMAIN_NAME_EN, PASS_SCORES,
} from '../constants';
import { getCached, setCached, SHORT_TTL } from '../utils/cache';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { IconLightbulb, ServiceIcon, isServiceIconKey } from '../components/Icons';


type DomainStat = { tagId: string; correctCount?: number; incorrectCount?: number };

function DomainBarChart({ targetExam, domainStats, lang, onDomainClick }: {
  targetExam: string;
  domainStats: DomainStat[];
  lang: string;
  onDomainClick: (domain: string) => void;
}) {
  const domains = EXAM_DOMAINS[targetExam] ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {domains.map((d, i) => {
        const stat = domainStats.find(s => s.tagId === d);
        const total = (stat?.correctCount ?? 0) + (stat?.incorrectCount ?? 0);
        const acc = total > 0 ? (stat?.correctCount ?? 0) / total : null;
        const pct = acc !== null ? Math.round(acc * 100) : null;
        const label = lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;
        const barColor = pct === null ? 'var(--color-border)' : pct >= 70 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
        return (
          <div key={d} onClick={() => onDomainClick(d)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-light)', flexShrink: 0 }}>D{i + 1}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8, color: pct !== null ? barColor : 'var(--color-text-light)' }}>
                {pct !== null ? `${pct}%` : '—'}
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
              {pct !== null && (
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: barColor, transition: 'width 0.4s ease' }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DomainDetailModal({ domain, stat, lang, onClose }: {
  domain: string;
  stat: DomainStat | undefined;
  lang: string;
  onClose: () => void;
}) {
  const ja = lang === 'ja';
  const correct = stat?.correctCount ?? 0;
  const incorrect = stat?.incorrectCount ?? 0;
  const total = correct + incorrect;
  const pct = total > 0 ? Math.round((correct / total) * 100) : null;
  const barColor = pct === null ? 'var(--color-border)' : pct >= 70 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
  const label = lang === 'en' ? (DOMAIN_NAME_EN[domain] ?? domain) : domain;
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '20px 24px', width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)', lineHeight: 1.4, flex: 1, marginRight: 12 }}>
            {label}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          {[
            { label: ja ? '正解' : 'Correct', value: correct, color: 'var(--color-success)' },
            { label: ja ? '不正解' : 'Wrong', value: incorrect, color: 'var(--color-danger)' },
            { label: ja ? '合計' : 'Total', value: total, color: 'var(--color-text-main)' },
          ].map(({ label: l, value, color }) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: 'var(--color-text-light)', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>
        {pct !== null ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{ja ? '正答率' : 'Accuracy'}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: barColor }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: barColor }} />
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
            {ja ? 'まだデータがありません' : 'No data yet'}
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
            style={{ flex: 1 }}
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
  docUrl?: string;
};

function TodayServiceSection({ lang }: { lang: string }) {
  const [service, setService] = useState<DailyService | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cacheKey = `daily_service_${jstDate}`;
    const cached = getCached<DailyService>(`${cacheKey}`);
    if (cached !== null) { setService(cached); setLoading(false); return; }
    fetch(`${API_ENDPOINT}/daily-service`)
      .then(r => r.json())
      .then(d => {
        const s = d.service ?? null;
        if (s) setCached(cacheKey, s, 60 * 60 * 1000);
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
    <Card padding="var(--spacing-md)" style={{ marginBottom: 'var(--spacing-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
          <path d="M3 20a2 2 0 0 0 2 2h10a2.4 2.4 0 0 0 1.706-.706l3.588-3.588A2.4 2.4 0 0 0 21 16V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/>
          <path d="M15 22v-5a1 1 0 0 1 1-1h5"/>
          <path d="M8 2v4"/>
          <path d="M16 2v4"/>
          <path d="M3 10h18"/>
        </svg>
        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
          {lang === 'ja' ? '日めくりAWSサービス' : "Daily AWS Service"}
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
          fontSize: 28, overflow: 'hidden',
        }}>
          {service.icon.startsWith('/') || service.icon.startsWith('http')
            ? <img src={service.icon} alt={service.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
            : isServiceIconKey(service.icon)
              ? <ServiceIcon name={service.icon} size={32} />
              : service.icon}
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
              marginBottom: 10,
            }}>
              <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}><IconLightbulb size={14} /></span>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
                {service.trivia}
              </span>
            </div>
          )}

          {/* 公式ページリンク */}
          {service.docUrl && (
            <a
              href={service.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}
            >
              {lang === 'ja' ? '公式ページを見る →' : 'Official page →'}
            </a>
          )}
        </div>
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

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // サイドバー/ヘッダーからの試験変更イベント
  useEffect(() => {
    const handler = (e: Event) => setTargetExam((e as CustomEvent).detail);
    window.addEventListener('targetExamChanged', handler);
    return () => window.removeEventListener('targetExamChanged', handler);
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
  const scoreColor = estimatedScore === null ? 'var(--color-text-light)' : 'var(--color-primary)';

  // 前日比スコア
  // score_today_${exam}: { date, score } — 当日スコア（毎回上書き）
  // score_prev_${exam}: number           — 直前の別日スコア（日付が変わった時に昇格、以降永続）
  const jstDate = useMemo(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), []);
  const [prevScore, setPrevScore] = useState<number | null>(null);

  useEffect(() => {
    if (!targetExam || estimatedScore === null) { setPrevScore(null); return; }

    const todayKey = `score_today_${targetExam}`;
    const prevKey  = `score_prev_${targetExam}`;

    const todayRaw  = localStorage.getItem(todayKey);
    const todayData = todayRaw ? JSON.parse(todayRaw) as { date: string; score: number } : null;

    // 日付が変わっていたら前日スコアとして昇格（一度昇格したら上書きしない）
    if (todayData && todayData.date !== jstDate && !localStorage.getItem(prevKey)) {
      localStorage.setItem(prevKey, String(todayData.score));
    }

    localStorage.setItem(todayKey, JSON.stringify({ date: jstDate, score: estimatedScore }));

    const prevRaw = localStorage.getItem(prevKey);
    setPrevScore(prevRaw ? parseInt(prevRaw, 10) : null);
  }, [targetExam, estimatedScore, jstDate]);

  const scoreDelta = prevScore !== null && estimatedScore !== null ? estimatedScore - prevScore : null;

  // サクッと演習開始
  const startQuickExercise = async () => {
    if (!targetExam) {
      alert(ja ? '試験を選択してください' : 'Please select an exam');
      return;
    }
    setQuickLoading(true);
    const qPrefs = loadQuickPrefs();
    const qCount = qPrefs.questionCount ?? 5;
    const qUnanswered = qPrefs.unansweredOnly ?? false;
    const qIncorrect = qPrefs.incorrectOnly ?? false;
    const qBookmark = qPrefs.bookmarkOnly ?? false;
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true', withValidity: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      let items: any[] = data.items ?? [];
      items = items.filter((q: any) => !!q.validityCheckedAt);
      if (user && (qUnanswered || qIncorrect || qBookmark)) {
        const [answeredRes, incorrectRes, bkmRes] = await Promise.all([
          qUnanswered ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : null,
          qIncorrect  ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : null,
          qBookmark   ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : null,
        ]);
        if (qUnanswered && answeredRes) {
          const answered = new Set(answeredRes.questionIds ?? []);
          items = items.filter((q: any) => !answered.has(q.questionId));
        }
        if (qIncorrect && incorrectRes) {
          const incorrect = new Set(incorrectRes.questionIds ?? []);
          items = items.filter((q: any) => incorrect.has(q.questionId));
        }
        if (qBookmark && bkmRes) {
          const bookmarks = new Set(bkmRes.questionIds ?? []);
          items = items.filter((q: any) => bookmarks.has(q.questionId));
        }
      }
      items = shuffleArray(items).slice(0, qCount);
      if (items.length === 0) {
        alert(ja ? '条件に合う問題がありません' : 'No questions match the criteria');
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
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true', withValidity: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      let items: any[] = data.items ?? [];
      items = items.filter((q: any) => !!q.validityCheckedAt);
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

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-lg) var(--spacing-lg)' }} className="page-container">

      {/* ── 一段目: 予想点数 + ドメイン横棒グラフ ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
        {/* 予想点数 */}
        <Card padding="var(--spacing-md)">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            {ja ? '予想スコア' : 'Est. Score'}
          </div>
          {!targetExam ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
              {ja ? '試験を選択してください' : 'Select an exam'}
            </div>
          ) : statsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 36, width: '60%', borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 6, width: '100%', borderRadius: 4 }} />
            </div>
          ) : estimatedScore === null ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
              {ja ? '演習データがありません' : 'No practice data yet'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: scoreColor, lineHeight: 1, letterSpacing: '-1px' }}>
                  {estimatedScore}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-light)' }}>/ 1000</span>
                  {scoreDelta !== null && (
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: scoreDelta > 0 ? 'var(--color-success)' : scoreDelta < 0 ? 'var(--color-danger)' : 'var(--color-text-light)',
                    }}>
                      {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta === 0 ? '±0' : `${scoreDelta}`}
                    </span>
                  )}
                </div>
              </div>
              {passScore !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <div style={{ flex: 1, background: 'var(--color-bg-main)', borderRadius: 10, height: 5, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, (estimatedScore / 1000) * 100)}%`, height: '100%',
                      borderRadius: 10, background: scoreColor,
                    }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--color-text-light)', flexShrink: 0 }}>
                    {ja ? `合格 ${passScore}` : `Pass: ${passScore}`}
                  </span>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ドメイン横棒グラフ */}
        <Card padding="var(--spacing-md)">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            {ja ? 'ドメイン別成績' : 'Domain Results'}
          </div>
          {!targetExam ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
              {ja ? '試験を選択してください' : 'Select an exam'}
            </div>
          ) : statsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[70, 55, 80, 40, 65].map((w, i) => (
                <div key={i} className="skeleton" style={{ height: 14, width: `${w}%`, borderRadius: 4 }} />
              ))}
            </div>
          ) : (
            <DomainBarChart targetExam={targetExam} domainStats={domainStats} lang={lang} onDomainClick={d => setSelectedDomain(d)} />
          )}
        </Card>
      </div>

      {/* ── 演習・模試ボタン行（デスクトップ） ── */}
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
          <Button
            variant="primary"
            fullWidth
            disabled={!targetExam || quickLoading}
            onClick={() => { if (targetExam && !quickLoading) startQuickExercise(); }}
          >
            {quickLoading ? (ja ? '準備中...' : 'Loading...') : (ja ? `サクッと演習 (${loadQuickPrefs().questionCount ?? 5}問)` : `Quick (${loadQuickPrefs().questionCount ?? 5}Q)`)}
          </Button>
          <Button variant="outline" fullWidth style={{ whiteSpace: 'nowrap' }} onClick={() => navigate('/exercise/setup')}>
            {ja ? 'カスタム演習' : 'Custom'}
          </Button>
          <Button
            variant="outline"
            fullWidth
            disabled={!targetExam}
            onClick={() => { if (targetExam) setShowExamConfirm(true); }}
            style={{ gridColumn: '1 / -1' }}
          >
            {ja ? '模試' : 'Mock Exam'}
          </Button>
        </div>
      )}

      {/* ── 演習・模試ボタン行（モバイル: タブバー上部に固定） ── */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150,
          background: 'var(--color-bg-white)',
          borderTop: '1px solid var(--color-border)',
          padding: '8px 12px',
          display: 'flex', gap: 6,
          boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
        }}>
          <Button
            variant="primary"
            style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            disabled={!targetExam || quickLoading}
            onClick={() => { if (targetExam && !quickLoading) startQuickExercise(); }}
          >
            {quickLoading ? (ja ? '準備中...' : 'Loading...') : (ja ? `サクッと演習` : `Quick`)}
          </Button>
          <Button
            variant="outline"
            style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
            onClick={() => navigate('/exercise/setup')}
          >
            {ja ? 'カスタム演習' : 'Custom'}
          </Button>
          <Button
            variant="outline"
            style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
            disabled={!targetExam}
            onClick={() => { if (targetExam) setShowExamConfirm(true); }}
          >
            {ja ? '模試' : 'Mock Exam'}
          </Button>
        </div>
      )}

      {/* ── 三.五段目: 今日のサービス ── */}
      <TodayServiceSection lang={lang} />

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

      {/* ドメイン詳細モーダル */}
      {selectedDomain && targetExam && (
        <DomainDetailModal
          domain={selectedDomain}
          stat={domainStats.find(s => s.tagId === selectedDomain)}
          lang={lang}
          onClose={() => setSelectedDomain(null)}
        />
      )}
    </div>
  );
}
