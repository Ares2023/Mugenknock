import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { IconLock, IconLightbulb } from '../components/Icons';
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

/** encyclopediaUnlocked から旧 encyclopediaServices へのマイグレーション */
function migrateIfNeeded(): void {
  if (localStorage.getItem('encyclopediaUnlocked') !== null) return;
  try {
    const legacy = JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}');
    const keys = Object.keys(legacy);
    if (keys.length === 0) return;
    const migrated: Record<string, string> = {};
    keys.forEach(k => { migrated[k] = 'migrated'; });
    localStorage.setItem('encyclopediaUnlocked', JSON.stringify(migrated));
  } catch {}
}

function isUnlocked(svc: ServiceEntry, unlockedMap: Record<string, string>): boolean {
  if (svc.serviceIds?.some(id => id in unlockedMap)) return true;
  if (svc.name in unlockedMap) return true;
  return false;
}

function unlockKey(svc: ServiceEntry): string {
  return svc.serviceIds?.[0] ?? svc.name;
}

function renderIcon(service: EncyclopediaService, size: number): React.ReactNode {
  const { icon, name } = service;
  if (icon.startsWith('/') || icon.startsWith('http')) {
    return <img src={icon} alt={name} style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  return <span style={{ fontSize: size * 0.86, lineHeight: 1 }}>{icon}</span>;
}

export default function ServiceEncyclopedia() {
  const { lang } = useLanguage();
  const ja = lang === 'ja';
  const { user } = useAuth();

  const [unlockedMap, setUnlockedMap] = useState<Record<string, string>>(() => {
    migrateIfNeeded();
    try { return JSON.parse(localStorage.getItem('encyclopediaUnlocked') ?? '{}'); } catch { return {}; }
  });
  const [storedServices, setStoredServices] = useState<Record<string, EncyclopediaService>>(() => {
    try { return JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}'); } catch { return {}; }
  });
  const [selected, setSelected] = useState<EncyclopediaService | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unlocked'>('all');

  useEffect(() => {
    const refresh = () => {
      try { setUnlockedMap(JSON.parse(localStorage.getItem('encyclopediaUnlocked') ?? '{}')); } catch {}
      try { setStoredServices(JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}')); } catch {}
    };
    window.addEventListener('encyclopediaUpdated', refresh);
    return () => window.removeEventListener('encyclopediaUpdated', refresh);
  }, []);

  // サーバーから解放済みデータを取得してローカルとマージ
  useEffect(() => {
    if (!user?.userId) return;
    fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks?userId=${encodeURIComponent(user.userId)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.unlocks || typeof data.unlocks !== 'object') return;
        const local = (() => { try { return JSON.parse(localStorage.getItem('encyclopediaUnlocked') ?? '{}'); } catch { return {}; } })();
        const merged: Record<string, string> = { ...data.unlocks, ...local };
        const changed = Object.keys(merged).some(k => !(k in local));
        if (changed) {
          localStorage.setItem('encyclopediaUnlocked', JSON.stringify(merged));
          setUnlockedMap(merged);
          // サーバーにもマージ結果を反映
          const unlockDate = localStorage.getItem('encyclopediaUnlockDate') ?? data.unlockDate;
          const todayServiceId = localStorage.getItem('encyclopediaTodayServiceId') ?? data.todayServiceId;
          fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.userId, unlocks: merged, unlockDate, todayServiceId }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [user?.userId]);

  const todaySvc = getDailyService();
  const todayId = localStorage.getItem('encyclopediaTodayServiceId');

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
  const todayAlreadyDone = localStorage.getItem('encyclopediaUnlockDate') === jstDate;

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
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 'var(--spacing-lg)' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--font-size-h2)', fontWeight: 700, color: 'var(--color-text-main)' }}>
        {ja ? 'サービス図鑑' : 'Service Encyclopedia'}
      </h2>
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
        {(['all', 'unlocked'] as const).map(t => {
          const label = t === 'all' ? (ja ? '一覧' : 'All') : (ja ? '解放済み' : 'Unlocked');
          const active = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', fontSize: 'var(--font-size-sm)', fontWeight: active ? 700 : 400, color: active ? 'var(--color-primary)' : 'var(--color-text-sub)', borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`, marginBottom: -2, transition: 'color 0.15s' }}
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
                const clickable = unlocked && !!serviceData;

                return (
                  <div
                    key={svc.name}
                    onClick={() => { if (clickable) setSelected(serviceData!); }}
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
                      {unlocked && serviceData
                        ? renderIcon(serviceData, 32)
                        : unlocked
                          ? <span style={{ fontSize: 20 }}>☁️</span>
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
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 24px 20px', width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
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

            <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.7 }}>
              {selected.description}
            </p>

            {selected.trivia && (
              <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <IconLightbulb size={14} />
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
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
