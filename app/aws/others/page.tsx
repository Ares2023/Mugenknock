'use client';
import dynamic from 'next/dynamic';
const Others = dynamic(() => import('@/views/Others'), { ssr: false });
export default function Page() { return <Others />; }
