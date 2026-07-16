import { Suspense } from 'react';
import ArchitecturePage from '@/views/ArchitecturePage';
export default function Page() {
  return (
    <Suspense>
      <ArchitecturePage />
    </Suspense>
  );
}
