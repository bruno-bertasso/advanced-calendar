import { useEffect, useState } from 'react';

/** Current time, refreshed every `intervalMs` (aligned to the next minute boundary). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setNow(Date.now());
      interval = setInterval(() => setNow(Date.now()), intervalMs);
    }, intervalMs - (Date.now() % intervalMs));
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [intervalMs]);
  return now;
}
