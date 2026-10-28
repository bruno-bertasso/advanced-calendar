import { useCallback, useRef, useState } from 'react';

const srOnly =
  'absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]';

/**
 * Polite + assertive live regions. Messages are cleared and re-set so identical consecutive
 * announcements are still read.
 */
export function useLiveAnnouncer() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const announce = useCallback((message: string, politeness: 'polite' | 'assertive' = 'polite') => {
    const set = politeness === 'assertive' ? setAssertive : setPolite;
    set('');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set(message), 30);
  }, []);

  const regions = (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className={srOnly} data-calendar-live="polite">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className={srOnly} data-calendar-live="assertive">
        {assertive}
      </div>
    </>
  );

  return { announce, regions };
}

export { srOnly };
