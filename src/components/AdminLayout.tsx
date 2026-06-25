'use client';
import React from 'react';
import { useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { IconSun, IconMoon } from './Icons';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  React.useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin-login', { replace: true });
  };

  const iconBtn: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--color-text-sub)', cursor: 'pointer',
    padding: '6px', display: 'flex', alignItems: 'center', borderRadius: 'var(--border-radius-full)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'inherit', background: 'var(--color-bg-main)' }}>
      {/* ユーザー画面と同じデザイントークン（テーマ対応）で構成したヘッダー */}
      <header style={{
        height: 52, minHeight: 52, background: 'var(--color-bg-elevated)',
        display: 'flex', alignItems: 'center', padding: isMobile ? '0 12px' : '0 20px',
        gap: isMobile ? 8 : 12, flexShrink: 0, borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={{
          background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)',
          fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', userSelect: 'none',
          padding: '3px 8px', borderRadius: 'var(--border-radius-full)',
        }}>
          ADMIN
        </span>
        {!isMobile && (
          <span style={{ color: 'var(--color-text-main)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>管理画面</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, minWidth: 0 }}>
          {user && !isMobile && (
            <span style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{user.email}</span>
          )}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            style={iconBtn}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <button onClick={handleSignOut} style={{
            background: 'none', border: '1.5px solid var(--color-border)',
            color: 'var(--color-text-sub)', fontSize: 'var(--font-size-xs)', padding: '5px 12px',
            borderRadius: 'var(--border-radius-full)', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            ログアウト
          </button>
          <button onClick={() => navigate('/')} style={{
            background: 'none', border: 'none',
            color: 'var(--color-primary)', fontSize: 'var(--font-size-xs)', padding: '4px 6px',
            cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {isMobile ? '← サイト' : '← サイトへ戻る'}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
