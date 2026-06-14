'use client';
import dynamic from 'next/dynamic';
const ExamSetup = dynamic(() => import('@/views/ExamSetup'), { ssr: false });
export default function Page() { return <ExamSetup />; }
