'use client';
import dynamic from 'next/dynamic';
const ExerciseSession = dynamic(() => import('@/views/ExerciseSession'), { ssr: false });
export default function Page() { return <ExerciseSession />; }
