import { EXAM_TYPES } from '@/constants';
import SampleQuizDynamic from './client';

export function generateStaticParams() {
  return EXAM_TYPES.map(exam => ({ exam }));
}

export default function Page() { return <SampleQuizDynamic />; }
