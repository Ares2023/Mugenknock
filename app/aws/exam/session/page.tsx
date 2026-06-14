'use client';
import dynamic from 'next/dynamic';
const ExamSession = dynamic(() => import('@/views/ExamSession'), { ssr: false });
export default function Page() { return <ExamSession />; }
