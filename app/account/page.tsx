'use client';
import dynamic from 'next/dynamic';
const Account = dynamic(() => import('@/views/Account'), { ssr: false });
export default function Page() { return <Account />; }
