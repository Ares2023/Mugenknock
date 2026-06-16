import { useState, useEffect } from 'react';

export function useWindowWidth(): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setWidth(window.innerWidth);
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return width;
}

export function useIsMobile(): boolean {
  return useWindowWidth() < 768;
}
