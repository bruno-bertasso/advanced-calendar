import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string, serverFallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : serverFallback),
    () => serverFallback,
  );
}

/** Complex views collapse below the `md` breakpoint (768px). */
export function useIsNarrow(): boolean {
  return useMediaQuery('(max-width: 767.98px)');
}
