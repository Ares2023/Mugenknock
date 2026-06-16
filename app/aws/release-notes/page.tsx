'use client';
import dynamic from 'next/dynamic';
const ReleaseNotes = dynamic(() => import('@/views/ReleaseNotes'), { ssr: false });
export default function Page() { return <ReleaseNotes />; }
