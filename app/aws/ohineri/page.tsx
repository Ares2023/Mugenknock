'use client';
import dynamic from 'next/dynamic';
const Ohineri = dynamic(() => import('@/views/Ohineri'), { ssr: false });
export default function Page() { return <Ohineri />; }
