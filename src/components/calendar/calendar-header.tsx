import { Select } from '@base-ui/react/select';
import { Tabs } from '@base-ui/react/tabs';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCalendar } from './calendar-context';
import type { CalendarView } from './types';

export const VIEW_LABELS: Record<CalendarView, string> = {
  day: 'Day',
  week: 'Week',
  'work-week': 'Work week',
  month: 'Month',
  year: 'Year',
  agenda: 'Agenda',
  timeline: 'Timeline',
};

export interface CalendarHeaderProps {
  className?: string;
  /** Extra controls rendered at the end of the toolbar (e.g. resource filter, "New event"). */
  actions?: ReactNode;
}

export function CalendarHeader({ className, actions }: CalendarHeaderProps) {
  const { title, navigate, view, views, setView } = useCalendar();
  const { isNarrow, agendaDays } = useCalendar();
  const unit =
    view === 'month' ? 'month' : view === 'year' ? 'year' : view === 'agenda' ? `${agendaDays} days` : view === 'day' || isNarrow ? 'day' : 'week';

  return (
    <header className={cn('flex flex-wrap items-center gap-2 border-b p-3', className)}>
      <div className="flex items-center gap-1" role="group" aria-label="Date navigation">
        <Button variant="outline" size="sm" onClick={() => navigate('today')}>
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Previous ${unit}`} onClick={() => navigate('prev')}>
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Next ${unit}`} onClick={() => navigate('next')}>
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>

      <h2 aria-live="polite" className="min-w-0 flex-1 truncate text-base font-semibold md:text-lg">
        {title}
      </h2>

      {actions}

      {views.length > 1 && (
        <>
          {/* >= md: segmented tabs */}
          <Tabs.Root value={view} onValueChange={(v) => setView(v as CalendarView)} className="hidden md:block">
            <Tabs.List aria-label="Calendar view" className="relative flex rounded-lg bg-muted p-1">
              {views.map((v) => (
                <Tabs.Tab
                  key={v}
                  value={v}
                  className="relative z-10 h-7 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active]:text-foreground"
                >
                  {VIEW_LABELS[v]}
                </Tabs.Tab>
              ))}
              <Tabs.Indicator className="absolute left-[var(--active-tab-left)] top-1 z-0 h-7 w-[var(--active-tab-width)] rounded-md bg-background shadow-sm transition-[left,width] duration-200" />
            </Tabs.List>
          </Tabs.Root>

          {/* < md: compact select */}
          <Select.Root
            value={view}
            onValueChange={(v) => v && setView(v as CalendarView)}
            items={views.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
          >
            <Select.Trigger
              aria-label="Calendar view"
              className="flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden"
            >
              <Select.Value />
              <Select.Icon>
                <ChevronDown className="size-4 opacity-60" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={4} className="z-50">
                <Select.Popup className="min-w-[var(--anchor-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                  {views.map((v) => (
                    <Select.Item
                      key={v}
                      value={v}
                      className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent"
                    >
                      <Select.ItemIndicator className="w-4">
                        <Check className="size-4" />
                      </Select.ItemIndicator>
                      <Select.ItemText>{VIEW_LABELS[v]}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </>
      )}
    </header>
  );
}
