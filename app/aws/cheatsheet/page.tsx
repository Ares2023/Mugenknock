'use client';
import dynamic from 'next/dynamic';
const CheatSheet = dynamic(() => import('@/views/CheatSheet'), { ssr: false });
export default function Page() { return <CheatSheet />; }
