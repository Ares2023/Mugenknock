'use client';
import dynamic from 'next/dynamic';
const PublicEncyclopedia = dynamic(() => import('@/views/PublicEncyclopedia'), { ssr: false });
export default function Page() { return <PublicEncyclopedia />; }
