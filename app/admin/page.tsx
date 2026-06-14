'use client';
import dynamic from 'next/dynamic';
const Admin = dynamic(() => import('@/views/Admin'), { ssr: false });
export default function Page() { return <Admin />; }
