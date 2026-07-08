'use client';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
const Portal = dynamic(() => import('@/views/Portal'), { ssr: false });
export default function Page() { return <Suspense><Portal /></Suspense>; }
