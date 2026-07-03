'use client';
import dynamic from 'next/dynamic';
const Announcements = dynamic(() => import('@/views/Announcements'), { ssr: false });
export default function Page() { return <Announcements />; }
