'use client';

import { useEffect, useState } from 'react';

export function useIsLg(): boolean {
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLg(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isLg;
}
