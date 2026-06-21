'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { useNavigate } from '@/compat/react-router-dom';
import { API_ENDPOINT, EXAM_DOMAINS, EXAM_TYPES, DOMAIN_NAME_EN, EXAM_CONFIGS, DOMAIN_RATE_WARNING, DOMAIN_RATE_CAUTION, PASS_SCORES, EXAM_LEVEL, EXAM_LEVEL_COLORS } from '../constants';
import { syncPreferencesToServer, collectExamDatesFromLocal } from '../utils/preferences';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import {
  IconCalendarNotebook, IconTarget, IconAnnoyed, IconList,
  IconSparkles, IconChevronRight, IconChevronDown, IconLock, IconFlag, IconStar, IconTrendingUp, IconPenLine,
  IconBook, IconBookOpenCheck, IconCircleCheck,
  IconSprout, IconBox, IconBot, IconCode2, IconCloud, IconDatabase, IconBrain, IconVectorSquare, IconFileCodeCorner, IconAtom, IconShieldIcon, IconWaypoints,
  EXAM_ICON_COMPONENTS,
} from '../components/Icons';

const EXAM_CATCHCOPY: Record<string, string> = {
  CLF: 'AWS資格の登竜門！誰もがここから！',
  AIF: 'AI時代の新常識！まずはここからAI入門！',
  SAA: '迷ったらコレ！AWS資格の王道エース！',
  DVA: 'コードでクラウドを動かせ！開発者の実力証明！',
  SOA: '障害対応もお手の物！運用のプロへの第一歩！',
  DEA: 'データを運び、価値を生み出せ！',
  MLA: 'AIモデルを育てる！機械学習エンジニアへの道！',
  SAP: 'AWS設計の最高峰！アーキテクト最難関！',
  DOP: '自動化を極めろ！DevOpsマスターへの挑戦！',
  AIP: '生成AIを実装せよ！AI開発の最前線！',
  SCS: '守れる者だけが任される！セキュリティの番人！',
  ANS: 'ネットワークの深淵へ。AWS屈指の難関資格！',
};

const EXAM_URLS: Record<string, string> = {
  CLF: 'https://aws.amazon.com/jp/certification/certified-cloud-practitioner/',
  SAA: 'https://aws.amazon.com/jp/certification/certified-solutions-architect-associate/',
  SAP: 'https://aws.amazon.com/jp/certification/certified-solutions-architect-professional/',
  DVA: 'https://aws.amazon.com/jp/certification/certified-developer-associate/',
  SOA: 'https://aws.amazon.com/jp/certification/certified-sysops-admin-associate/',
  DOP: 'https://aws.amazon.com/jp/certification/certified-devops-engineer-professional/',
  DEA: 'https://aws.amazon.com/jp/certification/certified-data-engineer-associate/',
  AIF: 'https://aws.amazon.com/jp/certification/certified-ai-practitioner/',
  MLA: 'https://aws.amazon.com/jp/certification/certified-machine-learning-engineer-associate/',
  AIP: 'https://aws.amazon.com/jp/certification/certified-generative-ai-developer-professional/',
  ANS: 'https://aws.amazon.com/jp/certification/certified-advanced-networking-specialty/',
  SCS: 'https://aws.amazon.com/jp/certification/certified-security-specialty/',
};

const EXAM_DESC: Record<string, string> = {
  CLF: 'AWSクラウドの基礎知識・サービス・概念を問う入門試験。エンジニア以外でも取得可能。ITの基礎から学べるエントリーポイント。',
  SAA: 'AWSを使ったシステム設計・高可用性・コスト最適化の知識を問う、AWS最人気資格。クラウドアーキテクチャの標準スキルとして業界で広く認知。',
  SAP: 'SAAより高度な大規模システム設計・移行戦略・複雑なアーキテクチャを扱うプロフェッショナル資格。SAAの取得後を推奨。',
  DVA: 'AWSを使ったアプリ開発・デバッグ・デプロイ・セキュリティの実践知識を問う。Lambda・DynamoDB・API Gatewayが頻出。',
  SOA: 'AWSの運用・監視・自動化・スケーリング・セキュリティ管理を問う運用者向け試験。CloudWatch・Systems Managerが中心。',
  DOP: 'CI/CD・Infrastructure as Code・自動化・監視などDevOps実践を問うプロ資格。CodePipeline・CloudFormation・OpsWorksが重要。',
  DEA: 'データ収集・変換・保管・パイプライン設計などデータエンジニアリング全般を問う。Glue・Kinesis・Redshiftが頻出。',
  AIF: 'AIと機械学習の基礎・AWSのAI/MLサービスの活用知識を問う入門レベルの試験。Bedrock・SageMaker・Rekognitionが中心。',
  MLA: 'モデル開発・デプロイ・スケーリング・MLパイプライン構築の実践スキルを問う。SageMakerの深い理解が必要。',
  AIP: '生成AIアプリの設計・実装・最適化に特化した新資格。Amazon Bedrockを中心に、プロンプトエンジニアリングやRAGが頻出。',
  ANS: 'ハイブリッドクラウド・DNS・負荷分散・ネットワーク設計の高度な知識を問うSpecialty。Transit Gateway・Direct Connectが中心。',
  SCS: 'セキュリティ設計・実装・インシデント対応・コンプライアンスを問うSpecialty。IAM・KMS・GuardDutyの深い理解が必要。',
};

const FOCUSED_UNLOCK_THRESHOLD = 30;

type Session = {
  sessionId: string;
  examType: string;
  mode: string;
  score: number;
  isPassed: boolean;
  startedAt: string;
  endedAt?: string;
  isMini?: boolean;
  isFocused?: boolean;
  questionIds?: string[];
};

type AnswerRecord = {
  questionId: string;
  questionText: string;
  isCorrect: boolean;
  answeredAt: string;
};

type WeakQuestion = {
  questionId: string;
  questionText: string;
  correctCount: number;
  incorrectCount: number;
};

type DomainStat = {
  tagId: string;
  correctCount?: number;
  incorrectCount?: number;
  recentResults?: boolean[];
};

function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const examDate = new Date(dateStr + 'T00:00:00+09:00');
  const today = new Date(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10) + 'T00:00:00+09:00');
  return Math.round((examDate.getTime() - today.getTime()) / 86400000);
}

export default function MyPage() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const ja = lang === 'ja';
  const uid = user?.userId ?? 'guest';
  const isMobile = window.innerWidth < 768;

  const [tab, setTab] = useState<'target' | 'analysis' | 'history'>('target');
  const [showSettingsEdit, setShowSettingsEdit] = useState(false);
  const [editExamDate, setEditExamDate] = useState('');
  const [editDailyGoal, setEditDailyGoal] = useState(10); // min=10
  const [showExamSelect, setShowExamSelect] = useState(false);
  const [previewExam, setPreviewExam] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<string>('Practitioner');
  const [passComments, setPassComments] = useState<Record<string, string>>({});
  const examDetailScrollRef = useRef<HTMLDivElement>(null);

  const EXAM_LEVELS = [
    { key: 'Practitioner', color: '#6b9e3a', exams: ['CLF', 'AIF'] },
    { key: 'Associate',    color: '#006CE0', exams: ['SAA', 'DVA', 'SOA', 'DEA', 'MLA'] },
    { key: 'Professional', color: '#8b5cf6', exams: ['SAP', 'DOP', 'AIP'] },
    { key: 'Specialty',    color: '#0ea5e9', exams: ['ANS', 'SCS'] },
  ] as const;
  const EXAM_LEVEL_MAP: Record<string, string> = {
    CLF: 'Practitioner', AIF: 'Practitioner',
    SAA: 'Associate', DVA: 'Associate', SOA: 'Associate', DEA: 'Associate', MLA: 'Associate',
    SAP: 'Professional', DOP: 'Professional', AIP: 'Professional',
    ANS: 'Specialty', SCS: 'Specialty',
  };

  // ── ターゲット試験 ──
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(`targetExam_${uid}`));
  useEffect(() => {
    const saved = localStorage.getItem(`targetExam_${uid}`);
    setTargetExam(saved);
  }, [uid]);

  // ── 受験日 ──
  const [examDate, setExamDate] = useState<string>(() =>
    targetExam ? (localStorage.getItem(`examDate_${targetExam}_${uid}`) ?? '') : ''
  );
  useEffect(() => {
    if (targetExam) setExamDate(localStorage.getItem(`examDate_${targetExam}_${uid}`) ?? '');
    else setExamDate('');
  }, [targetExam, uid]);

  const handleExamDateChange = (v: string) => {
    setExamDate(v);
    if (!targetExam) return;
    if (v) localStorage.setItem(`examDate_${targetExam}_${uid}`, v);
    else localStorage.removeItem(`examDate_${targetExam}_${uid}`);
    window.dispatchEvent(new CustomEvent('examDateChanged', { detail: { examType: targetExam, date: v } }));
    if (user) {
      const examDates = collectExamDatesFromLocal(uid, EXAM_TYPES);
      syncPreferencesToServer(user.userId, uid, { examDates });
    }
  };

  const remainingDays = examDate ? daysUntil(examDate) : null;

  // ── 日次目標 ──
  const [dailyGoal, setDailyGoal] = useState<number>(() =>
    Math.max(10, parseInt(localStorage.getItem(`dailyGoal_${uid}`) ?? '10', 10))
  );
  const handleDailyGoalChange = (v: number) => {
    setDailyGoal(v);
    localStorage.setItem(`dailyGoal_${uid}`, String(v));
    if (user) syncPreferencesToServer(user.userId, uid, { dailyGoal: v });
  };

  // ── サーバーから設定を読み込み（ログイン時のデバイス間同期） ──
  useEffect(() => {
    if (!user) return;
    fetch(`${API_ENDPOINT}/users/me/preferences?userId=${encodeURIComponent(user.userId)}`)
      .then(r => r.json())
      .then(data => {
        // 受験日
        const examDates: Record<string, string> = data.examDates ?? {};
        for (const [et, date] of Object.entries(examDates)) {
          if (!date) continue;
          const key = `examDate_${et}_${uid}`;
          if (localStorage.getItem(key) !== date) {
            localStorage.setItem(key, date);
            window.dispatchEvent(new CustomEvent('examDateChanged', { detail: { examType: et, date } }));
          }
        }
        if (targetExam && examDates[targetExam]) {
          setExamDate(examDates[targetExam]);
        }
        // 目標演習量
        if (data.dailyGoal != null) {
          const serverGoal = Number(data.dailyGoal);
          localStorage.setItem(`dailyGoal_${uid}`, String(serverGoal));
          setDailyGoal(serverGoal);
        }
      })
      .catch(() => {});
  }, [user?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 資格切替時に詳細パネルのスクロールをリセット ──
  useEffect(() => {
    if (examDetailScrollRef.current) examDetailScrollRef.current.scrollTop = 0;
  }, [previewExam]);

  // ── 合格コメント取得 ──
  useEffect(() => {
    fetch(`${API_ENDPOINT}/settings/pass-comments`)
      .then(r => r.json())
      .then(d => { if (d.comments) setPassComments(d.comments); })
      .catch(() => {});
  }, []);

  // ── オーバーレイ表示中は body スクロール無効 ──
  useEffect(() => {
    const anyOpen = showSettingsEdit || showExamSelect;
    document.body.style.overflow = anyOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showSettingsEdit, showExamSelect]);

  // ── 週間達成度 ──
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + 9 * 3600 * 1000 - (6 - i) * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const weekCounts = weekDays.map(d => {
    if (!targetExam) return 0;
    return parseInt(localStorage.getItem(`dailyQCount_${targetExam}_${uid}_${d}`) ?? '0', 10);
  });
  const todayCount = weekCounts[6];

  // ── ドメイン統計（苦手分析タブ） ──
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'analysis' || !user || !targetExam) return;
    setStatsLoading(true);
    Promise.all([
      fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`).then(r => r.json()),
      fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${user.userId}&examType=${targetExam}`).then(r => r.json()),
    ]).then(([statsData, qData]) => {
      setDomainStats(statsData.stats ?? []);
      setAnsweredCount(qData.answeredCount ?? 0);
    }).catch(() => {}).finally(() => setStatsLoading(false));
  }, [tab, user, targetExam]);

  const focusedUnlocked = !!user && answeredCount >= FOCUSED_UNLOCK_THRESHOLD;

  // ── 頻出ミス問題（苦手分析タブ） ──
  const [weakQuestions, setWeakQuestions] = useState<WeakQuestion[]>([]);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakLoaded, setWeakLoaded] = useState(false);

  useEffect(() => {
    if (tab !== 'analysis' || !user || !targetExam || !focusedUnlocked || weakLoaded) return;
    setWeakLoading(true);
    fetch(`${API_ENDPOINT}/users/me/weak-questions?userId=${user.userId}&examType=${targetExam}&minIncorrect=2`)
      .then(r => r.json())
      .then(d => { setWeakQuestions(d.items ?? []); setWeakLoaded(true); })
      .catch(() => {})
      .finally(() => setWeakLoading(false));
  }, [tab, user, targetExam, focusedUnlocked, weakLoaded]);

  // ── 弱問展開（苦手分析タブ） ──
  const [expandedWeakQ, setExpandedWeakQ] = useState<string | null>(null);
  const [weakQDetails, setWeakQDetails] = useState<Record<string, any>>({});
  const [weakQDetailLoading, setWeakQDetailLoading] = useState<string | null>(null);

  const handleToggleWeakQ = useCallback(async (qid: string) => {
    if (expandedWeakQ === qid) { setExpandedWeakQ(null); return; }
    setExpandedWeakQ(qid);
    if (weakQDetails[qid] || weakQDetailLoading === qid) return;
    setWeakQDetailLoading(qid);
    try {
      const res = await fetch(`${API_ENDPOINT}/questions/${qid}`);
      const data = await res.json();
      setWeakQDetails(prev => ({ ...prev, [qid]: data }));
    } catch { setWeakQDetails(prev => ({ ...prev, [qid]: null })); }
    finally { setWeakQDetailLoading(null); }
  }, [expandedWeakQ, weakQDetails, weakQDetailLoading]);

  // ── 演習履歴（履歴タブ） ──
  const [sessions, setSessions] = useState<Session[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histLoaded, setHistLoaded] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, AnswerRecord[]>>({});
  const [answersLoading, setAnswersLoading] = useState<string | null>(null);
  const [expandedAnswer, setExpandedAnswer] = useState<string | null>(null);
  const [answerDetails, setAnswerDetails] = useState<Record<string, any>>({});
  const [answerDetailLoading, setAnswerDetailLoading] = useState<string | null>(null);

  const handleToggleAnswer = useCallback(async (qid: string) => {
    if (expandedAnswer === qid) { setExpandedAnswer(null); return; }
    setExpandedAnswer(qid);
    if (answerDetails[qid] || answerDetailLoading === qid) return;
    setAnswerDetailLoading(qid);
    try {
      const res = await fetch(`${API_ENDPOINT}/questions/${qid}`);
      const data = await res.json();
      setAnswerDetails(prev => ({ ...prev, [qid]: data }));
    } catch { setAnswerDetails(prev => ({ ...prev, [qid]: null })); }
    finally { setAnswerDetailLoading(null); }
  }, [expandedAnswer, answerDetails, answerDetailLoading]);

  // ── 問題詳細モーダル ──
  const [questionModal, setQuestionModal] = useState<{ qid: string; detail: any | null; loading: boolean; isCorrect?: boolean } | null>(null);

  const openWeakQModal = useCallback(async (qid: string) => {
    const cached = weakQDetails[qid];
    setQuestionModal({ qid, detail: cached ?? null, loading: !cached });
    if (!cached && weakQDetailLoading !== qid) {
      setWeakQDetailLoading(qid);
      try {
        const res = await fetch(`${API_ENDPOINT}/questions/${qid}`);
        const data = await res.json();
        setWeakQDetails(prev => ({ ...prev, [qid]: data }));
        setQuestionModal(prev => prev?.qid === qid ? { ...prev, detail: data, loading: false } : prev);
      } catch {
        setWeakQDetails(prev => ({ ...prev, [qid]: null }));
        setQuestionModal(prev => prev?.qid === qid ? { ...prev, loading: false } : prev);
      } finally { setWeakQDetailLoading(null); }
    }
  }, [weakQDetails, weakQDetailLoading]);

  const openAnswerModal = useCallback(async (qid: string, isCorrect: boolean) => {
    const cached = answerDetails[qid];
    setQuestionModal({ qid, detail: cached ?? null, loading: !cached, isCorrect });
    if (!cached && answerDetailLoading !== qid) {
      setAnswerDetailLoading(qid);
      try {
        const res = await fetch(`${API_ENDPOINT}/questions/${qid}`);
        const data = await res.json();
        setAnswerDetails(prev => ({ ...prev, [qid]: data }));
        setQuestionModal(prev => prev?.qid === qid ? { ...prev, detail: data, loading: false } : prev);
      } catch {
        setAnswerDetails(prev => ({ ...prev, [qid]: null }));
        setQuestionModal(prev => prev?.qid === qid ? { ...prev, loading: false } : prev);
      } finally { setAnswerDetailLoading(null); }
    }
  }, [answerDetails, answerDetailLoading]);

  // ── ブックマーク ──
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkOpLoading, setBookmarkOpLoading] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${user.userId}`)
      .then(r => r.json())
      .then(d => setBookmarkedIds(new Set(d.questionIds ?? [])))
      .catch(() => {});
  }, [user]);

  const toggleBookmark = useCallback(async (qid: string) => {
    if (!user || bookmarkOpLoading.has(qid)) return;
    const isBookmarked = bookmarkedIds.has(qid);
    setBookmarkOpLoading(prev => { const n = new Set(prev); n.add(qid); return n; });
    try {
      if (isBookmarked) {
        await fetch(`${API_ENDPOINT}/questions/${qid}/bookmark?userId=${user.userId}`, { method: 'DELETE' });
        setBookmarkedIds(prev => { const n = new Set(prev); n.delete(qid); return n; });
      } else {
        await fetch(`${API_ENDPOINT}/questions/${qid}/bookmark`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.userId }),
        });
        setBookmarkedIds(prev => { const n = new Set(prev); n.add(qid); return n; });
      }
    } catch {}
    finally { setBookmarkOpLoading(prev => { const n = new Set(prev); n.delete(qid); return n; }); }
  }, [user, bookmarkedIds, bookmarkOpLoading]);

  useEffect(() => {
    if (tab !== 'history' || !user || histLoaded) return;
    setHistLoading(true);
    fetch(`${API_ENDPOINT}/users/me/sessions?userId=${user.userId}&limit=10`)
      .then(r => r.json())
      .then(d => { setSessions(d.items ?? []); setHistLoaded(true); })
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, [tab, user, histLoaded]);

  const recentSessions = [...sessions]
    .sort((a, b) => (a.endedAt || a.startedAt) > (b.endedAt || b.startedAt) ? -1 : 1)
    .slice(0, 10);

  const handleToggleSession = useCallback(async (s: Session) => {
    if (!user) return;
    if (expandedSession === s.sessionId) { setExpandedSession(null); return; }
    setExpandedSession(s.sessionId);
    if (sessionAnswers[s.sessionId] || answersLoading === s.sessionId) return;
    setAnswersLoading(s.sessionId);
    try {
      const res = await fetch(`${API_ENDPOINT}/sessions/${s.sessionId}/answers?userId=${encodeURIComponent(user.userId)}`);
      const data = await res.json();
      setSessionAnswers(prev => ({ ...prev, [s.sessionId]: data.answers ?? [] }));
    } catch { setSessionAnswers(prev => ({ ...prev, [s.sessionId]: [] })); }
    finally { setAnswersLoading(null); }
  }, [user, expandedSession, sessionAnswers, answersLoading]);

  // ── UI helpers ──
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 'var(--font-size-base)', fontWeight: active ? 700 : 500,
    color: active ? 'var(--color-primary)' : 'var(--color-text-sub)',
    borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
    transition: 'color 0.15s, border-color 0.15s',
  });

  const domains = EXAM_DOMAINS[targetExam ?? ''] ?? [];

  return (
    <>
      <Helmet>
        <title>マイページ | 無限ノック</title>
      </Helmet>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">

        {/* ── タブ ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--spacing-lg)' }}>
          <button style={tabStyle(tab === 'target')} onClick={() => setTab('target')}>{ja ? '目標' : 'Goals'}</button>
          <button style={tabStyle(tab === 'analysis')} onClick={() => setTab('analysis')}>{ja ? '苦手分析' : 'Analysis'}</button>
          <button style={tabStyle(tab === 'history')} onClick={() => setTab('history')}>{ja ? '履歴' : 'History'}</button>
        </div>

        {/* ════════ 目標タブ ════════ */}
        {tab === 'target' && (
          <>
            {/* 目標資格カード */}
            <Card style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => {
  const initLevel = targetExam ? (EXAM_LEVEL_MAP[targetExam] ?? 'Practitioner') : 'Practitioner';
  const initExam = targetExam ?? (EXAM_LEVELS.find(l => l.key === initLevel)?.exams[0] ?? null);
  setActiveLevel(initLevel);
  setPreviewExam(initExam as string | null);
  setShowExamSelect(true);
}}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}><IconFlag size={13} /></span>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>{ja ? '目標資格' : 'Target Exam'}</span>
                </div>
                <div style={{ width: 35, height: 35, borderRadius: '50%', border: '1px solid var(--color-primary)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', flexShrink: 0 }}>
                  <IconPenLine size={14} />
                </div>
              </div>
              {targetExam ? (() => {
                const full = (EXAM_CONFIGS[targetExam]?.fullName ?? '').replace('AWS Certified ', '');
                const dashIdx = full.indexOf(' – ');
                const main = dashIdx >= 0 ? full.slice(0, dashIdx) : full;
                const level = dashIdx >= 0 ? '– ' + full.slice(dashIdx + 3) : null;
                const panelColor = EXAM_LEVEL_COLORS[EXAM_LEVEL[targetExam]] ?? 'var(--color-primary)';
                return (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: panelColor, lineHeight: 1.3 }}>{main}</div>
                    {level && <div style={{ fontWeight: 700, fontSize: 18, color: panelColor, lineHeight: 1.3 }}>{level}</div>}
                  </div>
                );
              })() : (
                <span style={{ fontSize: 14, color: 'var(--color-text-light)' }}>{ja ? '目標資格を設定する' : 'Set target exam'}</span>
              )}
            </Card>

            {/* 学習目標カード（タップで設定変更） */}
            <Card
              style={{ marginBottom: 12, cursor: 'pointer' }}
              onClick={() => { setEditExamDate(examDate); setEditDailyGoal(dailyGoal); setShowSettingsEdit(true); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}><IconCalendarNotebook size={13} /></span>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>{ja ? '学習目標' : 'Study Goals'}</span>
                </div>
                <div style={{ width: 35, height: 35, borderRadius: '50%', border: '1px solid var(--color-primary)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', flexShrink: 0 }}>
                  <IconPenLine size={14} />
                </div>
              </div>
              {!targetExam ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-light)' }}>{ja ? '目標資格を設定してください' : 'Set a target exam first'}</p>
              ) : (
                <>
                  {/* 受験日 */}
                  <div style={{ marginBottom: 6 }}>
                    {examDate ? (
                      <span>
                        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-primary)' }}>
                          {examDate.split('-').slice(1).map(Number).join('/')}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--color-text-main)', marginLeft: 4 }}>{ja ? '受験予定' : 'exam date'}</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>{ja ? '未設定' : 'Not set'}</span>
                    )}
                  </div>
                  {/* 目標演習量 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>
                      <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-primary)' }}>{dailyGoal}</span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>{ja ? '問 / 日' : 'Q / day'}</span>
                    </span>
                    {ja && <span style={{ fontSize: 10, color: 'var(--color-text-light)' }}>※達成で<span style={{ color: '#009E9E', fontWeight: 700 }}>+10p</span>！</span>}
                    {todayCount >= dailyGoal && <span style={{ fontSize: 12, color: 'var(--color-success)' }}>✓</span>}
                  </div>
                </>
              )}
            </Card>

            {/* 週間達成度カード（情報表示のみ・非クリッカブル） */}
            {targetExam && (
              <Card style={{ marginBottom: 12, background: 'var(--color-bg-main)', boxShadow: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}><IconTrendingUp size={13} /></span>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>{ja ? '週間達成状況' : 'Weekly Progress'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 8 }}>{ja ? '直近7日間' : 'Last 7 days'}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  {weekDays.map((d, i) => {
                    const count = weekCounts[i];
                    const rewarded = !!targetExam && localStorage.getItem(`dailyGoalReward_${targetExam}_${uid}_${d}`) === '1';
                    const achieved = rewarded || count >= dailyGoal;
                    const pct = dailyGoal > 0 ? Math.min(1, count / dailyGoal) : 0;
                    const isToday = d === jstToday();
                    const dayLabel = new Date(d + 'T12:00:00').toLocaleDateString(ja ? 'ja-JP' : 'en-US', { weekday: 'short' });
                    return (
                      <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: '100%', height: 44, borderRadius: 4, background: 'var(--color-bg-main)', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${pct * 100}%`, background: achieved ? '#009E9E' : 'rgba(0,158,158,0.2)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }} />
                          {achieved && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, color: 'white', fontWeight: 700 }}>✓</div>}
                        </div>
                        <span style={{ fontSize: 9, color: isToday ? '#009E9E' : 'var(--color-text-light)', fontWeight: isToday ? 700 : 400 }}>{dayLabel}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-light)', textAlign: 'right' }}>
                  {ja
                    ? `今週の達成日数：${weekDays.filter((d, i) => (!!targetExam && localStorage.getItem(`dailyGoalReward_${targetExam}_${uid}_${d}`) === '1') || weekCounts[i] >= dailyGoal).length}/7日`
                    : `Achieved: ${weekDays.filter((d, i) => (!!targetExam && localStorage.getItem(`dailyGoalReward_${targetExam}_${uid}_${d}`) === '1') || weekCounts[i] >= dailyGoal).length}/7 days`}
                </div>
              </Card>
            )}


            {/* 設定編集ポップアップ */}
            {showSettingsEdit && (
              <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                onClick={() => setShowSettingsEdit(false)}
                onTouchStart={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
              >
                <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 20px', width: '100%', maxWidth: 360, boxShadow: 'var(--box-shadow-md)' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{ja ? '目標設定' : 'Edit Settings'}</span>
                    <button onClick={() => setShowSettingsEdit(false)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                  {/* 受験日 */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 8 }}>{ja ? '受験日' : 'Exam Date'}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="date"
                        value={editExamDate}
                        onChange={e => setEditExamDate(e.target.value)}
                        style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, background: 'var(--color-bg-white)', color: 'var(--color-text-main)', cursor: 'pointer' }}
                      />
                      {editExamDate && (
                        <button onClick={() => setEditExamDate('')} style={{ padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-sub)' }}>
                          {ja ? '削除' : 'Clear'}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 目標演習量 */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 12 }}>{ja ? '1日の目標演習量' : 'Daily Goal'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
                      <button onClick={() => setEditDailyGoal(v => Math.max(10, v - 5))} disabled={editDailyGoal <= 10} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'transparent', cursor: editDailyGoal <= 10 ? 'default' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: editDailyGoal <= 10 ? 'var(--color-text-light)' : 'var(--color-text-main)' }}>−</button>
                      <span style={{ fontSize: 24, fontWeight: 800, minWidth: 64, textAlign: 'center', color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {editDailyGoal}<span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2, color: 'var(--color-text-sub)' }}>{ja ? '問' : 'Q'}</span>
                      </span>
                      <button onClick={() => setEditDailyGoal(v => Math.min(100, v + 5))} disabled={editDailyGoal >= 100} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'transparent', cursor: editDailyGoal >= 100 ? 'default' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: editDailyGoal >= 100 ? 'var(--color-text-light)' : 'var(--color-text-main)' }}>+</button>
                    </div>
                  </div>
                  {/* 保存ボタン */}
                  <Button variant="primary" size="lg" fullWidth onClick={() => {
                    handleExamDateChange(editExamDate);
                    handleDailyGoalChange(editDailyGoal);
                    setShowSettingsEdit(false);
                  }}>
                    {ja ? '保存' : 'Save'}
                  </Button>
                </div>
              </div>
            )}

            {/* 目標資格選択オーバーレイ */}
            {showExamSelect && (() => {
              const currentLevelDef = EXAM_LEVELS.find(l => l.key === activeLevel) ?? EXAM_LEVELS[0];
              const levelColor = currentLevelDef.color;
              return (
                <div
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                  onClick={() => { setShowExamSelect(false); setPreviewExam(null); }}
                  onTouchStart={e => e.stopPropagation()}
                  onTouchMove={e => e.stopPropagation()}
                >
                  <div
                    style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', width: '100%', maxWidth: isMobile ? 420 : 630, boxShadow: 'var(--box-shadow-md)', height: isMobile ? '75vh' : '78vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* ヘッダー */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0', flexShrink: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{ja ? '目標資格を選択' : 'Select Target Exam'}</span>
                      <button onClick={() => { setShowExamSelect(false); setPreviewExam(null); }} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
                    </div>

                    {/* レベルタブ */}
                    <div
                      style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', flexShrink: 0, overflowX: 'auto' }}
                      onTouchStart={e => e.stopPropagation()}
                      onTouchMove={e => e.stopPropagation()}
                    >
                      {EXAM_LEVELS.map(({ key, color }) => (
                        <button key={key} onClick={() => {
                          setActiveLevel(key);
                          const levelDef = EXAM_LEVELS.find(l => l.key === key);
                          const examInLevel = levelDef?.exams.find(e => e === targetExam) ?? levelDef?.exams[0] ?? null;
                          setPreviewExam(examInLevel as string | null);
                        }} style={{
                          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: activeLevel === key ? `2px solid ${color}` : '2px solid transparent',
                          marginBottom: -2, color: activeLevel === key ? color : 'var(--color-text-sub)',
                          fontWeight: activeLevel === key ? 700 : 400, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {key}
                        </button>
                      ))}
                    </div>

                    {/* 資格カード（横スクロール） */}
                    <div
                      style={{ display: 'flex', gap: 10, padding: '14px 20px', overflowX: 'auto', flexShrink: 0 }}
                      onTouchStart={e => e.stopPropagation()}
                      onTouchMove={e => e.stopPropagation()}
                    >
                      {currentLevelDef.exams.map(exam => {
                        const isSelected = targetExam === exam;
                        const isPreviewing = previewExam === exam;
                        const ExamIcon = EXAM_ICON_COMPONENTS[exam];
                        return (
                          <button
                            key={exam}
                            onClick={() => setPreviewExam(isPreviewing ? null : exam)}
                            style={{
                              flexShrink: 0, width: 80, padding: '10px 6px 8px', cursor: 'pointer',
                              borderRadius: 10, textAlign: 'center', position: 'relative',
                              border: `2px solid ${isPreviewing || isSelected ? levelColor : 'var(--color-border)'}`,
                              background: isPreviewing
                                ? `linear-gradient(145deg, ${levelColor}, ${levelColor}bb)`
                                : isSelected
                                ? `linear-gradient(145deg, ${levelColor}22, ${levelColor}44)`
                                : `linear-gradient(145deg, var(--color-bg-card), ${levelColor}18)`,
                            }}
                          >
                            {isSelected && (
                              <div style={{ position: 'absolute', top: 4, right: 4, color: isPreviewing ? '#fff' : levelColor, lineHeight: 0 }}>
                                <IconCircleCheck size={14} />
                              </div>
                            )}
                            {ExamIcon && (
                              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: isPreviewing ? '#fff' : isSelected ? levelColor : 'var(--color-text-light)' }}>
                                <ExamIcon size={18} />
                              </div>
                            )}
                            <div style={{ fontWeight: 800, fontSize: 15, color: isPreviewing ? '#fff' : isSelected ? levelColor : 'var(--color-text-main)', lineHeight: 1 }}>{exam}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* 詳細パネル（スクロール） */}
                    <div ref={examDetailScrollRef} style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--color-border)' }}>
                      {previewExam && (() => {
                        const exam = previewExam;
                        const cfg = EXAM_CONFIGS[exam];
                        return (
                          <div style={{ padding: '16px 20px' }}>
                            <div style={{ marginBottom: 10 }}>
                              {EXAM_CATCHCOPY[exam] && (
                                <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontStyle: 'italic', marginBottom: 4 }}>{EXAM_CATCHCOPY[exam]}</div>
                              )}
                              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--color-text-main)', marginBottom: 2 }}>
                                {(cfg?.fullName ?? exam).replace('AWS Certified ', '')}
                              </div>
                              <div style={{ fontSize: 11, color: levelColor, fontWeight: 600 }}>{activeLevel}</div>
                            </div>
                            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.7 }}>{EXAM_DESC[exam] ?? ''}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 12, padding: '10px 12px', background: 'var(--color-bg-main)', borderRadius: 8 }}>
                              {[
                                { label: ja ? '試験コード' : 'Code',       value: cfg?.examCode ?? '' },
                                { label: ja ? '問題数'     : 'Questions',  value: `${cfg?.totalQuestions ?? '—'}${ja ? '問' : 'Q'}` },
                                { label: ja ? '試験時間'   : 'Duration',   value: `${cfg?.timeLimitMin ?? '—'}${ja ? '分' : 'min'}` },
                                { label: ja ? '合格ライン' : 'Pass Score', value: `${PASS_SCORES[exam] ?? '—'}/1000` },
                              ].map(({ label: lbl, value }) => (
                                <div key={lbl}>
                                  <div style={{ fontSize: 9, color: 'var(--color-text-light)', marginBottom: 2 }}>{lbl}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-main)' }}>{value}</div>
                                </div>
                              ))}
                            </div>
                            {EXAM_URLS[exam] && (
                              <a href={EXAM_URLS[exam]} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
                                {ja ? '公式ページ →' : 'Official page →'}
                              </a>
                            )}
                            {passComments[exam] && (
                              <div style={{ marginTop: 12, padding: '10px 12px', background: `${levelColor}12`, borderLeft: `3px solid ${levelColor}`, borderRadius: '0 6px 6px 0' }}>
                                <div style={{ fontSize: 10, color: levelColor, fontWeight: 700, marginBottom: 4 }}>{ja ? '運営者コメント' : 'From the team'}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{passComments[exam]}</div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* フッター：メッセージ＋決定ボタン */}
                    {previewExam && (() => {
                      const exam = previewExam;
                      const isCurrentTarget = targetExam === exam;
                      return (
                        <div style={{ flexShrink: 0, borderTop: `2px solid ${levelColor}33`, background: `${levelColor}08`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minHeight: 64 }}>
                          {/* メッセージ（右揃え・ボタン直左） */}
                          {isCurrentTarget && (
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)' }}>✓ {ja ? '学習中' : 'Studying'}</div>
                          )}
                          {/* 決定ボタン */}
                          {isCurrentTarget ? (
                            <button disabled
                              style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: levelColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexShrink: 0 }}>
                              <IconBookOpenCheck size={22} />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                localStorage.setItem(`targetExam_${uid}`, exam);
                                window.dispatchEvent(new CustomEvent('targetExamChanged', { detail: exam }));
                                setTargetExam(exam);
                              }}
                              style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${levelColor}`, background: 'var(--color-bg-white)', color: levelColor, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', flexShrink: 0 }}>
                              <IconBook size={22} />
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ════════ 苦手分析タブ ════════ */}
        {tab === 'analysis' && (
          <>
            {!user ? (
              <Card padding="var(--spacing-xl)">
                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? 'ログインすると苦手分析が表示されます' : 'Log in to view your analysis'}
                </p>
              </Card>
            ) : !targetExam ? (
              <Card padding="var(--spacing-xl)">
                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? '目標資格を設定してください' : 'Set a target exam first'}
                </p>
              </Card>
            ) : statsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <div className="sherpa-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              </div>
            ) : (
              <>
                {/* 苦手ドメイン */}
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <IconAnnoyed size={14} />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{ja ? '苦手ドメイン' : 'Weak Domains'}</span>
                  </div>
                  {!focusedUnlocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--color-bg-main)' }}>
                      <IconLock size={14} />
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>
                          {ja ? `あと${Math.max(0, FOCUSED_UNLOCK_THRESHOLD - answeredCount)}問演習するとアンロック` : `${Math.max(0, FOCUSED_UNLOCK_THRESHOLD - answeredCount)} more questions to unlock`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                          {ja ? `現在 ${answeredCount}/${FOCUSED_UNLOCK_THRESHOLD}問` : `${answeredCount}/${FOCUSED_UNLOCK_THRESHOLD} answered`}
                        </div>
                      </div>
                    </div>
                  ) : domains.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-light)' }}>
                      {ja ? 'ドメイン情報がありません' : 'No domain data'}
                    </p>
                  ) : (
                    <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...domains].sort((a, b) => {
                        const getPct = (d: string) => {
                          const stat = domainStats.find(s => s.tagId === d);
                          const recent = stat?.recentResults ?? [];
                          const total = recent.length;
                          if (total === 0) return -1;
                          return recent.filter(Boolean).length / total;
                        };
                        return getPct(a) - getPct(b);
                      }).map((domain, i) => {
                        const stat = domainStats.find(s => s.tagId === domain);
                        const recent = stat?.recentResults ?? [];
                        const correct = recent.filter(Boolean).length;
                        const total = recent.length;
                        const pct = total > 0 ? Math.round((correct / total) * 100) : null;
                        const isWeak = pct !== null && pct < DOMAIN_RATE_WARNING * 100;
                        const isFair = pct !== null && pct < DOMAIN_RATE_CAUTION * 100 && !isWeak;
                        const color = pct === null ? 'var(--color-text-light)' : isWeak ? 'var(--color-danger)' : isFair ? 'var(--color-caution)' : 'var(--color-success)';
                        const barGradient = isWeak ? 'var(--bar-gradient-danger)' : isFair ? 'var(--bar-gradient-caution)' : 'var(--bar-gradient-success)';
                        const domainLabel = lang === 'en' ? (DOMAIN_NAME_EN[domain] ?? domain) : domain;
                        return (
                          <div key={domain} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 12, color: isWeak ? 'var(--color-danger)' : 'var(--color-text-sub)', fontWeight: isWeak ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {isWeak && '⚠ '}{domainLabel}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, marginLeft: 6 }}>
                                  {pct !== null ? `${pct}%` : (ja ? '未演習' : 'N/A')}
                                </span>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-bg-main)', overflow: 'hidden' }}>
                                {pct !== null && <div style={{ height: '100%', width: `${pct}%`, background: barGradient, borderRadius: 3, transformOrigin: 'left center', animation: `growWidth 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 30}ms both` }} />}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                              {Array.from({ length: 5 }, (_, i) => (
                                <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: recent[i] === true ? 'var(--color-success)' : recent[i] === false ? 'var(--color-danger)' : 'var(--color-bg-main)' }} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                      {focusedUnlocked ? (
                        <button
                          onClick={() => navigate('/aws/', { state: { startFocused: true } })}
                          style={{ width: '100%', height: 44, border: 'none', background: '#009E9E', color: '#fff', fontWeight: 600, fontSize: 'var(--font-size-base)', borderRadius: 'var(--border-radius-full)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {ja ? 'しっかり対策' : 'Focused Practice'}
                        </button>
                      ) : (
                        <button
                          disabled
                          style={{ width: '100%', height: 44, border: '1.5px solid var(--color-border)', borderRadius: 'var(--border-radius-full)', background: 'transparent', color: 'var(--color-text-light)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                        >
                          <IconLock size={13} />
                          {ja ? 'しっかり対策' : 'Focused Practice'}
                        </button>
                      )}
                    </div>
                    </>
                  )}
                </Card>

                {/* 頻出ミス問題 */}
                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>✗</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{ja ? '間違えやすい問題（2回以上）' : 'Frequent Mistakes (2+ times)'}</span>
                  </div>
                  {!focusedUnlocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--color-bg-main)' }}>
                      <IconLock size={14} />
                      <span style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>
                        {ja ? `あと${Math.max(0, FOCUSED_UNLOCK_THRESHOLD - answeredCount)}問でアンロック` : `${Math.max(0, FOCUSED_UNLOCK_THRESHOLD - answeredCount)} more to unlock`}
                      </span>
                    </div>
                  ) : weakLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                      <div className="sherpa-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                    </div>
                  ) : weakQuestions.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-light)', textAlign: 'center', padding: '8px 0' }}>
                      {ja ? '2回以上間違えた問題はありません' : 'No questions wrong 2+ times'}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {weakQuestions.map(q => {
                        const isExpanded = expandedWeakQ === q.questionId;
                        const detail = weakQDetails[q.questionId];
                        return (
                          <div key={q.questionId} style={{ borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                            <div
                              onClick={() => openWeakQModal(q.questionId)}
                              style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}
                            >
                              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 4, padding: '2px 6px', marginTop: 1 }}>
                                ×{q.incorrectCount}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.5, flex: 1 }}>
                                {q.questionText?.slice(0, 80)}{(q.questionText?.length ?? 0) > 80 ? '…' : ''}
                              </span>
                              <span style={{ flexShrink: 0, color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', marginTop: 2, transform: 'rotate(-90deg)' }}>
                                <IconChevronDown size={14} />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </>
            )}
          </>
        )}

        {/* ════════ 履歴タブ ════════ */}
        {tab === 'history' && (
          <>
            {!user ? (
              <Card padding="var(--spacing-xl)">
                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? 'ログインすると履歴が表示されます' : 'Log in to view your history'}
                </p>
              </Card>
            ) : histLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <div className="sherpa-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              </div>
            ) : recentSessions.length === 0 ? (
              <Card padding="var(--spacing-xl)">
                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? 'まだセッションがありません' : 'No sessions yet'}
                </p>
              </Card>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 10 }}>
                  {ja ? '直近10セッション' : 'Last 10 sessions'}
                </div>
                {recentSessions.map(s => {
                  const modeLabel = s.mode === 'exam'
                    ? (s.isMini ? (ja ? 'ミニ模試' : 'Mini Exam') : (ja ? '模試' : 'Mock Exam'))
                    : s.isFocused ? (ja ? 'しっかり対策' : 'Focused') : (ja ? 'サクッと演習' : 'Quick');
                  const modeBg = s.mode === 'exam' ? '#fff0f0' : s.isFocused ? '#e6f4f4' : 'var(--color-primary-light)';
                  const modeColor = s.mode === 'exam' ? 'var(--color-danger)' : s.isFocused ? '#009E9E' : 'var(--color-primary)';
                  const d = new Date(s.endedAt || s.startedAt);
                  const dateLabel = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                  const isExpanded = expandedSession === s.sessionId;
                  const answers = sessionAnswers[s.sessionId];
                  const qCount = s.questionIds?.length ?? 0;
                  const scoreColor = s.mode === 'exam'
                    ? (s.isPassed ? 'var(--color-success)' : 'var(--color-danger)')
                    : (s.score >= 70 ? 'var(--color-success)' : 'var(--color-danger)');

                  return (
                    <Card key={s.sessionId} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleToggleSession(s)}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--border-radius-full)', background: modeBg, color: modeColor, flexShrink: 0 }}>
                          {modeLabel}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-sub)', flex: 1, minWidth: 0 }}>
                          {dateLabel}
                          {qCount > 0 && <span style={{ marginLeft: 6, color: 'var(--color-text-light)' }}>{qCount}{ja ? '問' : 'Q'}</span>}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 15, color: scoreColor, flexShrink: 0 }}>{s.score}%</span>
                        <span style={{ color: 'var(--color-text-light)', fontSize: 14, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>›</span>
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                          {answersLoading === s.sessionId ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                              <div className="sherpa-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                            </div>
                          ) : !answers || answers.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-light)', textAlign: 'center' }}>
                              {ja ? '回答データがありません' : 'No answer data'}
                            </p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {answers.map((a, idx) => {
                                const isAExpanded = expandedAnswer === a.questionId;
                                const aDetail = answerDetails[a.questionId];
                                return (
                                  <div
                                    key={a.questionId + idx}
                                    onClick={() => openAnswerModal(a.questionId, !!a.isCorrect)}
                                    style={{ borderRadius: 6, border: '1px solid var(--color-border)', overflow: 'hidden', cursor: 'pointer' }}
                                  >
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px' }}>
                                      <span style={{ flexShrink: 0, width: 15, height: 15, borderRadius: '50%', background: a.isCorrect ? 'var(--color-success)' : 'var(--color-danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 700 }}>
                                        {a.isCorrect ? '○' : '×'}
                                      </span>
                                      <span style={{ fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.5, flex: 1 }}>
                                        {a.questionText?.slice(0, 60)}{(a.questionText?.length ?? 0) > 60 ? '…' : ''}
                                      </span>
                                      {user && (
                                        <button
                                          onClick={e => { e.stopPropagation(); toggleBookmark(a.questionId); }}
                                          disabled={bookmarkOpLoading.has(a.questionId)}
                                          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', opacity: bookmarkOpLoading.has(a.questionId) ? 0.5 : 1 }}
                                        >
                                          <span style={{ color: bookmarkedIds.has(a.questionId) ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-light)' }}>
                                            <IconStar filled={bookmarkedIds.has(a.questionId)} size={14} />
                                          </span>
                                        </button>
                                      )}
                                      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: 'var(--color-text-light)', transform: 'rotate(-90deg)' }}>
                                        <IconChevronDown size={13} />
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* ── 問題詳細モーダル ── */}
      {questionModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 'var(--spacing-lg)' }}
          onClick={() => setQuestionModal(null)}
        >
          <div
            style={{ background: 'var(--color-bg-white)', borderRadius: isMobile ? '16px 16px 0 0' : 'var(--border-radius-lg)', padding: 'var(--spacing-xl)', width: '100%', maxWidth: isMobile ? '100%' : 600, maxHeight: isMobile ? '85vh' : '80vh', overflowY: 'auto', boxShadow: 'var(--box-shadow-lg)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)' }}>
                {questionModal.isCorrect !== undefined
                  ? (questionModal.isCorrect
                    ? <span style={{ color: 'var(--color-success)' }}>○ {ja ? '正解' : 'Correct'}</span>
                    : <span style={{ color: 'var(--color-danger)' }}>× {ja ? '不正解' : 'Incorrect'}</span>)
                  : (ja ? '問題詳細' : 'Question Detail')}
              </span>
              <button onClick={() => setQuestionModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-sub)', fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>✕</button>
            </div>

            {questionModal.loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xl) 0' }}>
                <div className="sherpa-spinner" />
              </div>
            ) : questionModal.detail ? (
              <div style={{ userSelect: 'text' }}>
                {/* 問題文 */}
                <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', lineHeight: 1.75, margin: '0 0 var(--spacing-lg)', whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                  {questionModal.detail.questionText}
                </p>
                {/* 選択肢 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
                  {(questionModal.detail.choices ?? []).map((c: string, i: number) => {
                    const isCorrect = (questionModal.detail.correctAnswerIndices ?? []).includes(i);
                    return (
                      <div key={i} style={{ fontSize: 'var(--font-size-sm)', padding: '10px 14px', borderRadius: 'var(--border-radius-md)', border: `1.5px solid ${isCorrect ? 'var(--color-success)' : 'var(--color-border)'}`, background: isCorrect ? 'var(--color-feedback-correct-bg)' : 'var(--color-bg-main)', color: isCorrect ? 'var(--color-success)' : 'var(--color-text-sub)', lineHeight: 1.6 }}>
                        <span style={{ fontWeight: 700, marginRight: 6 }}>{String.fromCharCode(65 + i)}.</span>
                        {c.replace(/^[A-E]\.\s*/, '')}
                      </div>
                    );
                  })}
                </div>
                {/* 解説 */}
                {questionModal.detail.explanation && (
                  <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-bg-info)', border: '1px solid var(--color-border-info)' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-info)', marginBottom: 6 }}>{ja ? '解説' : 'Explanation'}</div>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', margin: 0, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{questionModal.detail.explanation}</p>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>{ja ? '詳細を取得できませんでした' : 'Failed to load details'}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
