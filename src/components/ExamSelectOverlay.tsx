'use client';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { API_ENDPOINT, EXAM_CONFIGS, EXAM_DOMAINS, DOMAIN_WEIGHTS, PASS_SCORES } from '@/constants';
import { EXAM_ICON_COMPONENTS, IconBook, IconBookOpenCheck, IconCircleCheck } from '@/components/Icons';

// 決定ボタンのフリップ完了時に飛ばすパーティクル放散。
// パネルの overflow:hidden に切られないよう body 直下へ portal し、
// fixed 座標（ボタン中心）から放散することで輪郭を越えて飛ばす。
// 色は資格レベルカラー（levelColor）の濃淡 + 少量の白アクセント。
const BURST_COUNT = 26;

function ConfirmBurst({ x, y, color, onDone }: { x: number; y: number; color: string; onDone: () => void }) {
  // 6桁hexにアルファを付けて濃淡を作る（levelColor は全て #rrggbb 形式）
  const palette = useMemo(() => [color, color, color, `${color}cc`, `${color}99`, '#ffffff'], [color]);
  const particles = useMemo(() => Array.from({ length: BURST_COUNT }, (_, i) => {
    const angle = (360 / BURST_COUNT) * i + (Math.random() * 22 - 11);
    const dist = 46 + Math.random() * 78;
    const rad = (angle * Math.PI) / 180;
    return {
      id: i,
      dx: Math.cos(rad) * dist,
      dy: Math.sin(rad) * dist,
      size: 6 + Math.random() * 7,
      color: palette[Math.floor(Math.random() * palette.length)],
      delay: Math.random() * 0.08,
      dur: 0.5 + Math.random() * 0.28,
      round: Math.random() > 0.4,
    };
  }), [palette]);

  useEffect(() => {
    const t = setTimeout(onDone, 820);
    return () => clearTimeout(t);
  }, [onDone]);

  const css = useMemo(() => particles.map(p => `
    @keyframes esoBurst-${p.id} {
      0%   { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
      100% { transform: translate(-50%,-50%) translate(${p.dx}px,${p.dy}px) scale(0.08); opacity: 0; }
    }`).join(''), [particles]);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9900, pointerEvents: 'none' }}>
      <style>{css}</style>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: x, top: y,
          width: p.size, height: p.round ? p.size : p.size * 0.5,
          borderRadius: p.round ? '50%' : '2px',
          background: p.color,
          boxShadow: `0 0 ${p.size}px ${p.color}88`,
          animation: `esoBurst-${p.id} ${p.dur}s cubic-bezier(.25,.6,.4,1) ${p.delay}s both`,
        }} />
      ))}
    </div>,
    document.body,
  );
}

const EXAM_LEVELS = [
  { key: 'Practitioner', color: '#6b9e3a', exams: ['CLF', 'AIF'] },
  { key: 'Associate',    color: '#006CE0', exams: ['SAA', 'DVA', 'SOA', 'DEA', 'MLA'] },
  { key: 'Professional', color: '#8b5cf6', exams: ['SAP', 'DOP', 'AIP'] },
  { key: 'Specialty',    color: '#0ea5e9', exams: ['ANS', 'SCS'] },
] as const;

export const EXAM_DESC: Record<string, string> = {
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

const EXAM_CATCHCOPY: Record<string, string> = {
  CLF: 'AWS資格の登竜門！誰もがここから！',
  AIF: 'AI時代の新教養！まずはAI×AWSを知ろう！',
  SAA: '迷ったらコレ！AWS資格の王道エース！',
  DVA: 'コードでクラウドを動かせ！開発者の定番資格！',
  SOA: '運用の現場力を証明！トラブル対応の第一人者へ！',
  DEA: 'データ活用の第一歩！分析基盤の設計者へ！',
  MLA: '機械学習エンジニアへの登竜門！AIを作る側へ！',
  SAP: 'AWS設計の最高峰！アーキテクト最難関！',
  DOP: '運用・自動化・改善の集大成！DevOpsの最高峰！',
  AIP: '生成AIをビジネスへ！AI開発の最前線！',
  SCS: '守れる者だけが任される！AWSセキュリティの番人！',
  ANS: 'ネットワークの深淵へ！AWS屈指の難関資格！',
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

interface ExamSelectOverlayProps {
  targetExam: string | null;
  uid: string;
  lang: string;
  isMobile: boolean;
  /** 選択確定時コールバック */
  onSelect: (exam: string) => void;
  /** 閉じるボタン用コールバック。未指定の場合は閉じられない（初回オンボーディング用） */
  onClose?: () => void;
  /** デスクトップ時の最大幅（px）。省略時は 420 */
  desktopMaxWidth?: number;
  /** デスクトップ時の高さ（vh 文字列）。省略時は '60vh' */
  desktopHeight?: string;
}

export default function ExamSelectOverlay({
  targetExam, uid, lang, isMobile, onSelect, onClose,
  desktopMaxWidth = 420, desktopHeight = '60vh',
}: ExamSelectOverlayProps) {
  const ja = lang === 'ja';
  const initLevel = targetExam
    ? (EXAM_LEVELS.find(l => l.exams.includes(targetExam as never))?.key ?? 'Practitioner')
    : 'Practitioner';

  const [activeLevel, setActiveLevel] = useState<string>(initLevel);
  const [previewExam, setPreviewExam] = useState<string | null>(targetExam ?? EXAM_LEVELS[0].exams[0]);
  const [passComments, setPassComments] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [domainOpen, setDomainOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/settings/pass-comments`)
      .then(r => r.json())
      .then(d => { if (d.comments) setPassComments(d.comments); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setDomainOpen(false);
  }, [previewExam]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const currentLevelDef = EXAM_LEVELS.find(l => l.key === activeLevel) ?? EXAM_LEVELS[0];
  const levelColor = currentLevelDef.color;
  const dismissible = !!onClose;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={dismissible ? onClose : undefined}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      <div
        data-kbscope="1"
        style={{
          background: 'var(--color-bg-white)',
          borderRadius: 'var(--border-radius-lg)',
          width: '100%',
          maxWidth: isMobile ? 420 : desktopMaxWidth,
          boxShadow: 'var(--box-shadow-md)',
          height: isMobile ? '75vh' : desktopHeight,
          maxHeight: isMobile ? '75vh' : desktopHeight,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {ja ? '目標資格を選択' : 'Select Target Exam'}
            </span>
            <a
              href="https://d1.awsstatic.com/onedam/marketing-channels/website/aws/ja_JP/certification/approved/pdfs/AWS_certification_paths.pdf"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
            >
              {ja ? '何を取るべき？→' : 'Which cert should I take? →'}
            </a>
          </div>
          {dismissible && (
            <button
              data-kbclose="1"
              onClick={onClose}
              style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}
            >✕</button>
          )}
        </div>

        {/* レベルタブ */}
        <div
          style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', flexShrink: 0, overflowX: 'auto' }}
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
        >
          {EXAM_LEVELS.map(({ key, color }) => (
            <button key={key} data-kbnav="tab" data-kbtab-active={activeLevel === key ? '1' : undefined} onClick={() => {
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
                data-kbnav="1"
                onClick={() => setPreviewExam(exam)}
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
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--color-border)' }}>
          {previewExam && (() => {
            const exam = previewExam;
            const cfg = EXAM_CONFIGS[exam];
            return (
              <div style={{ padding: '16px 20px' }}>
                <div style={{ marginBottom: 10 }}>
                  {EXAM_CATCHCOPY[exam] && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontStyle: 'italic', marginBottom: 4 }}>{EXAM_CATCHCOPY[exam]}</div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--color-text-main)' }}>
                    {(cfg?.fullName ?? exam).replace('AWS Certified ', '')}
                  </div>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.7 }}>
                  {EXAM_DESC[exam] ?? ''}
                  {EXAM_URLS[exam] && (
                    <a href={EXAM_URLS[exam]} target="_blank" rel="noopener noreferrer"
                      style={{ marginLeft: 4, color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {ja ? '公式ページ →' : 'Official page →'}
                    </a>
                  )}
                </p>
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--color-bg-main)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
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
                  {(() => {
                    const domains = EXAM_DOMAINS[exam] ?? [];
                    const weights = DOMAIN_WEIGHTS[exam] ?? [];
                    if (domains.length === 0 || weights.length === 0) return null;
                    return (
                      <>
                        <button
                          onClick={() => setDomainOpen(o => !o)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '8px 0 0', fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600,
                          }}
                        >
                          <span>{ja ? 'ドメイン別出題割合' : 'Domain Weights'}</span>
                          <span style={{ fontSize: 9, display: 'inline-block', transform: domainOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                        </button>
                        {domainOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
                            {domains.map((d, i) => {
                              const pct = weights[i] ?? 0;
                              return (
                                <div key={d}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-sub)', marginBottom: 3 }}>
                                    <span>{d}</span>
                                    <span style={{ fontWeight: 700, color: levelColor, flexShrink: 0, marginLeft: 8 }}>{pct}%</span>
                                  </div>
                                  <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2 }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: levelColor, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
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

        {/* フッター：決定ボタン */}
        {previewExam && (() => {
          const exam = previewExam;
          const isCurrentTarget = targetExam === exam;
          return (
            <div style={{ flexShrink: 0, borderTop: `2px solid ${levelColor}33`, background: `${levelColor}08`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minHeight: 64 }}>
              <style>{`@keyframes examStudyingFade { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: none; } }`}</style>
              {(isCurrentTarget || confirming) && (
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)', animation: (confirming && !isCurrentTarget) ? 'examStudyingFade 0.4s ease 0.5s both' : undefined }}>✓ {ja ? '学習中' : 'Studying'}</div>
              )}
              {isCurrentTarget ? (
                <button disabled style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: levelColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', boxShadow: 'var(--box-shadow-pop)', flexShrink: 0, transition: 'none' }}>
                  <IconBookOpenCheck size={22} />
                </button>
              ) : (
                <button
                  ref={confirmBtnRef}
                  data-kbnav="confirm"
                  onClick={() => {
                    if (confirming) return;
                    setConfirming(true);
                    localStorage.setItem(`targetExam_${uid}`, exam);
                    window.dispatchEvent(new CustomEvent('targetExamChanged', { detail: exam }));
                    // 押下直後にフリップとパーティクル放散を同時開始
                    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                    if (!reduceMotion) {
                      const r = confirmBtnRef.current?.getBoundingClientRect();
                      if (r) setBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                    }
                    // フリップ(0.55s)→「学習中」フェードイン(0.5s遅延)→反映
                    setTimeout(() => { onSelect(exam); setConfirming(false); }, 1100);
                  }}
                  disabled={confirming}
                  aria-label={ja ? '決定' : 'Confirm'}
                  style={{
                    width: 44, height: 44, flexShrink: 0, padding: 0, border: 'none',
                    background: 'transparent', cursor: confirming ? 'default' : 'pointer',
                    perspective: 600, transition: 'none',
                  }}
                >
                  {/* オセロのようにひっくり返る3Dフリップ（表=決定 / 裏=学習中） */}
                  <div style={{
                    position: 'relative', width: '100%', height: '100%',
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.55s cubic-bezier(.45,.05,.3,1)',
                    transform: confirming ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}>
                    {/* 表面：決定 */}
                    <span style={{
                      position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                      border: `2px solid ${levelColor}`, background: 'var(--color-bg-white)', color: levelColor,
                      boxShadow: 'var(--box-shadow-pop)',
                    }}>
                      <IconBook size={22} />
                    </span>
                    {/* 裏面：学習中 */}
                    <span style={{
                      position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                      background: levelColor, color: '#fff', boxShadow: 'var(--box-shadow-pop)',
                    }}>
                      <IconBookOpenCheck size={22} />
                    </span>
                  </div>
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {burst && <ConfirmBurst x={burst.x} y={burst.y} color={levelColor} onDone={() => setBurst(null)} />}
    </div>,
    document.body,
  );
}
