import { Suspense } from 'react';
import About from '@/views/About';
export default function Page() {
  return (
    <Suspense>
      <About />
    </Suspense>
  );
}
