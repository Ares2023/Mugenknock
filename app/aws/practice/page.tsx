'use client';
import dynamic from 'next/dynamic';
const Practice = dynamic(() => import('@/views/Practice'), { ssr: false });
export default function Page() { return <Practice />; }
