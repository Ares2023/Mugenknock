'use client';
import dynamic from 'next/dynamic';
const ExerciseSetup = dynamic(() => import('@/views/ExerciseSetup'), { ssr: false });
export default function Page() { return <ExerciseSetup />; }
