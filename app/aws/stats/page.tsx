'use client';
import dynamic from 'next/dynamic';
const Stats = dynamic(() => import('@/views/Stats'), { ssr: false });
export default function Page() { return <Stats />; }
