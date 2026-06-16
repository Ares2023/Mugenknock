'use client';
import dynamic from 'next/dynamic';
const Growth = dynamic(() => import('@/views/Growth'), { ssr: false });
export default function Page() { return <Growth />; }
