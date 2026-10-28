import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import type { ComponentProps, Ref } from 'react';
import { cn } from '@/lib/utils';

interface ScrollAreaProps extends ComponentProps<typeof BaseScrollArea.Root> {
  viewportRef?: Ref<HTMLDivElement>;
  viewportClassName?: string;
  /** Accessible label if the viewport should be a focusable scroll region. */
  viewportLabel?: string;
}

/** shadcn/ui-styled Base UI ScrollArea with both scrollbars. */
export function ScrollArea({ className, children, viewportRef, viewportClassName, viewportLabel, ...props }: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root className={cn('relative min-h-0 overflow-hidden', className)} {...props}>
      <BaseScrollArea.Viewport
        ref={viewportRef}
        aria-label={viewportLabel}
        className={cn('size-full overscroll-contain outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', viewportClassName)}
      >
        {children}
      </BaseScrollArea.Viewport>
      {(['vertical', 'horizontal'] as const).map((orientation) => (
        <BaseScrollArea.Scrollbar
          key={orientation}
          orientation={orientation}
          className="z-30 m-0.5 flex touch-none select-none rounded-full opacity-0 transition-opacity data-[hovering]:opacity-100 data-[scrolling]:opacity-100 data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:w-1.5"
        >
          <BaseScrollArea.Thumb className="w-full rounded-full bg-border" />
        </BaseScrollArea.Scrollbar>
      ))}
    </BaseScrollArea.Root>
  );
}
