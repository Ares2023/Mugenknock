'use client';
import dynamic from 'next/dynamic';
const ExamDashboard = dynamic(() => import('@/views/ExamDashboard'), { ssr: false });
export default function Page() { return <ExamDashboard />; }
