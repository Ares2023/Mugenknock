'use client';
// react-helmet-async の Next.js 互換スタブ
// Next.js では <head> の制御は metadata API or layout.tsx で行う
// 既存ページの <Helmet> タグを無効化するだけのスタブ
import React from 'react';

export const HelmetProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export function Helmet({ children: _children }: { children?: React.ReactNode }) {
  return null;
}
