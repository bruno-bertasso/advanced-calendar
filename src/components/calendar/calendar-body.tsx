import { lazy, Suspense, type ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { useCalendar } from './calendar-context';
import type { CalendarView } from './types';
import { MonthView } from './views/month-view';
import { WeekView } from './views/week-view';

export type ViewRegistry = Partial<Record<CalendarView, ComponentType>>;

// Month and the time grid are the common entry points and ship in the main chunk; the
// other views are code-split and fetched the first time they are shown.
export const YearView = lazy(() => import('./views/year-view').then((m) => ({ default: m.YearView })));
export const AgendaView = lazy(() => import('./views/agenda-view').then((m) => ({ default: m.AgendaView })));
export const TimelineView = lazy(() => import('./views/timeline-view').then((m) => ({ default: m.TimelineView })));

/** All built-in views. `day` and `work-week` reuse the time-grid WeekView. */
export const DEFAULT_VIEW_REGISTRY: ViewRegistry = {
  month: MonthView,
  week: WeekView,
  'work-week': WeekView,
  day: WeekView,
  year: YearView,
  agenda: AgendaView,
  timeline: TimelineView,
};

export interface CalendarBodyProps {
  className?: string;
  /** Override or extend view components, e.g. `{ agenda: MyAgenda }`. */
  views?: ViewRegistry;
}

function ViewSkeleton() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-2 p-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

/** Renders the component registered for the active view. */
export function CalendarBody({ className, views }: CalendarBodyProps) {
  const { view, messages } = useCalendar();
  const registry = { ...DEFAULT_VIEW_REGISTRY, ...views };
  const View = registry[view];
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)} data-calendar-body="">
      {View ? (
        <Suspense fallback={<ViewSkeleton />}>
          <View />
        </Suspense>
      ) : (
        <div role="status" className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          {messages.viewUnavailable(messages.views[view])}
        </div>
      )}
    </div>
  );
}
