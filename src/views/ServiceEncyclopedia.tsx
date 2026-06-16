'use client';
import React, { useState, useEffect } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { IconLock, IconLightbulb, ServiceIcon, isServiceIconKey, ServiceIconImg } from '../components/Icons';
import { CATALOG, getDailyService, ServiceEntry } from '../data/awsServiceCatalog';
import { API_ENDPOINT } from '../constants';

type EncyclopediaService = {
  serviceId: string;
  name: string;
  category?: string;
  icon: string;
  description: string;
  trivia?: string;
  docUrl?: string;
};


function isUnlocked(svc: ServiceEntry, unlockedMap: Record<string, string>): boolean {
  if (svc.serviceIds?.some(id => id in unlockedMap)) return true;
  if (svc.name in unlockedMap) return true;
  return false;
}

function unlockKey(svc: ServiceEntry): string {
  return svc.serviceIds?.[0] ?? svc.name;
}


function resolveEncyclopediaIcon(icon: string, name: string): string {
  if (!icon || icon.startsWith('/') || icon.startsWith('http') || isServiceIconKey(icon)) return icon;
  const lower = name.toLowerCase();
  for (const cat of CATALOG) {
    const entry = cat.services.find(s => s.name.toLowerCase() === lower);
    if (entry?.icon) return entry.icon;
  }
  return icon;
}

function renderIcon(service: EncyclopediaService, size: number): React.ReactNode {
  const icon = resolveEncyclopediaIcon(service.icon, service.name);
  return <ServiceIconImg icon={icon} name={service.name} size={size} />;
}

export default function ServiceEncyclopedia() {
  const { lang } = useLanguage();
  const ja = lang === 'ja';
  const { user } = useAuth();
  const uid = user?.userId ?? 'guest';

  const [unlockedMap, setUnlockedMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(`encyclopediaUnlocked_${uid}`) ?? '{}'); } catch { return {}; }
  });
  const [storedServices, setStoredServices] = useState<Record<string, EncyclopediaService>>(() => {
    try { return JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}'); } catch { return {}; }
  });
  const [selected, setSelected] = useState<EncyclopediaService | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unlocked'>('unlocked');

  // uidが変わった時（ログイン/ログアウト）にlocalStorageから再読み込み
  useEffect(() => {
    try { setUnlockedMap(JSON.parse(localStorage.getItem(`encyclopediaUnlocked_${uid}`) ?? '{}')); } catch {}
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = () => {
      try { setUnlockedMap(JSON.parse(localStorage.getItem(`encyclopediaUnlocked_${uid}`) ?? '{}')); } catch {}
      try { setStoredServices(JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}')); } catch {}
    };
    window.addEventListener('encyclopediaUpdated', refresh);
    return () => window.removeEventListener('encyclopediaUpdated', refresh);
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // サーバーから解放済みデータを取得してローカルとマージ
  useEffect(() => {
    if (!user?.userId) return;
    fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks?userId=${encodeURIComponent(user.userId)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.unlocks || typeof data.unlocks !== 'object') return;
        // サーバーから返ったサービス詳細データをローカルにマージ（新デバイスでのアイコン復元）
        if (data.services && typeof data.services === 'object' && Object.keys(data.services).length > 0) {
          const existingSvcs = (() => { try { return JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}'); } catch { return {}; } })();
          const mergedSvcs = { ...data.services, ...existingSvcs };
          localStorage.setItem('encyclopediaServices', JSON.stringify(mergedSvcs));
          setStoredServices(mergedSvcs);
        }
        // todayServiceId・unlockDate をローカルに復元（ローカルデータ削除後の今日のカード復旧）
        const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        if (data.todayServiceId && data.unlockDate === jstDate && !localStorage.getItem(`encyclopediaTodayServiceId_${uid}`)) {
          localStorage.setItem(`encyclopediaTodayServiceId_${uid}`, data.todayServiceId);
          localStorage.setItem(`encyclopediaUnlockDate_${uid}`, data.unlockDate);
        }
        const local = (() => { try { return JSON.parse(localStorage.getItem(`encyclopediaUnlocked_${uid}`) ?? '{}'); } catch { return {}; } })();
        // サーバーが空でローカルにデータがある場合はサーバーを正とみなす（管理者リセット後）
        if (Object.keys(data.unlocks).length === 0 && Object.keys(local).length > 0) {
          localStorage.setItem(`encyclopediaUnlocked_${uid}`, '{}');
          localStorage.removeItem(`encyclopediaUnlockDate_${uid}`);
          localStorage.removeItem(`encyclopediaTodayServiceId_${uid}`);
          setUnlockedMap({});
          return;
        }
        const merged: Record<string, string> = { ...data.unlocks, ...local };
        const changed = Object.keys(merged).some(k => !(k in local));
        if (changed) {
          localStorage.setItem(`encyclopediaUnlocked_${uid}`, JSON.stringify(merged));
          setUnlockedMap(merged);
          const unlockDate = localStorage.getItem(`encyclopediaUnlockDate_${uid}`) ?? data.unlockDate;
          const todayServiceId = localStorage.getItem(`encyclopediaTodayServiceId_${uid}`) ?? data.todayServiceId;
          fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.userId, unlocks: merged, unlockDate, todayServiceId }),
          }).catch(() => {});
        } else {
          // unlocks に変化がない場合でも、localStorageのtodayServiceIdが復元されたならUIを再レンダリング
          const restoredId = localStorage.getItem(`encyclopediaTodayServiceId_${uid}`);
          if (restoredId) setUnlockedMap({ ...local });
        }
        // 解放済みだがstoredServicesにないサービスをCATALOGのアイコンで補完
        // APIレスポンスのservicesに含まれなかったIDでもアイコンを即時表示するため
        const latestSvcs: Record<string, EncyclopediaService> = (() => {
          try { return JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}'); } catch { return {}; }
        })();
        const allCatalogEntries = CATALOG.flatMap(c => c.services.map(s => ({ ...s, category: c.category })));
        const supplemented = { ...latestSvcs };
        let needsUpdate = false;
        for (const id of Object.keys(merged)) {
          if (!id || id === '_schedule_' || supplemented[id]) continue;
          const entry = allCatalogEntries.find(s => s.serviceIds?.includes(id));
          if (entry?.icon) {
            supplemented[id] = { serviceId: id, name: entry.name, icon: entry.icon, description: '', category: entry.category };
            needsUpdate = true;
          }
        }
        if (needsUpdate) {
          localStorage.setItem('encyclopediaServices', JSON.stringify(supplemented));
          setStoredServices(supplemented);
        }
      })
      .catch(() => {});
  }, [user?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const todaySvc = getDailyService(uid);
  const todayId = localStorage.getItem(`encyclopediaTodayServiceId_${uid}`);

  // Check unlock via direct todayId (most reliable) OR via catalog-based keys
  const todayUnlocked =
    (todayId !== null && todayId in unlockedMap) ||
    (todaySvc.serviceIds?.some(id => id in unlockedMap) ?? false) ||
    (unlockKey(todaySvc) in unlockedMap);

  // Prefer data from the exact todayId saved on the home screen
  const todayStoreData: EncyclopediaService | null =
    (todayId ? storedServices[todayId] ?? null : null) ??
    (todaySvc.serviceIds?.map(id => storedServices[id]).find(Boolean) ?? null);

  const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const todayAlreadyDone = localStorage.getItem(`encyclopediaUnlockDate_${uid}`) === jstDate;

  const allServices = CATALOG.flatMap(c => c.services);
  const totalServices = allServices.length;
  const unlockedCount = allServices.filter(s => isUnlocked(s, unlockedMap)).length;

  const calIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
      <path d="M3 20a2 2 0 0 0 2 2h10a2.4 2.4 0 0 0 1.706-.706l3.588-3.588A2.4 2.4 0 0 0 21 16V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/>
      <path d="M15 22v-5a1 1 0 0 1 1-1h5"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/>
    </svg>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-lg)' }}>
      <Helmet>
        <title>サービス図鑑 | 無限ノック</title>
        <meta name="description" content="毎日1つ解放されるAWSサービス図鑑。200以上のサービスの概要・特徴を確認して試験対策に役立てよう。" />
      </Helmet>
      <p style={{ margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
        {ja
          ? `アプリを使った日に1つ解放されます。${unlockedCount} / ${totalServices} 解放済み`
          : `1 service unlocked per day you use the app. ${unlockedCount} / ${totalServices} unlocked`}
      </p>

      {/* 今日の日めくりサービス */}
      <div style={{ background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          {calIcon}
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
            {ja ? '今日の日めくりAWSサービス' : "Today's Daily AWS Service"}
          </span>
          {todayAlreadyDone && (
            <span style={{ marginLeft: 2, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--border-radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              {ja ? '解放済み' : 'Unlocked'}
            </span>
          )}
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: (todayUnlocked && todayStoreData) ? 'pointer' : 'default' }}
          onClick={() => { if (todayUnlocked && todayStoreData) setSelected(todayStoreData); }}
        >
          <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-main)', borderRadius: 10 }}>
            {todayUnlocked && todayStoreData
              ? renderIcon(todayStoreData, 36)
              : <IconLock size={22} />}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-text-main)' }}>
              {todayUnlocked ? (todayStoreData?.name ?? todaySvc.name) : '???'}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 600, marginTop: 2 }}>
              {todayUnlocked ? todaySvc.category : ''}
            </div>
          </div>
          {todayUnlocked && todayStoreData && (
            <span style={{ marginLeft: 'auto', color: 'var(--color-text-light)', fontSize: 14 }}>›</span>
          )}
        </div>

        {!todayAlreadyDone && (
          <div style={{ marginTop: 8, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
            {ja ? 'ホーム画面を開くと解放されます' : 'Open the home screen to unlock'}
          </div>
        )}
        {todayUnlocked && !todayStoreData && (
          <div style={{ marginTop: 8, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
            {ja ? '詳細情報は近日公開予定です' : 'Details coming soon'}
          </div>
        )}
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', margin: 'var(--spacing-md) 0' }}>
        {(['unlocked', 'all'] as const).map(t => {
          const label = t === 'all' ? (ja ? '一覧' : 'All') : (ja ? '解放済み' : 'Unlocked');
          const active = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', fontSize: 'var(--font-size-base)', fontWeight: active ? 700 : 500, color: active ? 'var(--color-primary)' : 'var(--color-text-sub)', borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`, transition: 'color 0.15s, border-color 0.15s' }}
            >
              {label}
              {t === 'unlocked' && <span style={{ marginLeft: 4, fontSize: 10, color: active ? 'var(--color-primary)' : 'var(--color-text-light)' }}>{unlockedCount}</span>}
            </button>
          );
        })}
      </div>

      {/* カテゴリ別サービス一覧 */}
      {CATALOG.map(cat => {
        const displayServices = activeTab === 'unlocked'
          ? cat.services.filter(s => isUnlocked(s, unlockedMap))
          : cat.services;
        if (displayServices.length === 0) return null;
        const catUnlocked = cat.services.filter(s => isUnlocked(s, unlockedMap)).length;
        return (
          <div key={cat.category} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--color-border)' }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                {cat.category}
              </span>
              {activeTab === 'all' && (
                <span style={{ fontSize: 11, color: 'var(--color-text-light)', marginLeft: 2 }}>
                  {catUnlocked}/{cat.services.length}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {displayServices.map(svc => {
                const unlocked = isUnlocked(svc, unlockedMap);
                const serviceData = svc.serviceIds?.map(id => storedServices[id]).find(Boolean);
                // serviceData がなくても CATALOG のアイコンがあればクリック可能にする
                const displayIcon = serviceData?.icon || svc.icon || '';
                const clickable = unlocked && (!!serviceData || !!displayIcon);

                const handleClick = () => {
                  if (!unlocked) return;
                  // description がある場合のみキャッシュを使用（空文字プレースホルダーはフェッチする）
                  if (serviceData?.description) { setSelected(serviceData); return; }
                  // serviceData がない or description が空: 利用可能な serviceId で on-demand フェッチ
                  const fetchId = svc.serviceIds?.[0];
                  const placeholder: EncyclopediaService = {
                    serviceId: fetchId ?? svc.name,
                    name: svc.name,
                    icon: svc.icon ?? '',
                    description: '',
                    category: svc.serviceIds ? undefined : svc.name,
                  };
                  setSelected(placeholder);
                  if (!fetchId) return;
                  setSelectedLoading(true);
                  fetch(`${API_ENDPOINT}/daily-service?serviceId=${encodeURIComponent(fetchId)}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(d => {
                      if (d?.service) {
                        const s = d.service;
                        setSelected(s);
                        // ローカルに保存して次回以降即表示
                        const upd = { ...storedServices, [s.serviceId]: s };
                        localStorage.setItem('encyclopediaServices', JSON.stringify(upd));
                        setStoredServices(upd);
                      }
                    })
                    .catch(() => {})
                    .finally(() => setSelectedLoading(false));
                };

                return (
                  <div
                    key={svc.name}
                    onClick={handleClick}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 4, padding: '8px 4px',
                      borderRadius: 'var(--border-radius-md)',
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'background 0.1s',
                      minWidth: 0,
                    }}
                    onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--color-bg-main)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: unlocked ? 1 : 0.4 }}>
                      {unlocked && displayIcon
                        ? renderIcon({ serviceId: svc.serviceIds?.[0] ?? svc.name, name: svc.name, icon: displayIcon, description: '' }, 32)
                        : unlocked
                          ? null
                          : <IconLock size={14} />}
                    </div>
                    <span style={{
                      fontSize: 10,
                      color: unlocked ? 'var(--color-text-main)' : 'var(--color-text-light)',
                      fontWeight: unlocked ? 600 : 400,
                      textAlign: 'center',
                      lineHeight: 1.3,
                      wordBreak: 'break-word',
                      width: '100%',
                    }}>
                      {unlocked ? svc.name : '???'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Detail modal */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 24px 20px', width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)', maxHeight: window.innerWidth < 768 ? '66vh' : '85vh', overflowY: 'auto', position: 'relative' }}>
            <button
              onClick={() => setSelected(null)}
              style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}
            >✕</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {renderIcon(selected, 44)}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-text-main)' }}>
                  {selected.name}
                </div>
                {selected.category && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--border-radius-full)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    {selected.category}
                  </span>
                )}
              </div>
            </div>

            {selectedLoading ? (
              <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="sherpa-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                {ja ? '情報を取得中...' : 'Loading...'}
              </p>
            ) : selected.description ? (
              <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.7, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                {selected.description}
              </p>
            ) : (
              <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {ja ? '説明情報がありません。' : 'No description available.'}
              </p>
            )}

            {selected.trivia && (
              <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <IconLightbulb size={14} />
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                  {selected.trivia}
                </span>
              </div>
            )}

            {selected.docUrl && (
              <a
                href={selected.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}
              >
                {ja ? '公式ページを見る →' : 'Official page →'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
