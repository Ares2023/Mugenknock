import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { IconLightbulb, IconSettings, IconChevronUp, IconLock, ServiceIcon, isServiceIconKey } from '../components/Icons';

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
  const W = 300, H = 110, PL = 36, PR = 8, PT = 20, PB = 22;
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
        <g key={i}>
          <text x={cx(i)} y={cy(d.score) - 6} fontSize={8} fill="var(--color-primary)" textAnchor="middle" fontWeight="bold">{d.score}</text>
          <circle cx={cx(i)} cy={cy(d.score)} r={3} fill="var(--color-primary)" />
        </g>
      ))}
      <text x={cx(0)} y={H - 2} fontSize={9} fill="var(--color-text-light)" textAnchor="middle">{data[0].date.slice(5)}</text>
      <text x={cx(data.length - 1)} y={H - 2} fontSize={9} fill="var(--color-text-light)" textAnchor="middle">{data[data.length - 1].date.slice(5)}</text>
    </svg>
  );
}

// ── 成績詳細モーダル（ドメイン別 + 予想スコア 統合） ───────────
function CombinedDetailModal({ targetExam, domainAccList, estimatedScore, passScore, lang, isMobile, onClose }: {
  targetExam: string;
  domainAccList: { correct: number; total: number; pct: number | null }[];
  estimatedScore: number | null;
  passScore: number | null;
  lang: string;
  isMobile: boolean;
  onClose: () => void;
}) {
  const ja = lang === 'ja';
  const domains = EXAM_DOMAINS[targetExam] ?? [];
  const history = readScoreHistory(targetExam);
  const domainHistory = readDomainHistory(targetExam);
  const [tab, setTab] = useState<'domain' | 'score'>('domain');
  const [showCalc, setShowCalc] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const domainSection = (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {ja ? 'ドメイン別成績' : 'Domain Accuracy'}
      </div>
      {domains.map((d, i) => {
        const { pct } = domainAccList[i] ?? { correct: 0, total: 0, pct: null };
        const sessions = domainHistory[d] ?? [];
        const sessionCount = sessions.length;
        const sessionCorrect = sessionCount > 0 && pct !== null ? Math.round(pct / 100 * sessionCount) : null;
        const label = lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;
        return (
          <div key={d} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < domains.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', flexShrink: 0 }}>D{i + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-main)', lineHeight: 1.4 }}>{label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '-0.5px' }}>
                {sessionCorrect !== null ? sessionCorrect : '—'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>
                / {sessionCount > 0 ? sessionCount : '—'}
              </span>
              {pct !== null && (
                <span style={{ fontSize: 11, color: 'var(--color-text-sub)', marginLeft: 4 }}>({pct}%)</span>
              )}
            </div>
            {pct !== null && (
              <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--bar-gradient-primary)', transformOrigin: 'left center', animation: `growWidth 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 40}ms both` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const scoreSection = (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {ja ? '予想スコア' : 'Estimated Score'}
      </div>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '-1px' }}>{estimatedScore ?? '—'}</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-light)', marginLeft: 6 }}>/1000</span>
        {passScore !== null && (
          <span style={{ fontSize: 11, color: 'var(--color-text-light)', marginLeft: 10 }}>
            {ja ? `合格ライン: ${passScore}` : `Pass: ${passScore}`}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 10 }}>
        {ja ? 'スコア推移' : 'Score History'}
      </div>
      <ScoreLineChart data={history} passScore={passScore} />
    </div>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: isMobile ? '16px' : '20px 28px', width: '100%', maxWidth: 540, maxHeight: isMobile ? '82vh' : '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showCalc ? 8 : (isMobile ? 12 : 16) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
              {ja ? '成績詳細' : 'Performance Detail'}
            </span>
            <button
              onClick={() => setShowCalc(v => !v)}
              style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${showCalc ? 'var(--color-primary)' : 'var(--color-border)'}`, background: showCalc ? 'var(--color-primary)' : 'transparent', color: showCalc ? '#fff' : 'var(--color-text-light)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}
              aria-label={ja ? '計算方法' : 'How calculated'}
            >?</button>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>
        {showCalc && (
          <div style={{ background: 'var(--color-bg-main)', borderRadius: 8, padding: '10px 12px', marginBottom: isMobile ? 12 : 16, fontSize: 11, color: 'var(--color-text-sub)', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{ja ? 'ドメイン別正答率' : 'Domain Accuracy'}</div>
            <p style={{ margin: '0 0 10px' }}>
              {ja
                ? '直近10セッション分のドメインごとの正答数・回答数を合算して算出。未演習ドメインはデータなし扱い。'
                : 'Sum of correct/total answers per domain across the last 10 sessions. Unpracticed domains show no data.'}
            </p>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{ja ? '予想スコア' : 'Estimated Score'}</div>
            <p style={{ margin: 0 }}>
              {ja
                ? '直近10セッション分の回答を集計。各ドメインの上限10問分で算出（10問未満は正答率×(N/10)で計算）。未演習ドメインは0点扱い。スコア = Σ(正答率 × N/10 × 出題比率%) × 1000'
                : 'Based on last 10 sessions. Score = Σ(accuracy × min(N,10)/10 × domain_weight%) × 1000. Fewer than 10 answers reduces the max contribution. Unpracticed domains count as 0.'}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: 16 }}>
          {(['domain', 'score'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', fontSize: 12, fontWeight: tab === t ? 700 : 400, color: tab === t ? 'var(--color-primary)' : 'var(--color-text-sub)', borderBottom: `2px solid ${tab === t ? 'var(--color-primary)' : 'transparent'}`, marginBottom: -2, transition: 'color 0.15s' }}
            >
              {t === 'domain' ? (ja ? 'ドメイン別正答率' : 'Domain Accuracy') : (ja ? '予想スコア' : 'Est. Score')}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ visibility: tab === 'domain' ? 'visible' : 'hidden' }}>
            {domainSection}
          </div>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, visibility: tab === 'score' ? 'visible' : 'hidden', pointerEvents: tab === 'score' ? 'auto' : 'none' }}>
            {scoreSection}
          </div>
        </div>
      </div>
    </div>
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
                ? '直近10セッション分の回答を集計。各ドメインの上限10問分で算出（10問未満は正答率×(N/10)で計算）。未演習は0点扱い。スコア = Σ(正答率 × N/10 × 出題比率%) × 1000'
                : 'Based on last 10 sessions. Score = Σ(accuracy × min(N,10)/10 × domain_weight%) × 1000. <10 answers reduces max contribution. Unpracticed domains = 0.'}
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
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--bar-gradient-primary)', transformOrigin: 'left center', animation: `growWidth 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 40}ms both` }} />
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

function saveToEncyclopedia(svc: DailyService) {
  try {
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const stored = JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}');
    stored[svc.serviceId] = svc;
    localStorage.setItem('encyclopediaServices', JSON.stringify(stored));

    // 今日のサービスを常に encyclopediaUnlocked に記録（日付チェックでスキップしない）
    const unlocked = JSON.parse(localStorage.getItem('encyclopediaUnlocked') ?? '{}');
    if (!(svc.serviceId in unlocked)) {
      unlocked[svc.serviceId] = jstDate;
      localStorage.setItem('encyclopediaUnlocked', JSON.stringify(unlocked));
    }

    // 今日の初回解放日時を記録
    if (localStorage.getItem('encyclopediaUnlockDate') !== jstDate) {
      localStorage.setItem('encyclopediaUnlockDate', jstDate);
    }

    localStorage.setItem('encyclopediaTodayServiceId', svc.serviceId);

    // 図鑑が開かれていれば状態を即時更新させる
    window.dispatchEvent(new CustomEvent('encyclopediaUpdated'));
  } catch {}
}

function syncEncyclopediaToServer(userId: string): void {
  try {
    const local: Record<string, string> = JSON.parse(localStorage.getItem('encyclopediaUnlocked') ?? '{}');
    const unlockDate = localStorage.getItem('encyclopediaUnlockDate');
    const todayServiceId = localStorage.getItem('encyclopediaTodayServiceId');
    fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks?userId=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : { unlocks: {} })
      .then(data => {
        const server: Record<string, string> = data.unlocks ?? {};
        const merged: Record<string, string> = { ...server, ...local };
        localStorage.setItem('encyclopediaUnlocked', JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent('encyclopediaUpdated'));
        return fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, unlocks: merged, unlockDate, todayServiceId }),
        });
      })
      .catch(() => {});
  } catch {}
}

function TodayServiceSection({ lang, userId, onNavigateEncyclopedia }: { lang: string; userId?: string; onNavigateEncyclopedia: () => void }) {
  const [service, setService] = useState<DailyService | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cacheKey = `daily_service_${jstDate}`;
    const cached = getCached<DailyService>(cacheKey);
    if (cached !== null) {
      setService(cached); setLoading(false);
      saveToEncyclopedia(cached);
      if (userId) syncEncyclopediaToServer(userId);
      return;
    }
    fetch(`${API_ENDPOINT}/daily-service`)
      .then(r => r.json())
      .then(d => {
        const s = d.service ?? null;
        if (s) {
          setCached(cacheKey, s, 60 * 60 * 1000);
          saveToEncyclopedia(s);
          if (userId) syncEncyclopediaToServer(userId);
        }
        setService(s);
      })
      .catch(() => setService(null))
      .finally(() => setLoading(false));
  }, [userId]);

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
    ? <img src={service.icon} alt={service.name} style={{ width: 44, height: 44, objectFit: 'contain' }} />
    : isServiceIconKey(service.icon)
      ? <ServiceIcon name={service.icon} size={44} />
      : <span style={{ fontSize: 38, lineHeight: 1 }}>{service.icon}</span>;

  return (
    <Card padding="var(--spacing-md)" style={{ marginBottom: 'var(--spacing-md)', cursor: 'pointer' }} onClick={onNavigateEncyclopedia}>
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
        <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {iconEl}
        </div>
        <div>
          <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-text-main)' }}>{service.name}</span>
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
        <a href={service.docUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
          {lang === 'ja' ? '公式ページを見る →' : 'Official page →'}
        </a>
      )}
    </Card>
  );
}

// ── メインコンポーネント ────────────────────────────────────────
const QUICK_PREFS_KEY = 'quickExercisePrefs';
const FOCUSED_UNLOCK_THRESHOLD = 30;
function loadQuickPrefs() {
  try { return JSON.parse(localStorage.getItem(QUICK_PREFS_KEY) ?? '{}'); } catch { return {}; }
}
const FOCUSED_PREFS_KEY = 'focusedExercisePrefs';
function loadFocusedPrefs() {
  try { return JSON.parse(localStorage.getItem(FOCUSED_PREFS_KEY) ?? '{}'); } catch { return {}; }
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

  const readQuickDraft = () => {
    try { return JSON.parse(localStorage.getItem('quickExerciseDraft') ?? 'null'); } catch { return null; }
  };
  const readFocusedDraft = () => {
    try { return JSON.parse(localStorage.getItem('focusedExerciseDraft') ?? 'null'); } catch { return null; }
  };
  const [quickDraft, setQuickDraft] = useState<any>(() => readQuickDraft());
  const [focusedDraft, setFocusedDraft] = useState<any>(() => readFocusedDraft());
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [showWebQuickMenu, setShowWebQuickMenu] = useState(false);
  const [showFocusedMenu, setShowFocusedMenu] = useState(false);
  const [focusedLoading, setFocusedLoading] = useState(false);
  const [lastMode, setLastMode] = useState<'quick' | 'focused'>(() => (localStorage.getItem('lastQuickMode') as 'quick' | 'focused') ?? 'quick');
  const [answeredCount, setAnsweredCount] = useState(0);
  const [answeredCountReady, setAnsweredCountReady] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState<Record<string, any>>({});
  const [showFocusedModal, setShowFocusedModal] = useState(false);
  const [draftFocusedPrefs, setDraftFocusedPrefs] = useState<Record<string, any>>({});
  const [showCombinedDetail, setShowCombinedDetail] = useState(false);
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

  useEffect(() => {
    if (!user || !targetExam) { setAnsweredCount(0); setAnsweredCountReady(true); return; }
    const cacheKey = `qstats_${user.userId}_${targetExam}`;
    const cached = getCached<number>(cacheKey);
    if (cached !== null) { setAnsweredCount(cached); setAnsweredCountReady(true); return; }
    fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${user.userId}&examType=${targetExam}`)
      .then(r => r.json())
      .then(d => {
        const count = d.answeredCount ?? 0;
        setCached(cacheKey, count, DEFAULT_TTL);
        setAnsweredCount(count);
      })
      .catch(() => {})
      .finally(() => setAnsweredCountReady(true));
  }, [user, targetExam]);

  // ── 予想スコア計算（サーバー統計優先、オフライン/ゲスト時はローカル履歴）──
  const estimatedScore = useMemo(() => {
    if (!targetExam) return null;
    const domainList = EXAM_DOMAINS[targetExam] ?? [];
    const weights = DOMAIN_WEIGHTS[targetExam] ?? domainList.map(() => 100 / domainList.length);
    const totalAllWeights = weights.reduce((s, w) => s + w, 0);
    if (totalAllWeights === 0) return null;

    const hist = readDomainHistory(targetExam);
    if (domainStats.length > 0) {
      let weightedSum = 0, hasAnyData = false;
      for (let i = 0; i < domainList.length; i++) {
        const stat = domainStats.find(s => s.tagId === domainList[i]);
        let correct = 0, total = 0;
        if (stat) {
          correct = stat.correctCount ?? 0;
          total = (stat.correctCount ?? 0) + (stat.incorrectCount ?? 0);
        } else {
          // サーバーに欠損しているドメインはローカル履歴で補完
          const sessions = hist[domainList[i]];
          if (sessions && sessions.length > 0) {
            correct = sessions.reduce((s, r) => s + r.correct, 0);
            total = sessions.reduce((s, r) => s + r.total, 0);
          }
        }
        if (total === 0) continue;
        weightedSum += (correct / total) * weights[i];
        hasAnyData = true;
      }
      if (!hasAnyData) return null;
      return Math.round((weightedSum / totalAllWeights) * 1000);
    }

    // ゲスト/オフライン時はローカル履歴のみ
    const MAX_Q = 10;
    let weightedSum = 0, hasAnyData = false;
    for (let i = 0; i < domainList.length; i++) {
      const sessions = hist[domainList[i]];
      if (!sessions || sessions.length === 0) continue;
      const correct = sessions.reduce((s, r) => s + r.correct, 0);
      const total = sessions.reduce((s, r) => s + r.total, 0);
      if (total === 0) continue;
      const nEff = Math.min(total, MAX_Q);
      weightedSum += (correct / total) * (nEff / MAX_Q) * weights[i];
      hasAnyData = true;
    }
    if (!hasAnyData) return null;
    return Math.round((weightedSum / totalAllWeights) * 1000);
  }, [targetExam, domainStats]);

  const focusedUnlocked = !!user && answeredCount >= FOCUSED_UNLOCK_THRESHOLD;
  const focusedUnlockedCached = localStorage.getItem('focusedUnlockedCache') === '1';
  const effectiveFocusedUnlocked = !user ? false : answeredCountReady ? focusedUnlocked : focusedUnlockedCached;
  const primaryMode: 'quick' | 'focused' = lastMode === 'focused' && effectiveFocusedUnlocked ? 'focused' : 'quick';

  useEffect(() => {
    if (answeredCountReady) {
      localStorage.setItem('focusedUnlockedCache', focusedUnlocked ? '1' : '0');
    }
  }, [answeredCountReady, focusedUnlocked]);

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
  const hasFocusedDraft = !!(focusedDraft && focusedDraft.examType === targetExam);

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

  const resumeFocusedExercise = () => {
    if (!focusedDraft) return;
    navigate('/exercise/session', {
      state: {
        sessionId: focusedDraft.sessionId,
        questions: focusedDraft.questions,
        userId: focusedDraft.userId,
        examType: focusedDraft.examType,
        mode: 'exercise',
        isQuick: true,
        isFocused: true,
        resumeIndex: focusedDraft.currentIndex,
        resumeResults: focusedDraft.results,
        resumeAnswered: focusedDraft.answered,
        resumeSelectedAnswers: focusedDraft.selectedAnswers,
      }
    });
  };

  const discardQuickDraft = () => {
    localStorage.removeItem('quickExerciseDraft');
    setQuickDraft(null);
  };
  const discardFocusedDraft = () => {
    localStorage.removeItem('focusedExerciseDraft');
    setFocusedDraft(null);
  };

  // サクッと演習
  const startQuickExercise = async () => {
    if (!targetExam) { alert(ja ? '試験を選択してください' : 'Please select an exam'); return; }
    discardQuickDraft();
    discardFocusedDraft();
    setLastMode('quick');
    localStorage.setItem('lastQuickMode', 'quick');
    setQuickLoading(true);
    const qPrefs = loadQuickPrefs();
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true', withValidity: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      const pool: any[] = (data.items ?? []).filter((q: any) => !!q.validityCheckedAt);
      let items = [...pool];
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
      const selDomains: string[] = qPrefs.domains ?? [];
      if (selDomains.length > 0) {
        items = items.filter((q: any) => (q.tags ?? []).some((t: string) => selDomains.includes(t)));
      }
      const count = qPrefs.questionCount ?? 5;
      items = shuffleArray(items);
      let usedFallback = false;
      if (items.length < count && items.length < pool.length) {
        const usedIds = new Set(items.map((q: any) => q.questionId));
        items = [...items, ...shuffleArray(pool.filter((q: any) => !usedIds.has(q.questionId)))];
        usedFallback = true;
      }
      items = Array.from(new Map(items.map((q: any) => [q.questionId, q])).values()).slice(0, count);
      if (items.length === 0) { alert(ja ? '条件に合う問題がありません' : 'No questions match the criteria'); return; }
      if (usedFallback) alert(ja ? 'フィルタ条件に合う問題が不足したため、条件外の問題も含めて出題します。' : 'Not enough questions matched your filters. Including additional questions.');
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, mode: 'exercise', examType: targetExam, questionIds: items.map((q: any) => q.questionId) }) });
      const sessionData = await sessionRes.json();
      navigate('/exercise/session', { state: { sessionId: sessionData.sessionId, questions: items, userId, mode: 'exercise', examType: targetExam, isQuick: true } });
    } catch (err) { console.error(err); alert(ja ? '演習の開始に失敗しました' : 'Failed to start exercise'); }
    finally { setQuickLoading(false); }
  };

  // しっかり対策
  const startFocusedExercise = async () => {
    if (!targetExam) { alert(ja ? '試験を選択してください' : 'Please select an exam'); return; }
    if (!user) { alert(ja ? 'ログインが必要です' : 'Login required'); return; }
    discardQuickDraft();
    discardFocusedDraft();
    setLastMode('focused');
    localStorage.setItem('lastQuickMode', 'focused');
    setFocusedLoading(true);
    const fPrefs = loadFocusedPrefs();
    try {
      const userId = user.userId;
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true', withValidity: 'true' });
      const [data, incorrectRes] = await Promise.all([
        fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
        fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()),
      ]);
      const allItems: any[] = (data.items ?? []).filter((q: any) => !!q.validityCheckedAt);
      const incorrectIds = new Set<string>(incorrectRes.questionIds ?? []);
      const focusIncorrect: boolean = fPrefs.focusIncorrect !== false;
      const focusDomain: string = fPrefs.focusDomain ?? 'below70';

      let items: any[] = [];
      if (focusIncorrect) {
        items = allItems.filter((q: any) => incorrectIds.has(q.questionId));
      }
      if (focusDomain !== 'none') {
        const threshold = focusDomain === 'below50' ? 0.50 : 0.70;
        const examDomains = EXAM_DOMAINS[targetExam] ?? [];
        const weakDomains = new Set<string>(((): string[] => {
          const hist = readDomainHistory(targetExam);
          return examDomains.filter(domain => {
            const sessions = hist[domain];
            if (!sessions || sessions.length === 0) return true;
            const correct = sessions.reduce((s, r) => s + r.correct, 0);
            const total = sessions.reduce((s, r) => s + r.total, 0);
            return total === 0 || correct / total < threshold;
          });
        })());
        const seenIds = new Set(items.map((q: any) => q.questionId));
        const domainItems = allItems.filter((q: any) => (q.tags ?? []).some((t: string) => weakDomains.has(t)) && !seenIds.has(q.questionId));
        items = [...items, ...domainItems];
      }
      if (items.length === 0 && !focusIncorrect && focusDomain === 'none') {
        items = [...allItems];
      }
      const count = fPrefs.questionCount ?? 5;
      items = shuffleArray(items);
      let usedFallback = false;
      if (items.length < count && items.length < allItems.length) {
        const usedIds = new Set(items.map((q: any) => q.questionId));
        items = [...items, ...shuffleArray(allItems.filter((q: any) => !usedIds.has(q.questionId)))];
        usedFallback = true;
      }
      items = Array.from(new Map(items.map((q: any) => [q.questionId, q])).values()).slice(0, count);
      if (items.length === 0) { alert(ja ? '条件に合う問題がありません' : 'No questions match the criteria'); return; }
      if (usedFallback) alert(ja ? '苦手・不正解問題が不足したため、条件外の問題も含めて出題します。' : 'Not enough weak/incorrect questions. Including additional questions.');
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, mode: 'exercise', examType: targetExam, questionIds: items.map((q: any) => q.questionId), isFocused: true }) });
      const sessionData = await sessionRes.json();
      navigate('/exercise/session', { state: { sessionId: sessionData.sessionId, questions: items, userId, mode: 'exercise', examType: targetExam, isQuick: true, isFocused: true } });
    } catch (err) { console.error(err); alert(ja ? '演習の開始に失敗しました' : 'Failed to start exercise'); }
    finally { setFocusedLoading(false); }
  };

  // ドメイン別成績（サーバー優先、ドメインが欠損している場合はローカル履歴で補完）
  const domains = useMemo(() => targetExam ? (EXAM_DOMAINS[targetExam] ?? []) : [], [targetExam]);
  const domainAccList = useMemo(() => {
    if (!targetExam) return [] as { correct: number; total: number; pct: number | null }[];
    const hist = readDomainHistory(targetExam);
    if (domainStats.length > 0) {
      return domains.map(d => {
        const stat = domainStats.find(s => s.tagId === d);
        if (stat) {
          const correct = stat.correctCount ?? 0;
          const total = (stat.correctCount ?? 0) + (stat.incorrectCount ?? 0);
          return { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
        }
        // サーバーにこのドメインのデータがなければローカル履歴で補完
        const sessions = hist[d];
        if (!sessions || sessions.length === 0) return { correct: 0, total: 0, pct: null };
        const correct = sessions.reduce((s, r) => s + r.correct, 0);
        const total = sessions.reduce((s, r) => s + r.total, 0);
        return { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
      });
    }
    // domainStats 未取得（ゲスト/オフライン）はローカル履歴のみ
    return domains.map(d => {
      const sessions = hist[d];
      if (!sessions || sessions.length === 0) return { correct: 0, total: 0, pct: null };
      const correct = sessions.reduce((s, r) => s + r.correct, 0);
      const total = sessions.reduce((s, r) => s + r.total, 0);
      return { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
    });
  }, [targetExam, domains, domainStats]);

  const hasPrimaryDraft = primaryMode === 'focused' ? hasFocusedDraft : hasQuickDraft;
  const resumePrimary = primaryMode === 'focused' ? resumeFocusedExercise : resumeQuickExercise;
  const primaryLoading = primaryMode === 'focused' ? focusedLoading : quickLoading;
  const primaryBg = primaryMode === 'focused' ? '#009E9E' : 'var(--color-accent)';
  const primaryColor = primaryMode === 'focused' ? '#fff' : 'var(--color-btn-primary-text)';
  const primarySpinnerBorder = primaryMode === 'focused' ? '2px solid rgba(255,255,255,0.3)' : '2px solid rgba(0,0,0,0.2)';
  const primarySpinnerTop = primaryMode === 'focused' ? '#fff' : '#16191f';
  const discardPrimaryDraft = primaryMode === 'focused' ? discardFocusedDraft : discardQuickDraft;
  const startPrimary = primaryMode === 'focused' ? startFocusedExercise : startQuickExercise;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-lg) var(--spacing-lg)' }} className="page-container">

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

      {/* ── ドメイン別正答率 + 予想スコア（1パネル、クリックで詳細） ── */}
      <Card
        padding="var(--spacing-md)"
        style={{ marginBottom: 'var(--spacing-md)', cursor: (targetExam && !statsLoading) ? 'pointer' : 'default' }}
        onClick={() => { if (targetExam && !statsLoading) setShowCombinedDetail(true); }}
      >

        {/* ドメイン別正答率 */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {ja ? 'ドメイン別正答率' : 'Domain Accuracy'}
          </span>
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
                    {pct !== null && <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--bar-gradient-primary)', transformOrigin: 'left center', animation: `growWidth 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 30}ms both` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 区切り線 */}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '14px 0' }} />

        {/* 予想スコア */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {ja ? '予想スコア' : 'Est. Score'}
          </span>
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
                  <div style={{ position: 'absolute', bottom: '100%', marginBottom: 3, background: '#f59e0b', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap', lineHeight: 1.5 }}>
                    {ja ? `合格 ${passScore}` : `Pass ${passScore}`}
                  </div>
                  <div style={{ width: 2, height: '100%', background: '#f59e0b', borderRadius: 1 }} />
                </div>
              )}
              <div style={{ width: `${Math.min(100, (estimatedScore / 1000) * 100)}%`, height: '100%', borderRadius: 4, background: 'var(--bar-gradient-primary)', transformOrigin: 'left center', animation: 'growWidth 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both' }} />
            </div>
          </>
        )}
      </Card>

      {/* ── 日めくりAWSサービス ── */}
      <TodayServiceSection lang={lang} userId={user?.userId} onNavigateEncyclopedia={() => navigate('/encyclopedia')} />

      {/* ── 非ログイン時バナー ── */}
      {!user && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)', borderRadius: 'var(--border-radius-md)', padding: '10px var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
          <span style={{ lineHeight: 1.6 }}>{ja ? 'ログインすると演習・模試の結果が保存され、予想スコアが表示されます。' : 'Log in to save results and view your estimated score.'}</span>
          <Button variant="primary" size="sm" onClick={() => navigate('/login')} style={{ flexShrink: 0 }}>{ja ? 'ログイン →' : 'Log in →'}</Button>
        </div>
      )}

      {/* ── サクッと演習ボタン（デスクトップ固定） ── */}
      {!isMobile && createPortal(
        <div style={{ position: 'fixed', bottom: 16, left: 'var(--content-left, 0px)', right: 0, zIndex: 150 }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 var(--spacing-lg)', display: 'flex', gap: 6 }}>
            {hasPrimaryDraft ? (
              <div style={{ flex: 1, position: 'relative' }}>
                {showWebQuickMenu && (
                  <>
                    <div onClick={() => setShowWebQuickMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                    <div style={{ position: 'absolute', bottom: '110%', left: 0, right: 0, zIndex: 200, background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-md)', boxShadow: '0 -4px 16px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)', padding: '8px', marginBottom: 6 }}>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', textAlign: 'center', marginBottom: 8 }}>
                        {ja ? 'セッションを上書きして新しく開始します' : 'This will overwrite the current session'}
                      </div>
                      <Button variant="outline" size="sm" fullWidth style={{ height: 36, borderColor: primaryMode === 'focused' ? '#009E9E' : 'var(--color-accent)', color: primaryMode === 'focused' ? '#009E9E' : 'var(--color-accent)' }} onClick={() => { setShowWebQuickMenu(false); discardPrimaryDraft(); startPrimary(); }}>
                        {ja ? `新規に開始（${primaryMode === 'focused' ? 'しっかり対策' : 'サクッと演習'}）` : `Start New (${primaryMode === 'focused' ? 'Focused' : 'Quick'})`}
                      </Button>
                      <div style={{ marginTop: 6 }}>
                        {primaryMode === 'quick' ? (
                          <>
                            {focusedUnlocked && <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', marginBottom: 4 }}>{ja ? '苦手・不正解問題を重点演習' : 'Focuses on weak/incorrect questions'}</div>}
                            <button
                              disabled={!targetExam || !user || !focusedUnlocked || focusedLoading}
                              onClick={() => { setShowWebQuickMenu(false); startFocusedExercise(); }}
                              style={{ width: '100%', height: 36, padding: '0 12px', border: `1.5px solid ${(!targetExam || !user || !focusedUnlocked) ? 'var(--color-border)' : '#009E9E'}`, borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || !user || !focusedUnlocked || focusedLoading) ? 'default' : 'pointer', background: 'transparent', color: (!targetExam || !user || !focusedUnlocked) ? 'var(--color-text-light)' : '#009E9E', fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                            >
                              {!focusedUnlocked && <IconLock size={13} />}
                              {ja ? 'しっかり対策' : 'Focused Practice'}
                            </button>
                            {!focusedUnlocked && user && (
                              <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', marginTop: 3 }}>
                                {ja ? `現在${answeredCount}問 / あと${FOCUSED_UNLOCK_THRESHOLD - answeredCount}問で解放` : `${answeredCount} answered / ${FOCUSED_UNLOCK_THRESHOLD - answeredCount} more to unlock`}
                              </div>
                            )}
                            {!user && <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', marginTop: 3 }}>{ja ? 'ログインが必要です' : 'Login required'}</div>}
                          </>
                        ) : (
                          <>
                            <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', marginBottom: 4 }}>{ja ? 'ランダム出題（設定に従う）' : 'Random questions (uses settings)'}</div>
                            <button disabled={!targetExam || quickLoading} onClick={() => { setShowWebQuickMenu(false); startQuickExercise(); }} style={{ width: '100%', height: 36, padding: '0 12px', border: '1.5px solid var(--color-accent)', borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || quickLoading) ? 'default' : 'pointer', background: 'transparent', color: 'var(--color-accent)', fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {ja ? `サクッと演習 (${loadQuickPrefs().questionCount ?? 5}問)` : `Quick (${loadQuickPrefs().questionCount ?? 5}Q)`}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden' }}>
                  <button
                    disabled={!targetExam || primaryLoading}
                    onClick={resumePrimary}
                    style={{ flex: 1, height: 44, border: 'none', background: primaryBg, color: primaryColor, fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (!targetExam || primaryLoading) ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8 }}
                  >
                    {primaryLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 14, height: 14, border: primarySpinnerBorder, borderTopColor: primarySpinnerTop, borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                        {ja ? '準備中...' : 'Loading...'}
                      </span>
                    ) : primaryMode === 'quick' ? (ja ? 'サクッと演習（続きから）' : 'Quick (Resume)') : (ja ? 'しっかり対策（続きから）' : 'Focused (Resume)')}
                  </button>
                  <button
                    onClick={() => setShowWebQuickMenu(v => !v)}
                    style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: primaryBg, color: primaryColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label={ja ? '新規で開始メニュー' : 'Start new menu'}
                  >
                    <IconChevronUp size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, position: 'relative' }}>
                {showFocusedMenu && (
                  <>
                    <div onClick={() => setShowFocusedMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                    <div style={{ position: 'absolute', bottom: '110%', left: 0, right: 0, zIndex: 200, background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-md)', boxShadow: '0 -4px 16px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)', padding: '8px', marginBottom: 6 }}>
                      {primaryMode === 'quick' ? (
                        <>
                          {focusedUnlocked && <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', marginBottom: 4 }}>{ja ? '苦手・不正解問題を重点演習' : 'Focuses on weak/incorrect questions'}</div>}
                          <button
                            disabled={!targetExam || !user || !focusedUnlocked || focusedLoading}
                            onClick={() => { setShowFocusedMenu(false); startFocusedExercise(); }}
                            style={{ width: '100%', height: 36, padding: '0 12px', border: `1.5px solid ${(!targetExam || !user || !focusedUnlocked) ? 'var(--color-border)' : '#009E9E'}`, borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || !user || !focusedUnlocked || focusedLoading) ? 'default' : 'pointer', background: 'transparent', color: (!targetExam || !user || !focusedUnlocked) ? 'var(--color-text-light)' : '#009E9E', fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                          >
                            {!focusedUnlocked && <IconLock size={13} />}
                            {ja ? 'しっかり対策' : 'Focused Practice'}
                          </button>
                          {!focusedUnlocked && user && (
                            <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', marginTop: 3 }}>
                              {ja ? `現在${answeredCount}問 / あと${FOCUSED_UNLOCK_THRESHOLD - answeredCount}問で解放` : `${answeredCount} answered / ${FOCUSED_UNLOCK_THRESHOLD - answeredCount} more to unlock`}
                            </div>
                          )}
                          {!user && <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', marginTop: 3 }}>{ja ? 'ログインが必要です' : 'Login required'}</div>}
                        </>
                      ) : (
                        <>
                          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', marginBottom: 4 }}>{ja ? 'ランダム出題（設定に従う）' : 'Random questions (uses settings)'}</div>
                          <button disabled={!targetExam || quickLoading} onClick={() => { setShowFocusedMenu(false); startQuickExercise(); }} style={{ width: '100%', height: 36, padding: '0 12px', border: '1.5px solid var(--color-accent)', borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || quickLoading) ? 'default' : 'pointer', background: 'transparent', color: 'var(--color-accent)', fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {ja ? `サクッと演習 (${loadQuickPrefs().questionCount ?? 5}問)` : `Quick (${loadQuickPrefs().questionCount ?? 5}Q)`}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden' }}>
                  {primaryMode === 'quick' ? (
                    <button
                      disabled={!targetExam || quickLoading}
                      onClick={() => { if (targetExam && !quickLoading) startQuickExercise(); }}
                      style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (!targetExam || quickLoading) ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8 }}
                    >
                      {quickLoading ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                          {ja ? '準備中...' : 'Loading...'}
                        </span>
                      ) : (ja ? `サクッと演習 (${loadQuickPrefs().questionCount ?? 5}問)` : `Quick (${loadQuickPrefs().questionCount ?? 5}Q)`)}
                    </button>
                  ) : (
                    <button
                      disabled={!targetExam || focusedLoading}
                      onClick={() => { if (targetExam && !focusedLoading) startFocusedExercise(); }}
                      style={{ flex: 1, height: 44, border: 'none', background: '#009E9E', color: '#fff', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (!targetExam || focusedLoading) ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8 }}
                    >
                      {focusedLoading ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                          {ja ? '準備中...' : 'Loading...'}
                        </span>
                      ) : (ja ? 'しっかり対策' : 'Focused Practice')}
                    </button>
                  )}
                  <button
                    onClick={() => setShowFocusedMenu(v => !v)}
                    style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: primaryMode === 'focused' ? '#009E9E' : 'var(--color-accent)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label={primaryMode === 'quick' ? (ja ? 'しっかり対策' : 'Focused practice') : (ja ? 'サクッと演習' : 'Quick practice')}
                  >
                    <IconChevronUp size={16} />
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                if (primaryMode === 'focused') { setDraftFocusedPrefs({ ...loadFocusedPrefs() }); setShowFocusedModal(true); }
                else { setDraftPrefs({ ...loadQuickPrefs() }); setShowQuickModal(true); }
              }}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, width: 132, border: `1.5px solid ${primaryMode === 'focused' ? '#009E9E' : 'var(--color-primary)'}`, borderRadius: 'var(--border-radius-full)', background: 'var(--color-bg-white)', cursor: 'pointer', color: primaryMode === 'focused' ? '#009E9E' : 'var(--color-primary)', fontWeight: 600, fontSize: 'var(--font-size-base)' }}
            >
              {ja ? '設定' : 'Settings'}
            </button>
          </div>
        </div>
      , document.body)}

      {/* ── サクッと演習ボタン（モバイル固定） ── */}
      {isMobile && (
        <>
          {/* プルアップパネル：新規で開始（セッションあり時のみ） */}
          {hasPrimaryDraft && showNewPanel && (
            <>
              <div onClick={() => setShowNewPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 210 }} />
              <div style={{ position: 'fixed', bottom: 116, left: 0, right: 0, zIndex: 211, background: 'var(--color-bg-white)', borderRadius: '14px 14px 0 0', padding: '14px 12px 12px', boxShadow: '0 -4px 20px rgba(0,0,0,0.18)', animation: 'slideUp 0.22s ease' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', textAlign: 'center', marginBottom: 10 }}>
                  {ja ? 'セッションを上書きして開始します' : 'This will overwrite the current session'}
                </div>
                <Button variant="outline" fullWidth style={{ height: 44, borderColor: primaryMode === 'focused' ? '#009E9E' : 'var(--color-accent)', color: primaryMode === 'focused' ? '#009E9E' : 'var(--color-accent)' }} onClick={() => { setShowNewPanel(false); discardPrimaryDraft(); startPrimary(); }}>
                  {ja ? `新規に開始（${primaryMode === 'focused' ? 'しっかり対策' : 'サクッと演習'}）` : `Start New (${primaryMode === 'focused' ? 'Focused' : 'Quick'})`}
                </Button>
                <div style={{ marginTop: 8 }}>
                  {primaryMode === 'quick' ? (
                    <>
                      {focusedUnlocked && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', marginBottom: 4 }}>{ja ? '苦手・不正解問題を重点演習' : 'Focuses on weak/incorrect questions'}</div>}
                      <button
                        disabled={!targetExam || !user || !focusedUnlocked || focusedLoading}
                        onClick={() => { setShowNewPanel(false); startFocusedExercise(); }}
                        style={{ width: '100%', height: 44, border: `1.5px solid ${(!targetExam || !user || !focusedUnlocked) ? 'var(--color-border)' : '#009E9E'}`, borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || !user || !focusedUnlocked || focusedLoading) ? 'default' : 'pointer', background: 'transparent', color: (!targetExam || !user || !focusedUnlocked) ? 'var(--color-text-light)' : '#009E9E', fontWeight: 600, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        {!focusedUnlocked && <IconLock size={15} />}
                        {ja ? 'しっかり対策' : 'Focused Practice'}
                      </button>
                      {!focusedUnlocked && user && (
                        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>
                          {ja ? `現在${answeredCount}問 / あと${FOCUSED_UNLOCK_THRESHOLD - answeredCount}問で解放` : `${answeredCount} answered / ${FOCUSED_UNLOCK_THRESHOLD - answeredCount} more to unlock`}
                        </div>
                      )}
                      {!user && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>{ja ? 'ログインが必要です' : 'Login required'}</div>}
                    </>
                  ) : (
                    <>
                      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', marginBottom: 4 }}>{ja ? 'ランダム出題（設定に従う）' : 'Random questions (uses settings)'}</div>
                      <button disabled={!targetExam || quickLoading} onClick={() => { setShowNewPanel(false); startQuickExercise(); }} style={{ width: '100%', height: 44, border: '1.5px solid var(--color-accent)', borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || quickLoading) ? 'default' : 'pointer', background: 'transparent', color: 'var(--color-accent)', fontWeight: 600, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {ja ? 'サクッと演習' : 'Quick Practice'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          {/* プルアップパネル：セカンダリモード（セッションなし時） */}
          {!hasPrimaryDraft && showFocusedMenu && (
            <>
              <div onClick={() => setShowFocusedMenu(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 210 }} />
              <div style={{ position: 'fixed', bottom: 116, left: 0, right: 0, zIndex: 211, background: 'var(--color-bg-white)', borderRadius: '14px 14px 0 0', padding: '14px 12px 12px', boxShadow: '0 -4px 20px rgba(0,0,0,0.18)', animation: 'slideUp 0.22s ease' }}>
                {primaryMode === 'quick' ? (
                  <>
                    {focusedUnlocked && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', marginBottom: 4 }}>{ja ? '苦手・不正解問題を重点演習' : 'Focuses on weak/incorrect questions'}</div>}
                    <button
                      disabled={!targetExam || !user || !focusedUnlocked || focusedLoading}
                      onClick={() => { setShowFocusedMenu(false); startFocusedExercise(); }}
                      style={{ width: '100%', height: 44, border: `1.5px solid ${(!targetExam || !user || !focusedUnlocked) ? 'var(--color-border)' : '#009E9E'}`, borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || !user || !focusedUnlocked || focusedLoading) ? 'default' : 'pointer', background: 'transparent', color: (!targetExam || !user || !focusedUnlocked) ? 'var(--color-text-light)' : '#009E9E', fontWeight: 600, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      {!focusedUnlocked && <IconLock size={15} />}
                      {ja ? 'しっかり対策' : 'Focused Practice'}
                    </button>
                    {!focusedUnlocked && user && (
                      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>
                        {ja ? `現在${answeredCount}問 / あと${FOCUSED_UNLOCK_THRESHOLD - answeredCount}問で解放` : `${answeredCount} answered / ${FOCUSED_UNLOCK_THRESHOLD - answeredCount} more to unlock`}
                      </div>
                    )}
                    {!user && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>{ja ? 'ログインが必要です' : 'Login required'}</div>}
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', marginBottom: 4 }}>{ja ? 'ランダム出題（設定に従う）' : 'Random questions (uses settings)'}</div>
                    <button disabled={!targetExam || quickLoading} onClick={() => { setShowFocusedMenu(false); startQuickExercise(); }} style={{ width: '100%', height: 44, border: '1.5px solid var(--color-accent)', borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || quickLoading) ? 'default' : 'pointer', background: 'transparent', color: 'var(--color-accent)', fontWeight: 600, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {ja ? 'サクッと演習' : 'Quick Practice'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {createPortal(<div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, background: 'var(--color-bg-white)', borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', gap: 6, boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}>
            {hasPrimaryDraft ? (
              /* スプリットピル：続きから再開 + ↑ */
              <div style={{ flex: 1, display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden', opacity: !targetExam ? 0.5 : 1 }}>
                <button
                  disabled={!targetExam || primaryLoading}
                  onClick={resumePrimary}
                  style={{ flex: 1, height: 44, border: 'none', background: primaryBg, color: primaryColor, fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: !targetExam || primaryLoading ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8 }}
                >
                  {primaryLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 14, height: 14, border: primarySpinnerBorder, borderTopColor: primarySpinnerTop, borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                      {ja ? '準備中...' : 'Loading...'}
                    </span>
                  ) : primaryMode === 'quick' ? (ja ? 'サクッと演習（続きから）' : 'Quick (Resume)') : (ja ? 'しっかり対策（続きから）' : 'Focused (Resume)')}
                </button>
                <button
                  onClick={() => setShowNewPanel(v => !v)}
                  style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: primaryBg, color: primaryColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  aria-label={ja ? '新規で開始メニュー' : 'Start new menu'}
                >
                  <IconChevronUp size={16} />
                </button>
              </div>
            ) : (
              /* スプリットピル：primaryMode依存 */
              <div style={{ flex: 1, display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden', opacity: !targetExam ? 0.5 : 1 }}>
                {primaryMode === 'quick' ? (
                  <button
                    disabled={!targetExam || quickLoading}
                    onClick={() => { if (targetExam && !quickLoading) startQuickExercise(); }}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: !targetExam || quickLoading ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8 }}
                  >
                    {quickLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                        {ja ? '準備中...' : 'Loading...'}
                      </span>
                    ) : (ja ? 'サクッと演習' : 'Quick')}
                  </button>
                ) : (
                  <button
                    disabled={!targetExam || focusedLoading}
                    onClick={() => { if (targetExam && !focusedLoading) startFocusedExercise(); }}
                    style={{ flex: 1, height: 44, border: 'none', background: '#009E9E', color: '#fff', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: !targetExam || focusedLoading ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8 }}
                  >
                    {focusedLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                        {ja ? '準備中...' : 'Loading...'}
                      </span>
                    ) : (ja ? 'しっかり対策' : 'Focused')}
                  </button>
                )}
                <button
                  onClick={() => setShowFocusedMenu(v => !v)}
                  style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: primaryMode === 'focused' ? '#009E9E' : 'var(--color-accent)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  aria-label={primaryMode === 'quick' ? (ja ? 'しっかり対策' : 'Focused practice') : (ja ? 'サクッと演習' : 'Quick practice')}
                >
                  <IconChevronUp size={16} />
                </button>
              </div>
            )}
            {/* 設定アイコン（常に表示） */}
            <button
              onClick={() => {
                if (primaryMode === 'focused') { setDraftFocusedPrefs({ ...loadFocusedPrefs() }); setShowFocusedModal(true); }
                else { setDraftPrefs({ ...loadQuickPrefs() }); setShowQuickModal(true); }
              }}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: `1.5px solid ${primaryMode === 'focused' ? '#009E9E' : 'var(--color-primary)'}`, borderRadius: '50%', background: 'transparent', cursor: 'pointer', color: primaryMode === 'focused' ? '#009E9E' : 'var(--color-primary)' }}
              aria-label={ja ? '設定' : 'Settings'}
            >
              <IconSettings size={18} />
            </button>
          </div>, document.body)}
        </>
      )}

      {/* ── サクッと演習 設定モーダル ── */}
      {showQuickModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowQuickModal(false); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 24px 20px', width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-accent)' }}>
                {ja ? 'サクッと演習 設定' : 'Quick Practice Settings'}
              </h3>
              <button onClick={() => setShowQuickModal(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ marginBottom: 20 }}>
              {/* 出題数 */}
              <div style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                  {ja ? '出題数' : 'Question Count'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[5, 10, 20].map(n => {
                    const sel = (draftPrefs.questionCount ?? 5) === n;
                    return (
                      <button
                        key={n}
                        onClick={() => setDraftPrefs(p => ({ ...p, questionCount: n }))}
                        style={{ flex: 1, height: 36, border: `1.5px solid ${sel ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--border-radius-full)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-main)', fontWeight: sel ? 700 : 600, fontSize: 'var(--font-size-sm)', transition: 'all 0.15s' }}
                      >
                        {n}{ja ? '問' : 'Q'}
                      </button>
                    );
                  })}
                </div>
              </div>
              {targetExam && (EXAM_DOMAINS[targetExam] ?? []).length > 0 && (
                <div style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
                        {ja ? 'ドメイン' : 'Domains'}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 2 }}>
                        {ja ? '未選択 = すべて対象' : 'None selected = all domains'}
                      </div>
                    </div>
                    {(draftPrefs.domains ?? []).length > 0 && (
                      <button
                        onClick={() => setDraftPrefs(p => ({ ...p, domains: [] }))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', padding: '2px 4px', textDecoration: 'underline' }}
                      >
                        {ja ? 'すべて解除' : 'Clear'}
                      </button>
                    )}
                  </div>
                  {(EXAM_DOMAINS[targetExam] ?? []).map(domain => {
                    const selDoms: string[] = draftPrefs.domains ?? [];
                    const checked = selDoms.includes(domain);
                    return (
                      <label key={domain} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setDraftPrefs(p => {
                            const cur: string[] = p.domains ?? [];
                            return { ...p, domains: checked ? cur.filter(d => d !== domain) : [...cur, domain] };
                          })}
                          style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, accentColor: 'var(--color-primary)' }}
                        />
                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', lineHeight: 1.4 }}>{domain}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div style={{ padding: '14px 0' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                  {ja ? '重点フィルタ' : 'Focus Filter'}
                </div>
                {([
                  ['unansweredOnly', ja ? '未回答のみ' : 'Unanswered Only', ja ? '一度も回答していない問題のみ出題' : 'Only questions not yet answered'],
                  ['incorrectOnly',  ja ? '不正解のみ'  : 'Incorrect Only',  ja ? '過去に不正解だった問題のみ出題'   : 'Only previously incorrect questions'],
                  ['bookmarkOnly',   ja ? 'ブックマークのみ' : 'Bookmarked Only', ja ? 'ブックマークした問題のみ出題'  : 'Only bookmarked questions'],
                ] as [string, string, string][]).map(([key, label, desc]) => {
                  const on = !!(draftPrefs[key]);
                  return (
                    <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setDraftPrefs(p => ({ ...p, [key]: !on }))}
                        style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3, accentColor: 'var(--color-primary)' }}
                      />
                      <div>
                        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: on ? 600 : 400, color: 'var(--color-text-main)' }}>{label}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 1 }}>{desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
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

      {/* ── しっかり対策 設定モーダル ── */}
      {showFocusedModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowFocusedModal(false); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 24px 20px', width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: '#009E9E' }}>
                {ja ? 'しっかり対策 設定' : 'Focused Practice Settings'}
              </h3>
              <button onClick={() => setShowFocusedModal(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ marginBottom: 20 }}>
              {/* 出題数 */}
              <div style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                  {ja ? '出題数' : 'Question Count'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[5, 10, 20, 30].map(n => {
                    const sel = (draftFocusedPrefs.questionCount ?? 5) === n;
                    return (
                      <button
                        key={n}
                        onClick={() => setDraftFocusedPrefs(p => ({ ...p, questionCount: n }))}
                        style={{ flex: 1, height: 36, border: `1.5px solid ${sel ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--border-radius-full)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-main)', fontWeight: sel ? 700 : 600, fontSize: 'var(--font-size-sm)', transition: 'all 0.15s' }}
                      >
                        {n}{ja ? '問' : 'Q'}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 不正解問題フィルタ */}
              <div style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                  {ja ? '不正解問題フィルタ' : 'Incorrect Filter'}
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draftFocusedPrefs.focusIncorrect !== false}
                    onChange={() => setDraftFocusedPrefs(p => ({ ...p, focusIncorrect: p.focusIncorrect === false }))}
                    style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3, accentColor: 'var(--color-primary)' }}
                  />
                  <div>
                    <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)' }}>
                      {ja ? '過去に不正解だった問題を含める' : 'Include previously incorrect questions'}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 1 }}>
                      {ja ? '一度でも不正解になった問題を優先出題' : 'Prioritize questions you got wrong before'}
                    </div>
                  </div>
                </label>
              </div>
              {/* 苦手ドメインフィルタ */}
              <div style={{ padding: '14px 0' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                  {ja ? '苦手ドメインフィルタ' : 'Weak Domain Filter'}
                </div>
                {([
                  ['none',    ja ? '絞り込まない' : 'Off',              ja ? 'ドメインによる絞り込みをしない' : 'No domain filtering'],
                  ['below70', ja ? '正答率70%以下のドメイン' : 'Below 70%', ja ? '正答率70%未満のドメインの問題を優先出題' : 'Prioritize questions from domains below 70%'],
                  ['below50', ja ? '正答率50%以下のドメイン' : 'Below 50%', ja ? '正答率50%未満のドメインの問題を優先出題' : 'Prioritize questions from domains below 50%'],
                ] as [string, string, string][]).map(([val, label, desc]) => {
                  const selected = (draftFocusedPrefs.focusDomain ?? 'below70') === val;
                  return (
                    <label key={val} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="focusDomain"
                        checked={selected}
                        onChange={() => setDraftFocusedPrefs(p => ({ ...p, focusDomain: val }))}
                        style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3, accentColor: 'var(--color-primary)' }}
                      />
                      <div>
                        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: selected ? 600 : 400, color: 'var(--color-text-main)' }}>{label}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 1 }}>{desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={() => { localStorage.setItem(FOCUSED_PREFS_KEY, JSON.stringify(draftFocusedPrefs)); setShowFocusedModal(false); }}
              variant="primary" style={{ width: '100%', background: '#009E9E', borderColor: '#009E9E' }}
            >
              {ja ? '保存する' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {/* 成績詳細モーダル */}
      {showCombinedDetail && targetExam && (
        <CombinedDetailModal targetExam={targetExam} domainAccList={domainAccList} estimatedScore={estimatedScore} passScore={passScore} lang={lang} isMobile={isMobile} onClose={() => setShowCombinedDetail(false)} />
      )}
    </div>
  );
}
