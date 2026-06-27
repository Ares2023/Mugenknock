'use client';
import React, { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from '@/compat/react-router-dom';
import DailyServiceRevealModal from '../components/DailyServiceRevealModal';
import ExamSelectOverlay from '../components/ExamSelectOverlay';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS,
  DOMAIN_WEIGHTS, DOMAIN_NAME_EN, PASS_SCORES, qDomainName,
  EXAM_LEVEL, EXAM_LEVEL_COLORS,
  tagIdMatches, domainsToIndices, storedDomainsToNames, questionDomainIndex,
} from '../constants';
import { readDomainResults, readDomainHistory } from '../utils/domainStats';
import { getCached, setCached, deleteCached, DEFAULT_TTL, getCachedPersist, setCachedPersist, deleteCachedPersist } from '../utils/cache';
import { animateLoadPct, randomPlateau } from '../utils/loadProgress';
import { getPoints, deductPoints } from '../utils/points';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { IconLightbulb, IconBean, IconSettings, IconChevronUp, IconChevronDown, IconLock, IconFileText, IconTrendingUp, IconBookOpen, IconCheck, IconSparkles, IconPointer, IconMousePointerClick, IconCalendarNotebook, IconRefreshCw, IconTarget, IconChart, ServiceIconImg, isServiceIconKey, IconUser, IconSaveCheck } from '../components/Icons';
import { CATALOG } from '../data/awsServiceCatalog';
import { autoScoreAndClearDrafts } from '../utils/sessionUtils';
import { syncTargetExamToServer, loadTargetExamFromServer } from '../utils/preferences';
import { prefetchTypeA, prefetchTypeB, prefetchTypeC, getPrefetchA, getPrefetchB, getPrefetchC } from '../utils/questionPrefetch';

type DomainStat = { tagId: string; correctCount?: number; incorrectCount?: number; recentResults?: boolean[] };
type SessionEntry = { correct: number; total: number };
type DomainHistory = Record<string, SessionEntry[]>;
type ScoreEntry = { date: string; score: number };

// ── ユーティリティ ───────────────────────────────────────────────
function getGrade(pct: number | null): string {
  if (pct === null) return '—';
  if (pct >= 100) return 'S'; // 5/5
  if (pct >= 80)  return 'A'; // 4/5
  if (pct >= 60)  return 'B'; // 3/5
  if (pct >= 40)  return 'C'; // 2/5
  return 'D';                  // 0–1/5
}

// ロード進捗を limit に向けて漸近的にアニメーション。返り値はキャンセル関数。

// readDomainResults / readDomainHistory は ../utils/domainStats から import（index 文字列キーに正規化）

function readScoreHistory(examType: string, uid: string): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(`score_history_${examType}_${uid}`) ?? '[]'); } catch { return []; }
}

function readSessionScoreHistory(examType: string, uid: string): number[] {
  try { return JSON.parse(localStorage.getItem(`score_session_history_${examType}_${uid}`) ?? '[]'); } catch { return []; }
}

function readSessionScoreLog(examType: string, uid: string): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(`score_session_log_${examType}_${uid}`) ?? '[]'); } catch { return []; }
}

// ── スコア折れ線グラフ ───────────────────────────────────────────
function ScoreLineChart({ data, passScore, lang = 'ja', animate = true }: { data: ScoreEntry[]; passScore: number | null; lang?: string; animate?: boolean }) {
  if (data.length < 2) {
    return (
      <p style={{ color: 'var(--color-text-light)', fontSize: 12, fontStyle: 'italic', margin: 0 }}>
        {lang === 'ja' ? '2日分以上のデータが貯まると表示されます' : 'Appears after 2+ days of data'}
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
  const stagger = 0.13, nodeDur = 0.22;
  const totalLength = data.slice(0, -1).reduce((sum, _, i) => {
    const dx = cx(i + 1) - cx(i), dy = cy(data[i + 1].score) - cy(data[i].score);
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0);
  const totalLineDur = (data.length - 1) * stagger + nodeDur;
  return (
    <svg key={data.length} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      {[minS, maxS].map((s, i) => (
        <text key={i} x={PL - 4} y={i === 0 ? PT + iH + 4 : PT + 4} fontSize={9} fill="var(--color-text-light)" textAnchor="end">{s}</text>
      ))}
      {passScore !== null && passScore >= minS && passScore <= maxS && (
        <>
          <line x1={PL} x2={PL + iW} y1={cy(passScore)} y2={cy(passScore)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" />
          <text x={PL + iW + 2} y={cy(passScore) + 3} fontSize={8} fill="#f59e0b" fontWeight="bold">{lang === 'ja' ? '合格' : 'Pass'}</text>
        </>
      )}
      <path d={pathD} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={animate ? totalLength : undefined} strokeDashoffset={animate ? totalLength : 0}>
        {animate && <animate attributeName="stroke-dashoffset" from={String(totalLength)} to="0" dur={`${totalLineDur}s`} fill="freeze" />}
      </path>
      {data.map((d, i) => (
        <g key={i} opacity={animate ? 0 : 1}>
          {animate && <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin={`${i * stagger}s`} fill="freeze" />}
          <text x={cx(i)} y={cy(d.score) - 6} fontSize={8} fill="var(--color-primary)" textAnchor="middle" fontWeight="bold">{d.score}</text>
          <circle cx={cx(i)} cy={cy(d.score)} r={animate ? 0 : 3} fill="var(--color-primary)">
            {animate && <animate attributeName="r" values="0;4;3" keyTimes="0;0.65;1" dur={`${nodeDur}s`} begin={`${i * stagger}s`} fill="freeze" />}
          </circle>
        </g>
      ))}
      <text x={cx(0)} y={H - 2} fontSize={9} fill="var(--color-text-light)" textAnchor="middle">{data[0].date.slice(5)}</text>
      <text x={cx(data.length - 1)} y={H - 2} fontSize={9} fill="var(--color-text-light)" textAnchor="middle">{data[data.length - 1].date.slice(5)}</text>
    </svg>
  );
}

function SessionScoreChart({ data, passScore, lang = 'ja', animate = true }: { data: number[]; passScore: number | null; lang?: string; animate?: boolean }) {
  if (data.length < 2) {
    return (
      <p style={{ color: 'var(--color-text-light)', fontSize: 12, fontStyle: 'italic', margin: 0 }}>
        {lang === 'ja' ? '2回分以上のデータが貯まると表示されます' : 'Appears after 2+ sessions of data'}
      </p>
    );
  }
  const W = 300, H = 90, PL = 36, PR = 8, PT = 20, PB = 18;
  const iW = W - PL - PR, iH = H - PT - PB;
  const minS = Math.max(0, Math.min(...data) - 50);
  const maxS = Math.min(1000, Math.max(...data) + 50);
  const range = maxS - minS || 200;
  const cx = (i: number) => PL + (i / (data.length - 1)) * iW;
  const cy = (s: number) => PT + iH - ((s - minS) / range) * iH;
  const pathD = data.map((s, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${cy(s).toFixed(1)}`).join(' ');
  const stagger2 = 0.13, nodeDur2 = 0.22;
  const totalLength2 = data.slice(0, -1).reduce((sum, _, i) => {
    const dx = cx(i + 1) - cx(i), dy = cy(data[i + 1]) - cy(data[i]);
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0);
  const totalLineDur2 = (data.length - 1) * stagger2 + nodeDur2;
  return (
    <svg key={data.length} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      {[minS, maxS].map((s, i) => (
        <text key={i} x={PL - 4} y={i === 0 ? PT + iH + 4 : PT + 4} fontSize={9} fill="var(--color-text-light)" textAnchor="end">{s}</text>
      ))}
      {passScore !== null && passScore >= minS && passScore <= maxS && (
        <>
          <line x1={PL} x2={PL + iW} y1={cy(passScore)} y2={cy(passScore)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" />
          <text x={PL + iW + 2} y={cy(passScore) + 3} fontSize={8} fill="#f59e0b" fontWeight="bold">{lang === 'ja' ? '合格' : 'Pass'}</text>
        </>
      )}
      <path d={pathD} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={animate ? totalLength2 : undefined} strokeDashoffset={animate ? totalLength2 : 0}>
        {animate && <animate attributeName="stroke-dashoffset" from={String(totalLength2)} to="0" dur={`${totalLineDur2}s`} fill="freeze" />}
      </path>
      {data.map((s, i) => (
        <g key={i} opacity={animate ? 0 : 1}>
          {animate && <animate attributeName="opacity" from="0" to="1" dur="0.01s" begin={`${i * stagger2}s`} fill="freeze" />}
          <text x={cx(i)} y={cy(s) - 6} fontSize={8} fill="var(--color-accent)" textAnchor="middle" fontWeight="bold">{s}</text>
          <circle cx={cx(i)} cy={cy(s)} r={animate ? 0 : 3} fill="var(--color-accent)">
            {animate && <animate attributeName="r" values="0;4;3" keyTimes="0;0.65;1" dur={`${nodeDur2}s`} begin={`${i * stagger2}s`} fill="freeze" />}
          </circle>
          {i === data.length - 1 && (
            <text x={cx(i)} y={H - 2} fontSize={9} fill="var(--color-text-sub)" textAnchor="middle" fontWeight="bold">{lang === 'ja' ? '最新' : 'Latest'}</text>
          )}
          {i === 0 && (
            <text x={cx(i)} y={H - 2} fontSize={9} fill="var(--color-text-light)" textAnchor="middle">{`-${data.length - 1}`}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── 成績詳細モーダル（ドメイン別 + 予想スコア 統合） ───────────
function CombinedDetailModal({ targetExam, domainAccList, estimatedScore, passScore, lang, isMobile, uid, domainStats, scoreHistory: serverScoreHistory, sessionHistory: serverSessionHistory, sessionScoreLog: serverSessionScoreLog, onClose }: {
  targetExam: string;
  domainAccList: { correct: number; total: number; pct: number | null }[];
  estimatedScore: number | null;
  passScore: number | null;
  lang: string;
  isMobile: boolean;
  uid: string;
  domainStats: DomainStat[];
  scoreHistory?: ScoreEntry[];
  sessionHistory?: number[];
  sessionScoreLog?: ScoreEntry[];
  onClose: () => void;
}) {
  const ja = lang === 'ja';
  const domains = EXAM_DOMAINS[targetExam] ?? [];
  const history = serverScoreHistory ?? readScoreHistory(targetExam, uid);
  const sessionHistory = serverSessionHistory ?? readSessionScoreHistory(targetExam, uid);
  const sessionLog = serverSessionScoreLog ?? readSessionScoreLog(targetExam, uid);
  const [showCalc, setShowCalc] = useState(false);
  const [tab, setTab] = useState<'score' | 'history' | 'hiscore'>('score');
  const scoreTabRef = useRef<HTMLDivElement>(null);
  const [contentMinH, setContentMinH] = useState(0);
  const [nodesVisible, setNodesVisible] = useState(false);
  const visitedTabs = useRef(new Set<string>(['score']));

  // スコアタブ（calc非表示時）の高さを記録してタブ切替でサイズが変わらないようにする
  useLayoutEffect(() => {
    if (tab === 'score' && !showCalc && scoreTabRef.current) {
      setContentMinH(scoreTabRef.current.offsetHeight);
    }
  }, [tab, showCalc]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let id1: number, id2: number;
    id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setNodesVisible(true)); });
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
  }, []);

  useEffect(() => {
    visitedTabs.current.add(tab);
  }, [tab]);

  const weights = DOMAIN_WEIGHTS[targetExam] ?? domains.map(() => 100 / domains.length);
  const totalAllWeights = weights.reduce((s, w) => s + w, 0) || 100;
  const localDomainResults = readDomainResults(targetExam, uid);

  const tabs = [
    { key: 'score' as const, label: ja ? 'スコア内訳' : 'Breakdown' },
    { key: 'history' as const, label: ja ? 'スコア推移' : 'History' },
    { key: 'hiscore' as const, label: ja ? 'ハイスコア記録' : 'High Scores' },
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: isMobile ? '16px' : '20px 28px', width: '100%', maxWidth: 540, maxHeight: isMobile ? '75vh' : '60vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        {/* ヘッダー行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
              {ja ? '成績詳細' : 'Performance Detail'}
            </span>
            {tab === 'score' && (
              <button
                onClick={() => setShowCalc(v => !v)}
                style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${showCalc ? 'var(--color-primary)' : 'var(--color-border)'}`, background: showCalc ? 'var(--color-primary)' : 'transparent', color: showCalc ? '#fff' : 'var(--color-text-light)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}
                aria-label={ja ? '計算方法' : 'How calculated'}
              >?</button>
            )}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: isMobile ? 4 : 0, marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 0 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setShowCalc(false); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                flex: isMobile ? undefined : 1,
                textAlign: isMobile ? undefined : 'center',
                padding: '6px 14px', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
                color: tab === t.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
                borderBottom: `2px solid ${tab === t.key ? 'var(--color-primary)' : 'transparent'}`,
                marginBottom: -1, transition: 'color 0.15s',
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* 計算方法 */}
        {tab === 'score' && showCalc && (
          <div style={{ background: 'var(--color-bg-main)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 11, color: 'var(--color-text-sub)', lineHeight: 1.7 }}>
            <p style={{ margin: 0 }}>
              {ja
                ? '直近セッションの回答を集計。各ドメインの上限5問分で算出（5問未満は正答率×(N/5)で計算）。未演習ドメインは0点扱い。スコア = Σ(正答率 × N/5 × 出題比率%) × 1000'
                : 'Based on recent sessions. Score = Σ(accuracy × min(N,5)/5 × domain_weight%) × 1000. Fewer than 5 answers reduces the max contribution. Unpracticed domains count as 0.'}
            </p>
          </div>
        )}

        {/* タブコンテンツ */}
        <div style={{ minHeight: contentMinH || undefined }}>
        {tab === 'score' ? (
          <div ref={scoreTabRef}>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '-1px' }}>{estimatedScore ?? '—'}</span>
              <span style={{ fontSize: 13, color: 'var(--color-text-light)', marginLeft: 6 }}>/1000</span>
              {passScore !== null && (
                <span style={{ fontSize: 11, color: 'var(--color-text-light)', marginLeft: 10 }}>
                  {ja ? `合格ライン: ${passScore}` : `Pass: ${passScore}`}
                </span>
              )}
            </div>
            <div style={{ background: 'var(--color-bg-main)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 10, letterSpacing: '0.5px' }}>
                {ja ? 'ドメイン別スコア内訳' : 'Score by Domain'}
              </div>
              {domains.map((d, i) => {
                const fullMaxPts = Math.round(weights[i] / totalAllWeights * 1000);
                const label = lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;
                const serverResults = domainStats.find(s => tagIdMatches(s.tagId, targetExam, i))?.recentResults;
                const nodeResults = (serverResults ?? localDomainResults[String(i)] ?? []).slice(-5);
                const paddedNodes: (boolean | null)[] = [...Array(5 - nodeResults.length).fill(null), ...nodeResults];
                const correctInNodes = nodeResults.filter(v => !!v).length;
                const curPts = Math.round(correctInNodes / 5 * fullMaxPts);
                const hasPracticed = nodeResults.length > 0;
                const formulaStr = hasPracticed ? `${fullMaxPts}×${correctInNodes}/5` : null;
                return (
                  <div key={d} style={{ marginBottom: 12 }}>
                    {/* ドメイン名 */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0, marginBottom: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', flexShrink: 0 }}>D{i + 1}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
                    </div>
                    {/* ノード行 */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {paddedNodes.map((correct, ni) => (
                        <React.Fragment key={ni}>
                          {ni === 0
                            ? <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                                  {[1, 1.5, 2, 2.5, 3].map((dash, idx) => (
                                    <div key={idx} style={{ flex: 1, height: 1.5, background: `repeating-linear-gradient(to right, #AEBCBD 0px, #AEBCBD ${dash}px, transparent ${dash}px, transparent ${dash + 3}px)` }} />
                                  ))}
                                </div>
                                <div style={{ flex: 1, height: 1.5, background: '#AEBCBD' }} />
                              </div>
                            : <div style={{ flex: 1, height: 1.5, background: '#AEBCBD' }} />
                          }
                          <div style={{
                            width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                            border: `1.5px solid ${correct === null ? '#AEBCBD' : correct ? 'var(--color-success)' : 'var(--color-danger)'}`,
                            background: correct === null ? 'transparent' : correct ? 'var(--color-feedback-correct-bg)' : 'var(--color-feedback-incorrect-bg)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, fontWeight: 700, lineHeight: 1,
                            color: correct === null ? '#AEBCBD' : correct ? 'var(--color-success)' : 'var(--color-danger)',
                            opacity: nodesVisible ? 1 : 0,
                            transform: nodesVisible ? 'scale(1)' : 'scale(0.3)',
                            transition: 'opacity 0.2s, transform 0.2s',
                            transitionDelay: `${ni * 70}ms`,
                          }}>
                            {correct === null ? <span style={{ fontSize: 8, lineHeight: 1 }}>−</span>
                              : correct
                              ? <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                              : <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            }
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                    {/* 計算式=点数/合計（右揃え・横並び） */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', marginTop: 3 }}>
                      {formulaStr
                        ? <span style={{ fontSize: 9, color: 'var(--color-text-light)' }}>
                            {formulaStr} = <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)' }}>{curPts}</span> /{fullMaxPts}
                          </span>
                        : <span style={{ fontSize: 9, color: 'var(--color-text-light)' }}>—</span>
                      }
                    </div>
                  </div>
                );
              })}
              <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)' }}>{ja ? '合計' : 'Total'}</span>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-primary)' }}>{estimatedScore ?? 0}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}> / 1000</span>
                </div>
              </div>
            </div>
          </div>
        ) : tab === 'history' ? (
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
                {ja ? 'セッション別推移（直近5回）' : 'Per-Session Trend (last 5)'}
              </div>
              <SessionScoreChart data={sessionHistory} passScore={passScore} lang={lang} animate={!visitedTabs.current.has('history')} />
            </div>
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
                {ja ? '日次推移' : 'Daily Trend'}
              </div>
              <ScoreLineChart data={history} passScore={passScore} lang={lang} animate={!visitedTabs.current.has('history')} />
            </div>
          </div>
        ) : (
          (() => {
            const hiscoreSource = sessionLog.length > 0 ? sessionLog : history;
            const top5 = [...hiscoreSource].sort((a, b) => b.score - a.score).slice(0, 5);
            if (top5.length === 0) {
              return (
                <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: 'var(--color-text-light)', padding: '24px 0' }}>
                  {ja ? 'まだデータがありません' : 'No data yet'}
                </p>
              );
            }
            const medalEmoji = ['🥇', '🥈', '🥉'];
            return (
              <>
                <style>{`
                  @keyframes hiscore-slide-up {
                    from { opacity: 0; transform: translateY(18px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {top5.map((entry, rank) => {
                  const medalColor = rank === 0 ? '#F59E0B' : rank === 1 ? '#9CA3AF' : rank === 2 ? '#B45309' : 'var(--color-text-light)';
                  const isPass = passScore !== null && entry.score >= passScore;
                  const delay = (top5.length - 1 - rank) * 0.08;
                  return (
                    <div key={entry.date} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px',
                      background: rank === 0 ? 'rgba(245,158,11,0.06)' : 'var(--color-bg-main)',
                      borderRadius: 8,
                      border: rank === 0 ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                      ...(visitedTabs.current.has('hiscore')
                        ? {}
                        : { animation: `hiscore-slide-up 0.35s ease both`, animationDelay: `${delay}s` }),
                    }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: medalColor, minWidth: 24, textAlign: 'center' }}>
                        {rank < 3 ? medalEmoji[rank] : `${rank + 1}`}
                      </span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: isPass ? 'var(--color-success)' : 'var(--color-primary)', fontVariantNumeric: 'tabular-nums', minWidth: 52 }}>
                        {entry.score}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-light)', flex: 1 }}>
                        {entry.date}
                      </span>
                      {passScore !== null && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, flexShrink: 0,
                          background: isPass ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                          color: isPass ? 'var(--color-success)' : 'var(--color-danger)',
                        }}>
                          {isPass ? (ja ? '合格圏' : 'Pass') : (ja ? '未達' : 'Fail')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
            );
          })()
        )}
        </div>
      </div>
    </div>
  );
}

// ── 予想スコア詳細モーダル ──────────────────────────────────────
function ScoreDetailModal({ targetExam, estimatedScore, passScore, lang, uid, onClose }: {
  targetExam: string; estimatedScore: number | null; passScore: number | null; lang: string; uid: string; onClose: () => void;
}) {
  const ja = lang === 'ja';
  const [showTip, setShowTip] = useState(false);
  const history = readScoreHistory(targetExam, uid);
  const sessionHistory = readSessionScoreHistory(targetExam, uid);
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
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
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
            {ja ? 'セッション別推移（直近5回）' : 'Per-Session Trend (last 5)'}
          </div>
          <SessionScoreChart data={sessionHistory} passScore={passScore} lang={lang} />
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 8 }}>
              {ja ? '日次推移' : 'Daily Trend'}
            </div>
            <ScoreLineChart data={history} passScore={passScore} lang={lang} />
          </div>
        </div>

        <div style={{ background: 'var(--color-bg-main)', borderRadius: 8, padding: '8px 12px' }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setShowTip(v => !v)}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub)' }}>
              {ja ? '計算方法' : 'How calculated'}
            </span>
            <span style={{ color: 'var(--color-text-light)', display: 'flex' }}>{showTip ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}</span>
          </div>
          {showTip && (
            <p style={{ fontSize: 11, color: 'var(--color-text-sub)', margin: '8px 0 0', lineHeight: 1.7 }}>
              {ja
                ? '直近セッションの回答を集計。各ドメインの上限5問分で算出（5問未満は正答率×(N/5)で計算）。未演習は0点扱い。スコア = Σ(正答率 × N/5 × 出題比率%) × 1000'
                : 'Based on recent sessions. Score = Σ(accuracy × min(N,5)/5 × domain_weight%) × 1000. <5 answers reduces max contribution. Unpracticed domains = 0.'}
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
  const isMobile = window.innerWidth < 768;
  const domains = EXAM_DOMAINS[targetExam] ?? [];
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '20px 24px', width: '100%', maxWidth: 480, maxHeight: isMobile ? '75vh' : '60vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
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
                  <div style={{ width: `${pct}%`, minWidth: pct === 0 ? 3 : undefined, height: '100%', borderRadius: 3, background: 'var(--bar-gradient-primary)', transformOrigin: 'left center', animation: `growWidth 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 40}ms both` }} />
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
// ── オンボーディング ────────────────────────────────────────────
const OB_LEVEL: Record<string, string> = {
  CLF: 'Foundational', AIF: 'Foundational',
  SAA: 'Associate', DVA: 'Associate', SOA: 'Associate', DEA: 'Associate', MLA: 'Associate',
  SAP: 'Professional', DOP: 'Professional', AIP: 'Professional',
  ANS: 'Specialty', SCS: 'Specialty',
};
const OB_LEVEL_COLOR: Record<string, string> = {
  Foundational: '#6b9e3a', Associate: '#006CE0', Professional: '#8b5cf6', Specialty: '#e67e22',
};
const OB_SHORT: Record<string, string> = {
  CLF: 'Cloud Practitioner', AIF: 'AI Practitioner',
  SAA: 'Solutions Architect', DVA: 'Developer',
  SOA: 'CloudOps Engineer', DEA: 'Data Engineer', MLA: 'ML Engineer',
  SAP: 'Solutions Architect Pro', DOP: 'DevOps Engineer', AIP: 'Generative AI Dev',
  ANS: 'Advanced Networking', SCS: 'Security',
};

function OnboardingModal({ lang, uid, onComplete }: {
  lang: string; uid: string;
  onComplete: (exam: string) => void;
}) {
  const ja = lang === 'ja';
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSelect = (exam: string) => {
    localStorage.setItem(`targetExam_${uid}`, exam);
    window.dispatchEvent(new CustomEvent('targetExamChanged', { detail: exam }));
    onComplete(exam);
  };

  const levels = ['Foundational', 'Associate', 'Professional', 'Specialty'] as const;
  const grouped = levels.map(lv => ({
    lv,
    exams: EXAM_TYPES.filter(e => OB_LEVEL[e] === lv),
  }));

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9800, background: 'var(--color-bg-main)', display: 'flex', flexDirection: 'column' }}>

      {/* ── ヘッダー（アカウントボタンのみ） ── */}
      <header style={{ height: 56, minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 var(--spacing-lg)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-white)', flexShrink: 0 }}>
        <button
          onClick={() => navigate(user ? '/account' : '/login')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: user ? 'var(--color-primary-light)' : 'transparent', border: '1px solid var(--color-border)', borderRadius: '50%', cursor: 'pointer', color: user ? 'var(--color-primary)' : 'var(--color-text-sub)', width: 36, height: 36, padding: 0, fontSize: 14, fontWeight: 700 }}
        >
          {user?.email ? user.email[0].toUpperCase() : <IconUser />}
        </button>
      </header>

      {/* ── 資格選択 ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px 24px 0', maxWidth: 560, margin: '0 auto', width: '100%', paddingBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-main)', margin: '0 0 6px' }}>
            {ja ? '目指すAWS資格を選んでください' : 'Select your target exam'}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-sub)', margin: '0 0 20px' }}>
            {ja ? '後からホーム画面でいつでも変更できます' : 'You can change this anytime on the home screen'}
          </p>

          {grouped.map(({ lv, exams }) => (
            <div key={lv} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: OB_LEVEL_COLOR[lv], marginBottom: 8 }}>{lv}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {exams.map(exam => {
                  const cfg = EXAM_CONFIGS[exam];
                  return (
                    <button
                      key={exam}
                      onClick={() => handleSelect(exam)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: 'var(--color-bg-card)', border: '2px solid var(--color-border)', transition: 'border-color .15s, background .15s' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-main)' }}>{cfg.examCode}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{OB_SHORT[exam]}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>,
    document.body
  );
}


type DailyService = {
  serviceId: string; name: string; shortName?: string; category?: string;
  icon: string; description: string; trivia?: string; docUrl?: string;
};

function resolveServiceIcon(service: DailyService): string {
  const icon = service.icon ?? '';
  if (icon.startsWith('/') || icon.startsWith('http') || isServiceIconKey(icon)) return icon;
  const lower = service.name.toLowerCase();
  for (const cat of CATALOG) {
    const entry = cat.services.find(s => s.name.toLowerCase() === lower);
    if (entry?.icon) return entry.icon;
  }
  return icon;
}

function saveToEncyclopedia(svc: DailyService, uid: string) {
  try {
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const stored = JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}');
    stored[svc.serviceId] = svc;
    localStorage.setItem('encyclopediaServices', JSON.stringify(stored));

    const unlocked = JSON.parse(localStorage.getItem(`encyclopediaUnlocked_${uid}`) ?? '{}');
    unlocked[svc.serviceId] = jstDate;
    // カタログのserviceIdsとも照合してIDを統一（UUID vs svc-xxx-N 不一致を解消）
    const normName = (n: string) => n.toLowerCase().replace(/^amazon\s+/, '').replace(/^aws\s+/, '').trim();
    const normSvc = normName(svc.name);
    for (const cat of CATALOG) {
      for (const entry of cat.services) {
        if (
          entry.serviceIds?.includes(svc.serviceId) ||
          normName(entry.name) === normSvc
        ) {
          for (const catId of (entry.serviceIds ?? [])) {
            unlocked[catId] = jstDate;
          }
          break;
        }
      }
    }
    localStorage.setItem(`encyclopediaUnlocked_${uid}`, JSON.stringify(unlocked));

    if (localStorage.getItem(`encyclopediaUnlockDate_${uid}`) !== jstDate) {
      localStorage.setItem(`encyclopediaUnlockDate_${uid}`, jstDate);
    }

    localStorage.setItem(`encyclopediaTodayServiceId_${uid}`, svc.serviceId);

    window.dispatchEvent(new CustomEvent('encyclopediaUpdated'));
  } catch {}
}

// forceUpload=true: ユーザーの明示的な解放操作（handleReveal）からの呼び出し。
// 管理者リセット後でも新しい解放はサーバーに保存する。
// forceUpload=false（デフォルト）: マウント時の自動同期。サーバーが空なら
// 管理者リセット後とみなしてローカルも消去し再アップロードしない。
function syncEncyclopediaToServer(userId: string, forceUpload = false): void {
  const uid = userId;
  try {
    const local: Record<string, string> = JSON.parse(localStorage.getItem(`encyclopediaUnlocked_${uid}`) ?? '{}');
    const unlockDate = localStorage.getItem(`encyclopediaUnlockDate_${uid}`);
    const todayServiceId = localStorage.getItem(`encyclopediaTodayServiceId_${uid}`);
    fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks?userId=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : { unlocks: {} })
      .then(data => {
        const server: Record<string, string> = data.unlocks ?? {};
        const localUnlockDate = localStorage.getItem(`encyclopediaUnlockDate_${uid}`);
        const jstDateNow = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        if (!forceUpload && Object.keys(server).length === 0 && Object.keys(local).length > 0 && localUnlockDate !== jstDateNow) {
          localStorage.setItem(`encyclopediaUnlocked_${uid}`, '{}');
          localStorage.removeItem(`encyclopediaUnlockDate_${uid}`);
          localStorage.removeItem(`encyclopediaTodayServiceId_${uid}`);
          window.dispatchEvent(new CustomEvent('encyclopediaUpdated'));
          return;
        }
        // サーバー優先マージ（ローカルに新規解放分があれば残す）
        const merged: Record<string, string> = { ...local, ...server };
        localStorage.setItem(`encyclopediaUnlocked_${uid}`, JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent('encyclopediaUpdated'));
        // POST 失敗時は1回リトライ（3秒後）
        const body = JSON.stringify({ userId, unlocks: merged, unlockDate, todayServiceId });
        const doPost = (retriesLeft: number) => {
          fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
          }).then(r => { if (!r.ok && retriesLeft > 0) setTimeout(() => doPost(retriesLeft - 1), 3000); })
            .catch(() => { if (retriesLeft > 0) setTimeout(() => doPost(retriesLeft - 1), 3000); });
        };
        doPost(1);
      })
      .catch(() => {});
  } catch {}
}

function TodayServiceSection({ lang, userId, onNavigateEncyclopedia, onReveal, isMobile }: {
  lang: string; userId?: string;
  onNavigateEncyclopedia: () => void;
  onReveal: (svc: DailyService) => void;
  isMobile: boolean;
}) {
  const [service, setService] = useState<DailyService | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [rerolledService, setRerolledService] = useState<DailyService | null>(null);
  const [rerolling, setRerolling] = useState(false);
  const [rerollError, setRerollError] = useState(false);

  const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  useEffect(() => {
    const uid = userId ?? 'guest';
    const jstDate = jstToday();

    const localRevealed = localStorage.getItem(`encyclopediaUnlockDate_${uid}`) === jstDate;
    if (localRevealed) setRevealed(true);

    // 再抽選キャッシュの読み込み（localStorage に保存してリロード後も維持）
    const rerollCacheKey = `daily_service_reroll_${uid}_${jstDate}`;
    const cachedReroll = getCachedPersist<DailyService>(rerollCacheKey);
    if (cachedReroll) {
      setRerolledService({ ...cachedReroll, icon: resolveServiceIcon(cachedReroll) });
    }

    const fetchService = (alreadyRevealed: boolean) => {
      const cacheKey = `daily_service_${uid}_${jstDate}`;
      const cached = getCached<DailyService>(cacheKey);
      if (cached !== null) {
        const resolved = { ...cached, icon: resolveServiceIcon(cached) };
        setService(resolved);
        setLoading(false);
        if (alreadyRevealed) {
          saveToEncyclopedia(resolved, uid);
          if (userId) syncEncyclopediaToServer(userId);
        }
        return;
      }
      const apiUrl = userId
        ? `${API_ENDPOINT}/daily-service?userId=${encodeURIComponent(userId)}`
        : `${API_ENDPOINT}/daily-service`;
      fetch(apiUrl)
        .then(r => r.json())
        .then(d => {
          const raw = d.service ?? null;
          const s = raw ? { ...raw, icon: resolveServiceIcon(raw) } : null;
          // サーバーが alreadyUnlocked=true を返した場合（別デバイスで解放済み）
          const serverUnlocked = !alreadyRevealed && !!d.alreadyUnlocked;
          const isRevealed = alreadyRevealed || serverUnlocked;
          if (serverUnlocked) {
            localStorage.setItem(`encyclopediaUnlockDate_${uid}`, jstDate);
            setRevealed(true);
          }
          if (s) {
            setCached(cacheKey, s, 60 * 60 * 1000);
            if (isRevealed) {
              saveToEncyclopedia(s, uid);
              if (userId) syncEncyclopediaToServer(userId);
            }
          }
          setService(s);
        })
        .catch(() => setService(null))
        .finally(() => setLoading(false));
    };

    if (!localRevealed && userId) {
      // ローカルで未解放の場合、サービス取得と同時にサーバーの解放状態を確認
      // （fetchService 内で alreadyUnlocked を処理するため単純に fetchService を呼ぶ）
      fetchService(false);
    } else {
      fetchService(localRevealed);
    }
  }, [userId]);

  const handleReroll = async () => {
    if (!userId || !service || rerolling) return;
    setRerollError(false);
    const uid = userId;
    const jstDate = jstToday();
    const currentPts = getPoints(uid);
    if (currentPts < 30) { setRerollError(true); return; }
    setRerolling(true);
    try {
      const seed = Math.random().toString(36).slice(2);
      const url = `${API_ENDPOINT}/daily-service?userId=${encodeURIComponent(userId)}&rerollSeed=${encodeURIComponent(seed)}`;
      const res = await fetch(url);
      const data = await res.json();
      const raw = data.service ?? null;
      if (!raw) { setRerolling(false); return; }
      const s: DailyService = { ...raw, icon: resolveServiceIcon(raw) };
      deductPoints(uid, 30);
      saveToEncyclopedia(s, uid);
      syncEncyclopediaToServer(userId, true);
      const rerollCacheKey = `daily_service_reroll_${uid}_${jstDate}`;
      setCachedPersist(rerollCacheKey, s, 24 * 60 * 60 * 1000);
      setRerolledService(s);
      onReveal(s);
    } catch (err) {
      console.error(err);
    } finally {
      setRerolling(false);
    }
  };

  const handleReveal = () => {
    const svc = rerolledService ?? service;
    if (!svc || revealed) return;
    const uid = userId ?? 'guest';
    saveToEncyclopedia(svc, uid);
    if (userId) syncEncyclopediaToServer(userId, true);
    setRevealed(true);
    onReveal(svc);
  };

  const calIcon = <IconCalendarNotebook size={13} />;

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

  // ── シークレット状態（未タップ） ──
  if (!revealed && service) return (
    <>
      <style>{`
        @keyframes ds-pulse {
          0%,100% { box-shadow: 0 0 14px 2px rgba(82,130,255,.3), 0 0 40px 6px rgba(82,130,255,.1); }
          50%      { box-shadow: 0 0 26px 6px rgba(82,130,255,.6), 0 0 60px 14px rgba(82,130,255,.22); }
        }
        @keyframes ds-float {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes ds-tap {
          0%,100% { opacity: 1; transform: translateY(0); }
          50%      { opacity: .65; transform: translateY(-5px); }
        }
      `}</style>
      <div
        onClick={handleReveal}
        style={{
          marginBottom: 'var(--spacing-md)',
          borderRadius: 'var(--border-radius-md)',
          background: 'linear-gradient(140deg,#1a1a2e 0%,#16213e 55%,#0f3460 100%)',
          border: '2px solid rgba(82,130,255,.55)',
          padding: 'var(--spacing-md)',
          cursor: 'pointer',
          animation: 'ds-pulse 2.2s ease-in-out infinite',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{ color: 'rgba(255,255,255,.7)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <IconCalendarNotebook size={13} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'rgba(255,255,255,.85)' }}>
            {lang === 'ja' ? '日めくりAWSサービス' : 'Daily AWS Service'}
          </span>
        </div>
        {/* ? アイコン */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 4px' }}>
          <div style={{
            fontSize: 52, fontWeight: 900, lineHeight: 1, color: 'white',
            textShadow: '0 4px 24px rgba(255,255,255,.25)',
            filter: 'drop-shadow(0 0 12px rgba(255,255,255,.2))',
            animation: 'ds-float 3.2s ease-in-out infinite',
          }}>?</div>
          <div style={{
            marginTop: 10, fontSize: 13, fontWeight: 600,
            color: 'rgba(255,255,255,.85)',
            animation: 'ds-tap 1.5s ease-in-out infinite',
            textShadow: '0 2px 8px rgba(0,0,0,.5)',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {isMobile ? <IconPointer size={16} /> : <IconMousePointerClick size={16} />}
              {lang === 'ja'
                ? (isMobile ? 'タップして本日のサービスを解放' : 'クリックして本日のサービスを解放')
                : (isMobile ? "Tap to reveal today's service" : "Click to reveal today's service")}
            </span>
          </div>
        </div>
      </div>
    </>
  );

  if (!service) return null;

  const displayService = rerolledService ?? service;
  const iconEl = <ServiceIconImg icon={displayService.icon} name={displayService.name} size={44} />;

  return (
    <Card padding="var(--spacing-md)" style={{ marginBottom: 'var(--spacing-md)', cursor: 'pointer' }} onClick={onNavigateEncyclopedia}>
      {/* ヘッダー行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {calIcon}
        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
          {lang === 'ja' ? '日めくりAWSサービス' : 'Daily AWS Service'}
        </span>
        {displayService.category && (
          <span style={{ marginLeft: 2, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--border-radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
            {displayService.category}
          </span>
        )}
        {revealed && userId && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {rerollError && (
              <span style={{ fontSize: 10, color: 'var(--color-danger)', whiteSpace: 'nowrap' }}>
                {lang === 'ja' ? 'P不足' : 'Not enough P'}
              </span>
            )}
            <button
              onClick={e => { e.stopPropagation(); handleReroll(); }}
              disabled={rerolling}
              title={lang === 'ja' ? '再抽選 (-30p)' : 'Reroll (-30p)'}
              style={{
                width: 35, height: 35, borderRadius: '50%',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: rerolling ? 'var(--color-text-light)' : '#009E9E',
                cursor: rerolling ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: rerolling ? 0.5 : 1, flexShrink: 0,
              }}
            >
              {rerolling
                ? <div className="sherpa-spinner" style={{ width: 11, height: 11, borderWidth: 2, flexShrink: 0 }} />
                : <IconSparkles size={12} />
              }
            </button>
          </div>
        )}
      </div>

      {/* アイコン＋名前 横並び */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {iconEl}
        </div>
        <div>
          <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-text-main)' }}>{displayService.name}</span>
        </div>
      </div>

      {/* 説明文: アイコン行の下から全幅 */}
      <p style={{ margin: '0 0 8px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.7, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
        {displayService.description}
      </p>

      {displayService.trivia && (
        <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
          <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', flexShrink: 0 }}><IconBean size={14} /></span>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{displayService.trivia.replace(/^🌱\s*/, '')}</span>
        </div>
      )}

      {displayService.docUrl && (
        <a href={displayService.docUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
          {lang === 'ja' ? '公式ページを見る →' : 'Official page →'}
        </a>
      )}

    </Card>
  );
}

// ── メインコンポーネント ────────────────────────────────────────
const FOCUSED_UNLOCK_THRESHOLD = 30;
function loadQuickPrefs(uid: string) {
  try { return JSON.parse(localStorage.getItem(`quickExercisePrefs_${uid}`) ?? '{}'); } catch { return {}; }
}
function loadFocusedPrefs(uid: string) {
  try { return JSON.parse(localStorage.getItem(`focusedExercisePrefs_${uid}`) ?? '{}'); } catch { return {}; }
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

// 管理者リセット後にデータ系のローカルキーを全消去する（設定・環境設定は保持）
function clearUserData(uid: string) {
  const KEEP = new Set([
    `lang_${uid}`, `theme_${uid}`, `sidebarOpen_${uid}`,
    `targetExam_${uid}`, `lastQuickMode_${uid}`,
    `quickExercisePrefs_${uid}`, `focusedExercisePrefs_${uid}`,
    `sherpaExerciseHint_${uid}`, `sherpaExamHint_${uid}`, `sherpaStatsHint_${uid}`,
    `lastReset_${uid}`,
  ]);
  const suffix = `_${uid}`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (
      (!KEEP.has(key) && key.endsWith(suffix)) ||
      key.startsWith(`qstats_${uid}_`) ||
      key.startsWith(`daily_service_${uid}_`) ||
      (key.startsWith('dailyQCount_') && key.includes(`_${uid}_`)) ||
      (key.startsWith('dailyGoalReward_') && key.includes(`_${uid}_`))
    ) toRemove.push(key);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  sessionStorage.removeItem(`_ts_ustats_${uid}`);
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const ja = lang === 'ja';
  const uid = user?.userId ?? 'guest';

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [revealService, setRevealService] = useState<DailyService | null>(null);
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(`targetExam_${uid}`));
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickLoadPct, setQuickLoadPct] = useState(0);

  const readQuickDraft = () => {
    try { return JSON.parse(localStorage.getItem(`quickExerciseDraft_${uid}`) ?? 'null'); } catch { return null; }
  };
  const readFocusedDraft = () => {
    try { return JSON.parse(localStorage.getItem(`focusedExerciseDraft_${uid}`) ?? 'null'); } catch { return null; }
  };
  const [quickDraft, setQuickDraft] = useState<any>(() => readQuickDraft());
  const [focusedDraft, setFocusedDraft] = useState<any>(() => readFocusedDraft());
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [showWebQuickMenu, setShowWebQuickMenu] = useState(false);
  const [showFocusedMenu, setShowFocusedMenu] = useState(false);
  const [focusedLoading, setFocusedLoading] = useState(false);
  const [focusedLoadPct, setFocusedLoadPct] = useState(0);
  const [lastMode, setLastMode] = useState<'quick' | 'focused'>(() => (localStorage.getItem(`lastQuickMode_${uid}`) as 'quick' | 'focused') ?? 'quick');
  const [answeredCount, setAnsweredCount] = useState(0);
  const [answeredCountReady, setAnsweredCountReady] = useState(false);
  const [qRefreshTick, setQRefreshTick] = useState(0); // セッション完了で +1 → useEffect 再実行
  const [savedQuick, setSavedQuick] = useState(false);
  const [savedFocused, setSavedFocused] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState<Record<string, any>>({});
  const [showFocusedModal, setShowFocusedModal] = useState(false);
  const [draftFocusedPrefs, setDraftFocusedPrefs] = useState<Record<string, any>>({});
  const [showCombinedDetail, setShowCombinedDetail] = useState(false);
  const [serverScoreHistory, setServerScoreHistory] = useState<ScoreEntry[] | null>(null);
  const [serverSessionHistory, setServerSessionHistory] = useState<number[] | null>(null);
  const [serverSessionScoreLog, setServerSessionScoreLog] = useState<ScoreEntry[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);


  useEffect(() => {
    if (authLoading) return;
    const saved = localStorage.getItem(`targetExam_${uid}`);
    if (saved !== null) {
      setTargetExam(saved);
      setShowOnboarding(false);
    } else {
      setShowOnboarding(true);
    }
  }, [uid, authLoading]);

  useEffect(() => {
    if (authLoading) return;
    const saved = localStorage.getItem(`lastQuickMode_${uid}`) as 'quick' | 'focused' | null;
    if (saved === 'quick' || saved === 'focused') setLastMode(saved);
  }, [uid, authLoading]);

  useEffect(() => {
    const handler = (e: Event) => setTargetExam((e as CustomEvent).detail);
    window.addEventListener('targetExamChanged', handler);
    return () => window.removeEventListener('targetExamChanged', handler);
  }, []);

  // ── タイプAプリフェッチ: targetExam が変化したとき（キャッシュ未存在時のみ生成） ──
  useEffect(() => {
    if (!targetExam) return;
    if (!getPrefetchA(targetExam)) prefetchTypeA(targetExam, uid);
  }, [targetExam, uid]);

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

      // 管理者リセット検知: resetAt が更新されていたらローカルデータを消去してリロード
      if (d.resetAt) {
        const lastReset = localStorage.getItem(`lastReset_${userId}`);
        if (!lastReset || d.resetAt > lastReset) {
          localStorage.setItem(`lastReset_${userId}`, d.resetAt);
          clearUserData(userId);
          window.location.reload();
          return;
        }
      }

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
    if (!user) { if (!authLoading) { setDomainStats([]); setLastUpdated(null); } return; }
    const cached = getCached<DomainStat[]>(`ustats_${user.userId}`);
    const tsRaw = sessionStorage.getItem(TS_KEY(user.userId));
    if (tsRaw) setLastUpdated(new Date(parseInt(tsRaw)));

    // セッション完了直後フラグ: どちらのケースでも確認
    const flagRaw = localStorage.getItem(`postSessionRefresh_${user.userId}`);
    const isPostSession = !!flagRaw && Date.now() - parseInt(flagRaw) < 60000;
    if (flagRaw) localStorage.removeItem(`postSessionRefresh_${user.userId}`);

    if (cached !== null) {
      setDomainStats(cached);
      // セッション直後なら遅延バックグラウンド更新（楽観的キャッシュが古いデータを上書きしないよう少し待つ）
      doFetchStats(user.userId, true, isPostSession ? 2000 : 0);
    } else {
      doFetchStats(user.userId, false, isPostSession ? 2000 : 0);
    }
    return () => { abortRef.current?.abort(); };
  }, [user?.userId, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !targetExam) { setServerScoreHistory(null); setServerSessionHistory(null); setServerSessionScoreLog(null); return; }
    // セッション完了直後かどうかを事前にチェック（非同期GETと追記useEffectの競合を防ぐ）
    const addKey = `sessionScoreAdd_${targetExam}_${user.userId}`;
    const hasPendingSession = !!localStorage.getItem(addKey);
    fetch(`${API_ENDPOINT}/users/me/score-history?userId=${user.userId}&examType=${targetExam}`)
      .then(r => r.json())
      .then(d => {
        const serverSH: ScoreEntry[] = d.scoreHistory ?? [];
        const serverSSH: number[] = d.sessionScoreHistory ?? [];
        const serverSSL: ScoreEntry[] = d.sessionScoreLog ?? [];
        // マイグレーション: サーバーが空でローカルにデータがあれば、サーバーへアップロード
        const localSH = readScoreHistory(targetExam, user.userId);
        const localSSH = readSessionScoreHistory(targetExam, user.userId);
        const localSSL = readSessionScoreLog(targetExam, user.userId);
        const uploadSH = serverSH.length === 0 && localSH.length > 0 ? localSH : serverSH;
        const uploadSSH = serverSSH.length === 0 && localSSH.length > 0 ? localSSH : serverSSH;
        const uploadSSL = serverSSL.length === 0 && localSSL.length > 0 ? localSSL : serverSSL;
        if (uploadSH !== serverSH || uploadSSH !== serverSSH || uploadSSL !== serverSSL) {
          fetch(`${API_ENDPOINT}/users/me/score-history`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.userId, examType: targetExam, scoreHistory: uploadSH, sessionScoreHistory: uploadSSH, sessionScoreLog: uploadSSL }),
          }).catch(() => {});
        }
        // サーバーデータが localStorage より多い場合は localStorage に書き込む。
        // 別デバイスや localStorage クリア後にセッション完了 effect が空ログをベースに
        // PUT してサーバーの全履歴を上書きしてしまうバグを防ぐ。
        if (uploadSSL.length > localSSL.length) {
          try { localStorage.setItem(`score_session_log_${targetExam}_${user.userId}`, JSON.stringify(uploadSSL)); } catch {}
        }
        if (uploadSSH.length > localSSH.length) {
          try { localStorage.setItem(`score_session_history_${targetExam}_${user.userId}`, JSON.stringify(uploadSSH)); } catch {}
        }
        setServerScoreHistory(uploadSH);
        // セッション完了フラグがある場合、sessionScoreHistory は後続のuseEffectで追記されるため上書きしない
        if (!hasPendingSession) {
          setServerSessionHistory(uploadSSH);
          setServerSessionScoreLog(uploadSSL);
        }
      })
      .catch(() => { setServerScoreHistory(null); setServerSessionHistory(null); setServerSessionScoreLog(null); });
  }, [user, targetExam]); // eslint-disable-line react-hooks/exhaustive-deps

  // セッション完了イベントで qRefreshTick を更新 → 下の useEffect を再実行
  useEffect(() => {
    const h = () => setQRefreshTick(t => t + 1);
    window.addEventListener('qstatsRefresh', h);
    return () => window.removeEventListener('qstatsRefresh', h);
  }, []);

  useEffect(() => {
    if (!user || !targetExam) { setAnsweredCount(0); setAnsweredCountReady(true); return; }
    fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${user.userId}&examType=${targetExam}`)
      .then(r => r.json())
      .then(d => setAnsweredCount(d.answeredCount ?? 0))
      .catch(() => {})
      .finally(() => setAnsweredCountReady(true));
  }, [user, targetExam, qRefreshTick]);

  // ── 予想スコア計算（サーバー統計優先、オフライン/ゲスト時はローカル履歴）──
  const domainNodeResultsMap = useMemo(() => {
    if (!targetExam) return {} as Record<string, boolean[]>;
    const localDR = readDomainResults(targetExam, uid);
    const result: Record<string, boolean[]> = {};
    (EXAM_DOMAINS[targetExam] ?? []).forEach((d, idx) => {
      const serverResults = domainStats.find(s => tagIdMatches(s.tagId, targetExam, idx))?.recentResults;
      result[d] = (serverResults ?? localDR[String(idx)] ?? []).slice(-5);
    });
    return result;
  }, [targetExam, domainStats, uid]);

  const estimatedScore = useMemo(() => {
    if (!targetExam) return null;
    const domainList = EXAM_DOMAINS[targetExam] ?? [];
    const weights = DOMAIN_WEIGHTS[targetExam] ?? domainList.map(() => 100 / domainList.length);
    const totalAllWeights = weights.reduce((s, w) => s + w, 0);
    if (totalAllWeights === 0) return null;

    let weightedSum = 0, hasAnyData = false;
    for (let i = 0; i < domainList.length; i++) {
      const nodeResults = domainNodeResultsMap[domainList[i]] ?? [];
      if (nodeResults.length === 0) continue;
      const correctInNodes = nodeResults.filter((v: boolean) => !!v).length;
      weightedSum += (correctInNodes / 5) * weights[i];
      hasAnyData = true;
    }
    if (!hasAnyData) return null;
    return Math.round((weightedSum / totalAllWeights) * 1000);
  }, [targetExam, domainNodeResultsMap]);

  const focusedUnlocked = !!user && answeredCount >= FOCUSED_UNLOCK_THRESHOLD;
  const focusedUnlockedCached = localStorage.getItem(`focusedUnlockedCache_${uid}`) === '1';
  const effectiveFocusedUnlocked = !user ? false : answeredCountReady ? focusedUnlocked : focusedUnlockedCached;
  const primaryMode: 'quick' | 'focused' = lastMode === 'focused' && effectiveFocusedUnlocked ? 'focused' : 'quick';

  useEffect(() => {
    if (answeredCountReady) {
      localStorage.setItem(`focusedUnlockedCache_${uid}`, focusedUnlocked ? '1' : '0');
    }
  }, [answeredCountReady, focusedUnlocked, uid]);

  const passScore = targetExam ? PASS_SCORES[targetExam] : null;

  // 前日比
  const jstDate = useMemo(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), []);

  // 目標演習量パネル用
  const dailyGoal = useMemo(() =>
    Math.max(1, parseInt(localStorage.getItem(`dailyGoal_${uid}`) ?? '10', 10))
  , [uid]);
  // 目標資格のみの当日演習量（マイページと同じく目標資格基準で表示）
  const [dailyCount, setDailyCount] = useState(() =>
    targetExam ? parseInt(localStorage.getItem(`dailyQCount_${targetExam}_${uid}_${jstDate}`) ?? '0', 10) : 0
  );
  useEffect(() => {
    setDailyCount(targetExam ? parseInt(localStorage.getItem(`dailyQCount_${targetExam}_${uid}_${jstDate}`) ?? '0', 10) : 0);
  }, [targetExam, uid, jstDate, domainStats]);

  const [prevScore, setPrevScore] = useState<number | null>(null);

  useEffect(() => {
    if (!targetExam || estimatedScore === null) { setPrevScore(null); return; }
    const prevKey = `score_prev_${targetExam}_${uid}`;
    const raw = localStorage.getItem(prevKey);
    setPrevScore(raw ? parseInt(raw, 10) : null);

    // スコア履歴に追記（折れ線グラフ用）
    const histKey = `score_history_${targetExam}_${uid}`;
    let scoreHist: ScoreEntry[] = [];
    try { scoreHist = JSON.parse(localStorage.getItem(histKey) ?? '[]'); } catch {}
    const last = scoreHist[scoreHist.length - 1];
    if (last?.date === jstDate) { last.score = estimatedScore; }
    else { scoreHist.push({ date: jstDate, score: estimatedScore }); }
    const newHist = scoreHist.slice(-30);
    localStorage.setItem(histKey, JSON.stringify(newHist));
    setServerScoreHistory(newHist);
    if (user) {
      fetch(`${API_ENDPOINT}/users/me/score-history`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, examType: targetExam, scoreHistory: newHist }),
      }).catch(() => {});
    }
  }, [targetExam, estimatedScore, jstDate, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // セッション完了後にセッション別スコア履歴を追記
  useEffect(() => {
    if (!targetExam || estimatedScore === null) return;
    const addKey = `sessionScoreAdd_${targetExam}_${uid}`;
    if (!localStorage.getItem(addKey)) return;
    localStorage.removeItem(addKey);
    const jstNow = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    // 直近5件のセッションスコア（既存）
    const sessionHistKey = `score_session_history_${targetExam}_${uid}`;
    let hist: number[] = [];
    try { hist = JSON.parse(localStorage.getItem(sessionHistKey) ?? '[]'); } catch {}
    hist = [...hist, estimatedScore].slice(-5);
    localStorage.setItem(sessionHistKey, JSON.stringify(hist));
    setServerSessionHistory(hist);
    // 全セッションのスコアログ（ハイスコア用）
    const sessionLogKey = `score_session_log_${targetExam}_${uid}`;
    let log: ScoreEntry[] = [];
    try { log = JSON.parse(localStorage.getItem(sessionLogKey) ?? '[]'); } catch {}
    log = [...log, { date: jstNow, score: estimatedScore }].slice(-100);
    localStorage.setItem(sessionLogKey, JSON.stringify(log));
    setServerSessionScoreLog(log);
    if (user) {
      fetch(`${API_ENDPOINT}/users/me/score-history`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, examType: targetExam, sessionScoreHistory: hist, sessionScoreLog: log }),
      }).catch(() => {});
    }
  }, [domainStats, targetExam, uid, estimatedScore]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoreDelta = prevScore !== null && estimatedScore !== null ? estimatedScore - prevScore : null;

  // サクッと演習ドラフトから再開
  const hasQuickDraft = !!(quickDraft && quickDraft.examType === targetExam);
  const hasFocusedDraft = !!(focusedDraft && focusedDraft.examType === targetExam);

  const resumeQuickExercise = () => {
    if (!quickDraft) return;
    navigate('/aws/exercise/session', {
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
    navigate('/aws/exercise/session', {
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
    localStorage.removeItem(`quickExerciseDraft_${uid}`);
    setQuickDraft(null);
  };
  const discardFocusedDraft = () => {
    localStorage.removeItem(`focusedExerciseDraft_${uid}`);
    setFocusedDraft(null);
  };

  const switchMode = (mode: 'quick' | 'focused') => {
    setLastMode(mode);
    localStorage.setItem(`lastQuickMode_${uid}`, mode);
  };

  // サクッと演習
  const startQuickExercise = async () => {
    if (!targetExam) { alert(ja ? '試験を選択してください' : 'Please select an exam'); return; }
    if (estimatedScore !== null) localStorage.setItem(`score_prev_${targetExam}_${uid}`, String(estimatedScore));
    const userId = user?.userId ?? 'guest';
    await autoScoreAndClearDrafts(userId);
    discardQuickDraft();
    discardFocusedDraft();
    setLastMode('quick');
    localStorage.setItem(`lastQuickMode_${uid}`, 'quick');
    setQuickLoading(true);
    setQuickLoadPct(10);
    const qPrefs = loadQuickPrefs(uid);

    // ── プリフェッチキャッシュを使用 ──
    {
      const hasFilters = !!(qPrefs.unansweredOnly || qPrefs.incorrectOnly || qPrefs.bookmarkOnly || (qPrefs.domains?.length ?? 0) > 0);
      const cached = hasFilters ? getPrefetchC(targetExam, userId, qPrefs) : getPrefetchA(targetExam);
      if (cached && cached.questions.length > 0) {
        try {
          const count = qPrefs.questionCount ?? 5;
          const items = shuffleArray(cached.questions).slice(0, count);
          if (items.length > 0) {
            setQuickLoadPct(90);
            const questionIds = items.map((q: any) => q.questionId);
            setQuickLoading(false); setQuickLoadPct(0);
            // セッション作成は遷移先で非同期実行（クリティカルパスから除外）
            navigate('/aws/exercise/session', { state: { createSession: { userId, mode: 'exercise', examType: targetExam, questionIds }, questions: items, userId, mode: 'exercise', examType: targetExam, isQuick: true } });
            return;
          }
        } catch (err) {
          console.debug('[prefetch] quick cache failed, fallback:', err);
        }
      }
    }

    try {
      const userId = user?.userId ?? 'guest';
      const qCacheKey = `qlist_${targetExam}`;
      const cachedQs = getCachedPersist<{ items: any[]; total: number }>(qCacheKey);
      const needUserData = user && (qPrefs.unansweredOnly || qPrefs.incorrectOnly || qPrefs.bookmarkOnly);
      const plateau = randomPlateau();
      const stopAnim = cachedQs ? null : animateLoadPct(setQuickLoadPct, 10, plateau);
      // プール（フルキャッシュがあればそれを、無ければ metaOnly 軽量取得）とユーザーデータを並行フェッチ。
      // metaOnly は questionId/domain のみ・validity 済みのみ返すため選定ロジックはそのまま使える。
      const [data, answeredRes, incorrectRes, bkmRes] = await Promise.all([
        cachedQs ? Promise.resolve(cachedQs) : fetch(`${API_ENDPOINT}/questions?examType=${targetExam}&metaOnly=true`).then(r => r.json()),
        needUserData && qPrefs.unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : Promise.resolve(null),
        needUserData && qPrefs.incorrectOnly  ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : Promise.resolve(null),
        needUserData && qPrefs.bookmarkOnly   ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
      ]);
      if (stopAnim) { stopAnim(); setQuickLoadPct(plateau); }
      // フルキャッシュ時のみ明示的に validity フィルタ（metaOnly はサーバ側で済み）
      const pool: any[] = cachedQs ? (data.items ?? []).filter((q: any) => !!q.validityCheckedAt) : (data.items ?? []);
      let items = [...pool];
      if (needUserData) {
        setQuickLoadPct(80);
        const unansweredSet = qPrefs.unansweredOnly && answeredRes ? new Set<string>(answeredRes.questionIds ?? []) : null;
        const incorrectSet  = qPrefs.incorrectOnly  && incorrectRes ? new Set<string>(incorrectRes.questionIds ?? []) : null;
        const bookmarkSet   = qPrefs.bookmarkOnly   && bkmRes       ? new Set<string>(bkmRes.questionIds ?? [])      : null;
        // 条件に合う問題を優先（先頭に並べる）、なければ全問から補充
        items.sort((a, b) => {
          const scoreQ = (q: any) =>
            (unansweredSet && !unansweredSet.has(q.questionId) ? 1 : 0) +
            (incorrectSet  && incorrectSet.has(q.questionId)   ? 1 : 0) +
            (bookmarkSet   && bookmarkSet.has(q.questionId)    ? 1 : 0);
          return scoreQ(b) - scoreQ(a);
        });
      }
      const selIdx = domainsToIndices(targetExam, qPrefs.domains ?? []);
      if (selIdx.length > 0) {
        items = items.filter((q: any) => selIdx.includes(questionDomainIndex(q)));
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
      setQuickLoadPct(90);
      const questionIds = items.map((q: any) => q.questionId);
      // セッション作成は遷移先で非同期実行。フルキャッシュ時は全問をそのまま渡し、
      // metaOnly 時は 1 問目だけ取得して残りはプログレッシブロード。
      if (cachedQs) {
        navigate('/aws/exercise/session', { state: { createSession: { userId, mode: 'exercise', examType: targetExam, questionIds }, questions: items, userId, mode: 'exercise', examType: targetExam, isQuick: true } });
      } else {
        const q1Data = await fetch(`${API_ENDPOINT}/questions?ids=${questionIds[0]}&withAnswers=true&examType=${targetExam}`).then(r => r.json());
        navigate('/aws/exercise/session', { state: { createSession: { userId, mode: 'exercise', examType: targetExam, questionIds }, questions: q1Data.items ?? [], questionIds, userId, mode: 'exercise', examType: targetExam, isQuick: true } });
      }
    } catch (err) { console.error(err); alert(ja ? '演習の開始に失敗しました' : 'Failed to start exercise'); }
    finally { setQuickLoading(false); setQuickLoadPct(0); }
  };

  // しっかり対策
  const startFocusedExercise = async () => {
    if (!targetExam) { alert(ja ? '試験を選択してください' : 'Please select an exam'); return; }
    if (!user) { alert(ja ? 'ログインが必要です' : 'Login required'); return; }
    if (estimatedScore !== null) localStorage.setItem(`score_prev_${targetExam}_${uid}`, String(estimatedScore));
    await autoScoreAndClearDrafts(user.userId);
    discardQuickDraft();
    discardFocusedDraft();
    setLastMode('focused');
    localStorage.setItem(`lastQuickMode_${uid}`, 'focused');
    setFocusedLoading(true);
    setFocusedLoadPct(10);
    const fPrefs = loadFocusedPrefs(uid);

    // ── プリフェッチキャッシュを使用 ──
    {
      const userId = user.userId;
      const hasFilters = fPrefs.focusIncorrect !== false || (fPrefs.focusDomain ?? 'below60') !== 'none';
      const cached = hasFilters ? getPrefetchB(targetExam, userId, fPrefs) : getPrefetchA(targetExam);
      if (cached && cached.questions.length > 0) {
        try {
          const count = fPrefs.questionCount ?? 5;
          const items = shuffleArray(cached.questions).slice(0, count);
          if (items.length > 0) {
            setFocusedLoadPct(90);
            const questionIds = items.map((q: any) => q.questionId);
            setFocusedLoading(false); setFocusedLoadPct(0);
            // セッション作成は遷移先で非同期実行（クリティカルパスから除外）
            navigate('/aws/exercise/session', { state: { createSession: { userId, mode: 'exercise', examType: targetExam, questionIds, isFocused: true }, questions: items, userId, mode: 'exercise', examType: targetExam, isQuick: true, isFocused: true } });
            return;
          }
        } catch (err) {
          console.debug('[prefetch] focused cache failed, fallback:', err);
        }
      }
    }

    try {
      const userId = user.userId;
      const qCacheKey = `qlist_${targetExam}`;
      const cachedQs = getCachedPersist<{ items: any[]; total: number }>(qCacheKey);
      const plateau = randomPlateau();
      const stopAnim = cachedQs ? null : animateLoadPct(setFocusedLoadPct, 10, plateau);
      // プール（フルキャッシュがあればそれを、無ければ metaOnly 軽量取得）と苦手問題データを並行フェッチ。
      // 弱点ドメイン判定は q.domain のみ・苦手判定は questionId のみ使うため metaOnly で足りる。
      const [data, incorrectRes] = await Promise.all([
        cachedQs ? Promise.resolve(cachedQs) : fetch(`${API_ENDPOINT}/questions?examType=${targetExam}&metaOnly=true`).then(r => r.json()),
        fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()),
      ]);
      if (stopAnim) { stopAnim(); setFocusedLoadPct(plateau); }
      // フルキャッシュ時のみ明示的に validity フィルタ（metaOnly はサーバ側で済み）
      const allItems: any[] = cachedQs ? (data.items ?? []).filter((q: any) => !!q.validityCheckedAt) : (data.items ?? []);
      const incorrectIds = new Set<string>(incorrectRes.questionIds ?? []);
      const focusIncorrect: boolean = fPrefs.focusIncorrect !== false;
      const focusDomain: string = fPrefs.focusDomain ?? 'below60';

      // 優先問題を先頭に集め、不足分は全問プールから補充（絞り込みではなく優先）
      let priorityItems: any[] = [];
      if (focusIncorrect) {
        priorityItems = allItems.filter((q: any) => incorrectIds.has(q.questionId));
      }
      if (focusDomain !== 'none') {
        const threshold = focusDomain === 'below40' ? 0.40 : focusDomain === 'below50' ? 0.50 : focusDomain === 'below70' ? 0.70 : 0.60;
        const examDomains = EXAM_DOMAINS[targetExam] ?? [];
        const weakDomains = new Set<string>(((): string[] => {
          const hist = readDomainHistory(targetExam, uid);
          return examDomains.filter((domain, idx) => {
            const stat = domainStats.find(s => tagIdMatches(s.tagId, targetExam, idx));
            if (stat) {
              const total = (stat.correctCount ?? 0) + (stat.incorrectCount ?? 0);
              return total === 0 || (stat.correctCount ?? 0) / total < threshold;
            }
            const sessions = hist[String(idx)];
            if (!sessions || sessions.length === 0) return true;
            const correct = sessions.reduce((s, r) => s + r.correct, 0);
            const total = sessions.reduce((s, r) => s + r.total, 0);
            return total === 0 || correct / total < threshold;
          });
        })());
        const seenIds = new Set(priorityItems.map((q: any) => q.questionId));
        const domainItems = allItems.filter((q: any) => weakDomains.has(qDomainName(q)) && !seenIds.has(q.questionId));
        priorityItems = [...priorityItems, ...domainItems];
      }
      const count = fPrefs.questionCount ?? 5;
      // 優先問題をシャッフルして先頭に、残りを補充（問題数が足りなくてもアラートなし）
      const usedIds = new Set(priorityItems.map((q: any) => q.questionId));
      const rest = shuffleArray(allItems.filter((q: any) => !usedIds.has(q.questionId)));
      let items: any[] = [...shuffleArray(priorityItems), ...rest];
      items = Array.from(new Map(items.map((q: any) => [q.questionId, q])).values()).slice(0, count);
      if (items.length === 0) { alert(ja ? '条件に合う問題がありません' : 'No questions match the criteria'); return; }
      setFocusedLoadPct(90);
      const questionIds = items.map((q: any) => q.questionId);
      // セッション作成は遷移先で非同期実行。フルキャッシュ時は全問をそのまま渡し、
      // metaOnly 時は 1 問目だけ取得して残りはプログレッシブロード。
      if (cachedQs) {
        navigate('/aws/exercise/session', { state: { createSession: { userId, mode: 'exercise', examType: targetExam, questionIds, isFocused: true }, questions: items, userId, mode: 'exercise', examType: targetExam, isQuick: true, isFocused: true } });
      } else {
        const q1Data = await fetch(`${API_ENDPOINT}/questions?ids=${questionIds[0]}&withAnswers=true&examType=${targetExam}`).then(r => r.json());
        navigate('/aws/exercise/session', { state: { createSession: { userId, mode: 'exercise', examType: targetExam, questionIds, isFocused: true }, questions: q1Data.items ?? [], questionIds, userId, mode: 'exercise', examType: targetExam, isQuick: true, isFocused: true } });
      }
    } catch (err) { console.error(err); alert(ja ? '演習の開始に失敗しました' : 'Failed to start exercise'); }
    finally { setFocusedLoading(false); setFocusedLoadPct(0); }
  };

  // マイページの「しっかり対策を開始する」ボタンから遷移してきた場合に自動起動
  useEffect(() => {
    if ((location.state as any)?.startFocused && user && targetExam && focusedUnlockedCached) {
      window.history.replaceState({}, '', location.pathname);
      startFocusedExercise();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // オーバーレイ表示中は body スクロール無効（iOS Safari 対応で position:fixed 方式）
  useEffect(() => {
    const anyOpen = showQuickModal || showFocusedModal || showCombinedDetail ||
      (isMobile && (showNewPanel || showFocusedMenu));
    if (!anyOpen) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [showQuickModal, showFocusedModal, showCombinedDetail, showNewPanel, showFocusedMenu, isMobile]);

  // ドメイン別成績（サーバー統計優先、ゲスト/オフライン時はローカル履歴）
  const domains = useMemo(() => targetExam ? (EXAM_DOMAINS[targetExam] ?? []) : [], [targetExam]);
  const domainAccList = useMemo(() => {
    if (!targetExam) return [] as { correct: number; total: number; pct: number | null }[];
    const hist = readDomainHistory(targetExam, uid);
    return domains.map((d, idx) => {
      const stat = domainStats.find(s => tagIdMatches(s.tagId, targetExam, idx));
      if (stat) {
        const correct = stat.correctCount ?? 0;
        const total = correct + (stat.incorrectCount ?? 0);
        return { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
      }
      const sessions = hist[String(idx)];
      if (!sessions || sessions.length === 0) return { correct: 0, total: 0, pct: null };
      const correct = sessions.reduce((s, r) => s + r.correct, 0);
      const total = sessions.reduce((s, r) => s + r.total, 0);
      return { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null };
    });
  }, [targetExam, domains, uid, domainStats]);

  const hasPrimaryDraft = primaryMode === 'focused' ? hasFocusedDraft : hasQuickDraft;
  const resumePrimary = primaryMode === 'focused' ? resumeFocusedExercise : resumeQuickExercise;
  const primaryLoading = primaryMode === 'focused' ? focusedLoading : quickLoading;
  const primaryLoadPct = primaryMode === 'focused' ? focusedLoadPct : quickLoadPct;
  const primaryBg = primaryMode === 'focused' ? '#009E9E' : 'var(--color-accent)';
  const primaryColor = primaryMode === 'focused' ? '#fff' : 'var(--color-btn-primary-text)';
  const primarySpinnerBorder = primaryMode === 'focused' ? '2px solid rgba(255,255,255,0.3)' : '2px solid rgba(0,0,0,0.2)';
  const primarySpinnerTop = primaryMode === 'focused' ? '#fff' : '#16191f';
  const discardPrimaryDraft = primaryMode === 'focused' ? discardFocusedDraft : discardQuickDraft;
  const startPrimary = primaryMode === 'focused' ? startFocusedExercise : startQuickExercise;

  // Shift+Enter で表示中のプライマリ開始ボタンを発火（Web版のみ）
  const startKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  startKeyRef.current = (e: KeyboardEvent) => {
    if (isMobile || !(e.key === 'Enter' && e.shiftKey)) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
    if (showQuickModal || showFocusedModal || showCombinedDetail || showWebQuickMenu || showFocusedMenu || revealService) return;
    e.preventDefault();
    if (hasPrimaryDraft) resumePrimary();
    else if (targetExam && !primaryLoading) startPrimary();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => startKeyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-lg) var(--spacing-lg)' }} className="page-container">
      <Helmet>
        <title>ホーム | 無限ノック</title>
        <meta name="description" content="あなたのAWS試験スコアと学習進捗を確認。ドメイン別正答率・予想スコア・直近の演習結果をひと目で把握できます。" />
      </Helmet>

      {/* ── 目標演習量 ── */}
      <Card
        padding="var(--spacing-md)"
        style={{ marginBottom: 'var(--spacing-md)', cursor: 'pointer' }}
        onClick={() => navigate('/aws/mypage')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}>
            <IconTarget size={13} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
            {ja ? '目標演習量' : 'Daily Goal'}
          </span>
          {ja && <span style={{ fontSize: 10, color: 'var(--color-text-sub)' }}>※達成で<span style={{ color: '#009E9E', fontWeight: 700 }}>+10p</span>！</span>}
          <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: dailyCount >= dailyGoal ? 'var(--color-success)' : 'var(--color-text-sub)' }}>
            {dailyCount} / {dailyGoal}{ja ? '問' : 'Q'}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
          {(() => {
            const barColor = dailyCount >= dailyGoal
              ? 'linear-gradient(90deg, #009E9E, #4dd9d9)'
              : 'linear-gradient(90deg, #009E9E, #00cccc)';
            return (
              <div style={{ height: '100%', width: `${Math.min(100, (dailyCount / dailyGoal) * 100)}%`, borderRadius: 3, background: barColor, transformOrigin: 'left center', animation: 'growWidth 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both' }} />
            );
          })()}
        </div>
      </Card>

      {/* ── ドメイン別正答率 + 予想スコア（1パネル、クリックで詳細） ── */}
      <Card
        padding="var(--spacing-md)"
        style={{ marginBottom: 'var(--spacing-md)', cursor: (targetExam && !statsLoading) ? 'pointer' : 'default', position: 'relative' }}
        onClick={() => { if (targetExam && !statsLoading) setShowCombinedDetail(true); }}
      >
        <div style={isMobile ? { display: 'flex', flexDirection: 'column-reverse' } : { display: 'flex', gap: 0 }}>

          {/* ドメイン別正答率 */}
          <div style={isMobile ? {} : { flex: 1, minWidth: 0, paddingRight: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}>
                <IconChart size={12} />
              </span>
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
                  const nodeResults = domainNodeResultsMap[d] ?? [];
                  const correctInNodes = nodeResults.filter(v => !!v).length;
                  const barPct = nodeResults.length > 0 ? correctInNodes / 5 * 100 : null;
                  const grade = getGrade(barPct);
                  const label = lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;
                  return (
                    <div key={d}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-primary)', minWidth: 14, flexShrink: 0, textAlign: 'center' }}>{grade}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                        {barPct !== null && <div style={{ width: `${barPct}%`, minWidth: barPct === 0 ? 3 : undefined, height: '100%', borderRadius: 3, background: 'var(--bar-gradient-primary)', transformOrigin: 'left center', animation: `growWidth 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 30}ms both` }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 区切り線（モバイル: 横線、デスクトップ: 縦線） */}
          {isMobile
            ? <div style={{ height: 1, background: 'var(--color-border)', margin: '10px 0' }} />
            : <div style={{ width: 1, background: 'var(--color-border)', flexShrink: 0 }} />
          }

          {/* 予想スコア */}
          <div style={isMobile ? {} : { flex: 1, minWidth: 0, paddingLeft: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}>
                  <IconTrendingUp size={12} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {ja ? '予想スコア' : 'Est. Score'}
                </span>
              </div>
              {user && (
                <button
                  onClick={e => { e.stopPropagation(); refreshStats(); }}
                  disabled={statsLoading || statsRefreshing}
                  title={ja ? '成績を更新' : 'Refresh stats'}
                  aria-label={ja ? '成績を更新' : 'Refresh stats'}
                  style={{
                    width: 35, height: 35, borderRadius: '50%',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: 'var(--color-primary)',
                    cursor: (statsLoading || statsRefreshing) ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: (statsLoading || statsRefreshing) ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ animation: (statsLoading || statsRefreshing) ? 'sherpa-spin 0.8s linear infinite' : 'none' }}>
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                </button>
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
          </div>

        </div>

      </Card>

      {/* ── 日めくりAWSサービス ── */}
      <TodayServiceSection
        lang={lang}
        userId={user?.userId}
        onNavigateEncyclopedia={() => navigate('/aws/encyclopedia')}
        onReveal={svc => setRevealService(svc)}
        isMobile={isMobile}
      />

      {revealService && (
        <DailyServiceRevealModal
          service={revealService}
          lang={lang}
          onClose={() => { setRevealService(null); navigate('/aws/'); }}
          onNavigateEncyclopedia={() => { setRevealService(null); navigate('/aws/encyclopedia'); }}
          onStartExercise={() => setRevealService(null)}
        />
      )}

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
                              disabled={!targetExam || !user || !focusedUnlocked}
                              onClick={() => { setShowWebQuickMenu(false); switchMode('focused'); }}
                              style={{ width: '100%', height: 36, padding: '0 12px', border: `1.5px solid ${(!targetExam || !user || !focusedUnlocked) ? 'var(--color-border)' : '#009E9E'}`, borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || !user || !focusedUnlocked) ? 'default' : 'pointer', background: 'transparent', color: (!targetExam || !user || !focusedUnlocked) ? 'var(--color-text-light)' : '#009E9E', fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                            >
                              {!focusedUnlocked && <IconLock size={13} />}
                              {ja ? 'しっかり対策モード' : 'Switch to Focused'}
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
                            <button disabled={!targetExam} onClick={() => { setShowWebQuickMenu(false); switchMode('quick'); }} style={{ width: '100%', height: 36, padding: '0 12px', border: '1.5px solid var(--color-accent)', borderRadius: 'var(--border-radius-full)', cursor: !targetExam ? 'default' : 'pointer', background: 'transparent', color: 'var(--color-accent)', fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {ja ? 'サクッと演習モード' : 'Switch to Quick'}
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
                        {ja ? `準備中... ${primaryLoadPct}%` : `Loading... ${primaryLoadPct}%`}
                      </span>
                    ) : (
                    <>
                      {primaryMode === 'quick' ? (ja ? 'サクッと演習を再開' : 'Quick (Resume)') : (ja ? 'しっかり対策を再開' : 'Focused (Resume)')}
                      {ja && primaryMode === 'quick' && quickDraft?.results != null && quickDraft?.questions != null && (
                        <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>（{quickDraft.results.length}/{quickDraft.questions.length}問）</span>
                      )}
                      {ja && primaryMode !== 'quick' && focusedDraft?.results != null && focusedDraft?.questions != null && (
                        <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>（{focusedDraft.results.length}/{focusedDraft.questions.length}問）</span>
                      )}
                    </>
                  )}
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
                            disabled={!targetExam || !user || !focusedUnlocked}
                            onClick={() => { setShowFocusedMenu(false); switchMode('focused'); }}
                            style={{ width: '100%', height: 36, padding: '0 12px', border: `1.5px solid ${(!targetExam || !user || !focusedUnlocked) ? 'var(--color-border)' : '#009E9E'}`, borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || !user || !focusedUnlocked) ? 'default' : 'pointer', background: 'transparent', color: (!targetExam || !user || !focusedUnlocked) ? 'var(--color-text-light)' : '#009E9E', fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                          >
                            {!focusedUnlocked && <IconLock size={13} />}
                            {ja ? 'しっかり対策モード' : 'Switch to Focused'}
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
                          <button disabled={!targetExam} onClick={() => { setShowFocusedMenu(false); switchMode('quick'); }} style={{ width: '100%', height: 36, padding: '0 12px', border: '1.5px solid var(--color-accent)', borderRadius: 'var(--border-radius-full)', cursor: !targetExam ? 'default' : 'pointer', background: 'transparent', color: 'var(--color-accent)', fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {ja ? 'サクッと演習モード' : 'Switch to Quick'}
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
                          {ja ? `準備中... ${quickLoadPct}%` : `Loading... ${quickLoadPct}%`}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {ja ? 'サクッと演習を開始' : 'Quick'}
                          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, border: '1px solid currentColor', borderRadius: 4, padding: '0 5px', lineHeight: 1.5 }}>⇧⏎</span>
                        </span>
                      )}
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
                          {ja ? `準備中... ${focusedLoadPct}%` : `Loading... ${focusedLoadPct}%`}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {ja ? 'しっかり対策を開始' : 'Focused'}
                          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, border: '1px solid currentColor', borderRadius: 4, padding: '0 5px', lineHeight: 1.5 }}>⇧⏎</span>
                        </span>
                      )}
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
                if (primaryMode === 'focused') { setDraftFocusedPrefs({ ...loadFocusedPrefs(uid) }); setShowFocusedModal(true); }
                else { const p = loadQuickPrefs(uid); setDraftPrefs({ ...p, domains: storedDomainsToNames(targetExam ?? 'SAA', p.domains) }); setShowQuickModal(true); }
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
                        disabled={!targetExam || !user || !focusedUnlocked}
                        onClick={() => { setShowNewPanel(false); switchMode('focused'); }}
                        style={{ width: '100%', height: 44, border: `1.5px solid ${(!targetExam || !user || !focusedUnlocked) ? 'var(--color-border)' : '#009E9E'}`, borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || !user || !focusedUnlocked) ? 'default' : 'pointer', background: 'transparent', color: (!targetExam || !user || !focusedUnlocked) ? 'var(--color-text-light)' : '#009E9E', fontWeight: 600, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        {!focusedUnlocked && <IconLock size={15} />}
                        {ja ? 'しっかり対策モード' : 'Switch to Focused'}
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
                      <button disabled={!targetExam} onClick={() => { setShowNewPanel(false); switchMode('quick'); }} style={{ width: '100%', height: 44, border: '1.5px solid var(--color-accent)', borderRadius: 'var(--border-radius-full)', cursor: !targetExam ? 'default' : 'pointer', background: 'transparent', color: 'var(--color-accent)', fontWeight: 600, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {ja ? 'サクッと演習モード' : 'Switch to Quick'}
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
                      disabled={!targetExam || !user || !focusedUnlocked}
                      onClick={() => { setShowFocusedMenu(false); switchMode('focused'); }}
                      style={{ width: '100%', height: 44, border: `1.5px solid ${(!targetExam || !user || !focusedUnlocked) ? 'var(--color-border)' : '#009E9E'}`, borderRadius: 'var(--border-radius-full)', cursor: (!targetExam || !user || !focusedUnlocked) ? 'default' : 'pointer', background: 'transparent', color: (!targetExam || !user || !focusedUnlocked) ? 'var(--color-text-light)' : '#009E9E', fontWeight: 600, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      {!focusedUnlocked && <IconLock size={15} />}
                      {ja ? 'しっかり対策モード' : 'Switch to Focused'}
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
                    <button disabled={!targetExam} onClick={() => { setShowFocusedMenu(false); switchMode('quick'); }} style={{ width: '100%', height: 44, border: '1.5px solid var(--color-accent)', borderRadius: 'var(--border-radius-full)', cursor: !targetExam ? 'default' : 'pointer', background: 'transparent', color: 'var(--color-accent)', fontWeight: 600, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {ja ? 'サクッと演習モード' : 'Switch to Quick'}
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
                      {ja ? `準備中... ${primaryLoadPct}%` : `Loading... ${primaryLoadPct}%`}
                    </span>
                  ) : (
                    <>
                      {primaryMode === 'quick' ? (ja ? 'サクッと演習を再開' : 'Quick (Resume)') : (ja ? 'しっかり対策を再開' : 'Focused (Resume)')}
                      {ja && primaryMode === 'quick' && quickDraft?.results != null && quickDraft?.questions != null && (
                        <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>（{quickDraft.results.length}/{quickDraft.questions.length}問）</span>
                      )}
                      {ja && primaryMode !== 'quick' && focusedDraft?.results != null && focusedDraft?.questions != null && (
                        <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>（{focusedDraft.results.length}/{focusedDraft.questions.length}問）</span>
                      )}
                    </>
                  )}
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
                        {ja ? `準備中... ${quickLoadPct}%` : `Loading... ${quickLoadPct}%`}
                      </span>
                    ) : (ja ? 'サクッと演習を開始' : 'Quick')}
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
                        {ja ? `準備中... ${focusedLoadPct}%` : `Loading... ${focusedLoadPct}%`}
                      </span>
                    ) : (ja ? 'しっかり対策を開始' : 'Focused')}
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
                if (primaryMode === 'focused') { setDraftFocusedPrefs({ ...loadFocusedPrefs(uid) }); setShowFocusedModal(true); }
                else { const p = loadQuickPrefs(uid); setDraftPrefs({ ...p, domains: storedDomainsToNames(targetExam ?? 'SAA', p.domains) }); setShowQuickModal(true); }
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
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)', maxHeight: isMobile ? '75vh' : '60vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* ヘッダー固定 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-accent)' }}>
                {ja ? 'サクッと演習 設定' : 'Quick Practice Settings'}
              </h3>
              <button onClick={() => setShowQuickModal(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
            </div>
            {/* スクロール可能なコンテンツ */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              <div style={{ marginBottom: 16, paddingTop: 16 }}>
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
                <div style={{ padding: '14px 0', borderBottom: targetExam && (EXAM_DOMAINS[targetExam] ?? []).length > 0 ? '1px solid var(--color-border)' : 'none' }}>
                  <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                    {ja ? '重点フィルタ' : 'Focus Filter'}
                  </div>
                  {([
                    ['unansweredOnly', ja ? '未回答を優先' : 'Unanswered First'],
                    ['incorrectOnly',  ja ? '不正解を優先'  : 'Incorrect First'],
                    ['bookmarkOnly',   ja ? 'ブックマークを優先' : 'Bookmarked First'],
                  ] as [string, string][]).map(([key, label]) => {
                    const on = !!(draftPrefs[key]);
                    return (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setDraftPrefs(p => ({ ...p, [key]: !on }))}
                          style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                        />
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: on ? 600 : 400, color: 'var(--color-text-main)' }}>{label}</span>
                      </label>
                    );
                  })}
                </div>
                {targetExam && (EXAM_DOMAINS[targetExam] ?? []).length > 0 && (
                  <div style={{ padding: '14px 0' }}>
                    <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                      {ja ? 'ドメイン' : 'Domains'}
                    </div>
                    {/* 全て */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', marginBottom: 4, paddingBottom: 8, borderBottom: '1px solid color-mix(in srgb, var(--color-text-light) 20%, transparent)' }}>
                      <input
                        type="checkbox"
                        checked={(EXAM_DOMAINS[targetExam] ?? []).every(d => (draftPrefs.domains ?? []).includes(d))}
                        onChange={() => {
                          const all = EXAM_DOMAINS[targetExam] ?? [];
                          setDraftPrefs(p => ({ ...p, domains: all.every(d => (p.domains ?? []).includes(d)) ? [] : all }));
                        }}
                        style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                      />
                      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)' }}>{ja ? '全て' : 'All'}</span>
                    </label>
                    {(EXAM_DOMAINS[targetExam] ?? []).map(domain => {
                      const selDoms: string[] = draftPrefs.domains ?? [];
                      const checked = selDoms.includes(domain);
                      return (
                        <label key={domain} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setDraftPrefs(p => {
                              const cur: string[] = p.domains ?? [];
                              return { ...p, domains: checked ? cur.filter(d => d !== domain) : [...cur, domain] };
                            })}
                            style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                          />
                          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', lineHeight: 1.4 }}>{domain}</span>
                        </label>
                      );
                    })}
                    {(draftPrefs.domains ?? []).length === 0 && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', marginTop: 4 }}>
                        {ja ? '1つ以上選択してください' : 'Select at least one domain'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* その他 */}
              <div style={{ padding: '14px 0', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                  {ja ? 'その他' : 'Other'}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draftPrefs.strikeEnabled === true}
                    onChange={() => setDraftPrefs(p => ({ ...p, strikeEnabled: p.strikeEnabled === true ? false : true }))}
                    style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                    {ja ? '消去法機能をオン' : 'Enable elimination mode'}
                  </span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4, lineHeight: 1.5 }}>
                  ※ {ja ? '選択肢のテキストをタップすると取り消し線を引いて選択肢を絞り込める機能です' : 'Tap choice text to strike through and narrow down options'}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', cursor: 'pointer', marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={draftPrefs.hideColumn === true}
                    onChange={() => setDraftPrefs(p => ({ ...p, hideColumn: !p.hideColumn }))}
                    style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                    {ja ? 'コラム（豆知識）を非表示' : 'Hide column tips'}
                  </span>
                </label>
              </div>
            </div>
            {/* 保存ボタン固定 */}
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minHeight: 64 }}>
              {savedQuick && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)', animation: 'sherpa-save-msg 2s ease-in-out both' }}>✓ {ja ? '保存しました' : 'Saved'}</span>}
              <button
                disabled={targetExam !== null && (EXAM_DOMAINS[targetExam] ?? []).length > 0 && (draftPrefs.domains ?? []).length === 0}
                onClick={() => {
                  localStorage.setItem(`quickExercisePrefs_${uid}`, JSON.stringify({ ...draftPrefs, domains: domainsToIndices(targetExam ?? 'SAA', draftPrefs.domains ?? []) }));
                  setSavedQuick(true);
                  setTimeout(() => setSavedQuick(false), 2000);
                  if (targetExam) {
                    const hasFilters = !!(draftPrefs.unansweredOnly || draftPrefs.incorrectOnly || draftPrefs.bookmarkOnly || (draftPrefs.domains?.length ?? 0) > 0);
                    if (hasFilters) { prefetchTypeC(targetExam, uid, draftPrefs); } else { prefetchTypeA(targetExam, uid); }
                  }
                }}
                style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (targetExam !== null && (EXAM_DOMAINS[targetExam] ?? []).length > 0 && (draftPrefs.domains ?? []).length === 0) ? 'default' : 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexShrink: 0, opacity: (targetExam !== null && (EXAM_DOMAINS[targetExam] ?? []).length > 0 && (draftPrefs.domains ?? []).length === 0) ? 0.5 : 1 }}
              >
                <IconSaveCheck size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── しっかり対策 設定モーダル ── */}
      {showFocusedModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowFocusedModal(false); }}
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)', maxHeight: isMobile ? '75vh' : '60vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* ヘッダー固定 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: '#009E9E' }}>
                {ja ? 'しっかり対策 設定' : 'Focused Practice Settings'}
              </h3>
              <button onClick={() => setShowFocusedModal(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
            </div>
            {/* スクロール可能なコンテンツ */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              <div style={{ marginBottom: 20, paddingTop: 16 }}>
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
                {/* 不正解優先 */}
                <div style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                    {ja ? '不正解を優先' : 'Prioritize Incorrect'}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={draftFocusedPrefs.focusIncorrect !== false}
                      onChange={() => setDraftFocusedPrefs(p => ({ ...p, focusIncorrect: p.focusIncorrect === false }))}
                      style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)' }}>
                      {ja ? '過去に不正解だった問題を優先する' : 'Prioritize previously incorrect questions'}
                    </span>
                  </label>
                </div>
                {/* 苦手ドメイン優先 */}
                <div style={{ padding: '14px 0' }}>
                  <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                    {ja ? '苦手ドメインを優先' : 'Prioritize Weak Domains'}
                  </div>
                  {([
                    ['none',    ja ? '優先しない' : 'Off'],
                    ['below60', ja ? '正答率60%以下のドメイン（3/5問）' : 'Below 60%'],
                    ['below40', ja ? '正答率40%以下のドメイン（2/5問）' : 'Below 40%'],
                  ] as [string, string][]).map(([val, label]) => {
                    const selected = (draftFocusedPrefs.focusDomain ?? 'below60') === val;
                    return (
                      <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="focusDomain"
                          checked={selected}
                          onChange={() => setDraftFocusedPrefs(p => ({ ...p, focusDomain: val }))}
                          style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                        />
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: selected ? 600 : 400, color: 'var(--color-text-main)' }}>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 16 }}>
                {ja ? '※ 優先条件に合う問題が少ない場合は、他の問題で補充します' : '* If not enough questions match, others will be included to fill the count'}
              </div>
              {/* その他 */}
              <div style={{ padding: '14px 0', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 8 }}>
                  {ja ? 'その他' : 'Other'}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draftFocusedPrefs.strikeEnabled === true}
                    onChange={() => setDraftFocusedPrefs(p => ({ ...p, strikeEnabled: p.strikeEnabled === true ? false : true }))}
                    style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                    {ja ? '消去法機能をオン' : 'Enable elimination mode'}
                  </span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4, lineHeight: 1.5 }}>
                  ※ {ja ? '選択肢のテキストをタップすると取り消し線を引いて選択肢を絞り込める機能です' : 'Tap choice text to strike through and narrow down options'}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', cursor: 'pointer', marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={draftFocusedPrefs.hideColumn === true}
                    onChange={() => setDraftFocusedPrefs(p => ({ ...p, hideColumn: !p.hideColumn }))}
                    style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                    {ja ? 'コラム（豆知識）を非表示' : 'Hide column tips'}
                  </span>
                </label>
              </div>
            </div>
            {/* 保存ボタン固定 */}
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minHeight: 64 }}>
              {savedFocused && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)', animation: 'sherpa-save-msg 2s ease-in-out both' }}>✓ {ja ? '保存しました' : 'Saved'}</span>}
              <button
                onClick={() => {
                  localStorage.setItem(`focusedExercisePrefs_${uid}`, JSON.stringify(draftFocusedPrefs));
                  setSavedFocused(true);
                  setTimeout(() => setSavedFocused(false), 2000);
                  if (targetExam) {
                    const hasFilters = draftFocusedPrefs.focusIncorrect !== false || (draftFocusedPrefs.focusDomain ?? 'below60') !== 'none';
                    if (hasFilters) { prefetchTypeB(targetExam, uid, draftFocusedPrefs); } else { prefetchTypeA(targetExam, uid); }
                  }
                }}
                style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexShrink: 0 }}
              >
                <IconSaveCheck size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 成績詳細モーダル */}
      {showCombinedDetail && targetExam && (
        <CombinedDetailModal targetExam={targetExam} domainAccList={domainAccList} estimatedScore={estimatedScore} passScore={passScore} lang={lang} isMobile={isMobile} uid={uid} domainStats={domainStats} scoreHistory={serverScoreHistory ?? undefined} sessionHistory={serverSessionHistory ?? undefined} sessionScoreLog={serverSessionScoreLog ?? undefined} onClose={() => setShowCombinedDetail(false)} />
      )}

      {/* オンボーディング（目標資格未設定） */}
      {showOnboarding && (
        <ExamSelectOverlay
          targetExam={targetExam}
          uid={uid}
          lang={lang}
          isMobile={isMobile}
          onSelect={(exam) => {
            setTargetExam(exam);
            if (user) syncTargetExamToServer(user.userId, uid, exam);
            prefetchTypeA(exam, uid);
          }}
          onClose={() => setShowOnboarding(false)}
        />
      )}
      {(quickLoading || focusedLoading) && <div style={{ position: 'fixed', inset: 0, zIndex: 9000, cursor: 'wait' }} onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} />}
    </div>
  );
}
