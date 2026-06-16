'use client';
import dynamic from 'next/dynamic';
const Portal = dynamic(() => import('@/views/Portal'), { ssr: false });
export default function Page() { return <Portal />; }
