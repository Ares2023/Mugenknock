'use client';
import dynamic from 'next/dynamic';
import React from 'react';
const AdminLayout = dynamic(() => import('@/components/AdminLayout'), { ssr: false });
const AdminRoute = dynamic(() => import('@/components/AdminRoute'), { ssr: false });
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminRoute><AdminLayout>{children}</AdminLayout></AdminRoute>;
}
