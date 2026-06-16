'use client';
// react-router-dom の Next.js App Router 互換レイヤー
// 既存ページの import 文を変えずに段階移行できるようにするためのスタブ
import React, { useEffect } from 'react';
import NextLink from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const NAV_STATE_KEY = '__nav_state__';

// モジュールレベルのキャッシュ。同一レンダーサイクルで複数の useLocation()
// が呼ばれても最初の一回だけ sessionStorage を読み、以降はキャッシュを返す。
// navigate() が呼ばれるたびにリセットされる。
let _cachedNavState: unknown = null;
let _navStateLoaded = false;

function readNavState(): unknown {
  if (_navStateLoaded) return _cachedNavState;
  _navStateLoaded = true;
  try {
    const s = sessionStorage.getItem(NAV_STATE_KEY);
    if (s) {
      _cachedNavState = JSON.parse(s);
      sessionStorage.removeItem(NAV_STATE_KEY);
    }
  } catch {}
  return _cachedNavState;
}

function resetNavState() {
  _cachedNavState = null;
  _navStateLoaded = false;
}

export function useNavigate() {
  const router = useRouter();
  return (path: string | number, options?: { state?: unknown; replace?: boolean }) => {
    resetNavState();
    if (typeof path === 'number') {
      if (path === -1) router.back();
      else if (path === 1) router.forward();
      return;
    }
    if (options?.state !== undefined) {
      _cachedNavState = options.state;
      _navStateLoaded = true;
      try { sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify(options.state)); } catch {}
    }
    if (options?.replace) router.replace(path);
    else router.push(path);
  };
}

export function useLocation() {
  const rawPathname = usePathname();
  // Next.js の trailingSlash: true により '/aws/practice/' のように末尾スラッシュが付く。
  // ルート '/' は除いて正規化し、path 比較が一致するようにする。
  const pathname = rawPathname && rawPathname !== '/' ? rawPathname.replace(/\/$/, '') : (rawPathname ?? '/');
  const searchParams = useSearchParams();
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const state = readNavState();
  return { pathname, search: searchParams?.toString() ?? '', hash, state };
}

export function useParams<T extends Record<string, string>>(): T {
  // App Router では params は props 経由。互換レイヤーでは空を返す。
  // URL パラメータが必要なページは page.tsx → client.tsx 経由で props として渡す。
  return {} as T;
}

export { useSearchParams } from 'next/navigation';

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [to, replace, router]);
  return null;
}

export function Link({ to, children, className, style, onClick, ...rest }: React.ComponentProps<'a'> & { to: string }) {
  return (
    <NextLink href={to} className={className} style={style} onClick={onClick} {...(rest as object)}>
      {children}
    </NextLink>
  );
}

// App.tsx では使わなくなるが、型エラー防止のためにスタブを残す
export const BrowserRouter = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const Routes = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const Route = (_props: { path?: string; element?: React.ReactNode }) => null;
export const Outlet = () => null;
