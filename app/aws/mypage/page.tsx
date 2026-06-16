'use client';
import dynamic from 'next/dynamic';
const MyPage = dynamic(() => import('@/views/MyPage'), { ssr: false });
export default function Page() { return <MyPage />; }
