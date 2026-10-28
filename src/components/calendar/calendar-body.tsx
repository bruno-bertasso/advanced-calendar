import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { useCalendar } from './calendar-context';
import { VIEW_LABELS } from './calendar-header';
import type { CalendarView } from './types';
import { AgendaView } from './views/agenda-view';
import { MonthView } from './views/month-view';
import { TimelineView } from './views/timeline-view';
import { WeekView } from './views/week-view';
import { YearView } from './views/year-view';

export type ViewRegistry = Partial<Record<CalendarView, ComponentType>>;

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

/** Renders the component registered for the active view. */
export function CalendarBody({ className, views }: CalendarBodyProps) {
  const { view } = useCalendar();
  const registry = { ...DEFAULT_VIEW_REGISTRY, ...views };
  const View = registry[view];
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)} data-calendar-body="">
      {View ? (
        <View />
      ) : (
        <div role="status" className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          {VIEW_LABELS[view]} view is not available yet.
        </div>
      )}
    </div>
  );
}
