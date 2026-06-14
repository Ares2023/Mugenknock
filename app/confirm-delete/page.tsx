'use client';
import dynamic from 'next/dynamic';
const ConfirmDelete = dynamic(() => import('@/views/ConfirmDelete'), { ssr: false });
export default function Page() { return <ConfirmDelete />; }
