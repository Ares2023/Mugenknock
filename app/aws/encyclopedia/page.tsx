'use client';
import dynamic from 'next/dynamic';
const ServiceEncyclopedia = dynamic(() => import('@/views/ServiceEncyclopedia'), { ssr: false });
export default function Page() { return <ServiceEncyclopedia />; }
