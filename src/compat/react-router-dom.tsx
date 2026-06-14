'use client';
// react-router-dom の Next.js App Router 互換レイヤー
// 既存ページの import 文を変えずに段階移行できるようにするためのスタブ
import React, { useEffect } from 'react';
import NextLink from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const NAV_STATE_KEY = '__nav_state__';

export function useNavigate() {
  const router = useRouter();
  return (path: string, options?: { state?: unknown; replace?: boolean }) => {
    if (options?.state !== undefined) {
      try { sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify(options.state)); } catch {}
    }
    if (options?.replace) router.replace(path);
    else router.push(path);
  };
}

export function useLocation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = (() => {
    try {
      const s = sessionStorage.getItem(NAV_STATE_KEY);
      if (s) { sessionStorage.removeItem(NAV_STATE_KEY); return JSON.parse(s); }
    } catch {}
    return null;
  })();
  return { pathname, search: searchParams?.toString() ?? '', state };
}

export function useParams<T extends Record<string, string>>(): T {
  // App Router では params は props経由。互換レイヤーでは空を返す
  return {} as T;
}

export { useSearchParams } from 'next/navigation';

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }); // eslint-disable-line react-hooks/exhaustive-deps
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
