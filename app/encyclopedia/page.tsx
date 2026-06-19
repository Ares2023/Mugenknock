import { Suspense } from 'react';
import PublicEncyclopedia from '@/views/PublicEncyclopedia';
export default function Page() {
  return (
    <Suspense>
      <PublicEncyclopedia />
    </Suspense>
  );
}
