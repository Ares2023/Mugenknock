'use client';
import dynamic from 'next/dynamic';
const SampleQuiz = dynamic(() => import('@/views/SampleQuiz'), { ssr: false });
export default function SampleQuizDynamic({ exam }: { exam: string }) {
  return <SampleQuiz examParam={exam} />;
}
