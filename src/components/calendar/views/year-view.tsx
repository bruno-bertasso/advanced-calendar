import type { TZDate } from '@date-fns/tz';
import { addDays, addMonths, addYears, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { useCalendar } from '../calendar-context';
import { dayDiff, formatDayLabel, inZone, isSameDay, lastTouchedDay, toIsoDay } from '../lib/dates';

export interface YearViewProps {
  className?: string;
}

/**
 * 12 mini-months. Each month is its own ARIA grid, but a single roving tab stop (the cursor
 * day) spans the whole year so arrow keys flow across month boundaries.
 * Days are shaded by event density (a lightweight heat map).
 */
export function YearView({ className }: YearViewProps) {
  const cal = useCalendar();
  const { cursor, timeZone, locale, weekStartsOn, occurrences, range } = cal;
  const rootRef = useRef<HTMLDivElement>(null);
  const wantsFocus = useRef(false);

  // Occurrence count per day of the year.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of occurrences) {
      const s = startOfDay(inZone(o.start, timeZone));
      const e = lastTouchedDay(inZone(o.start, timeZone), inZone(o.end, timeZone));
      const from = Math.max(0, dayDiff(s, range.start));
      const to = Math.min(range.days.length - 1, dayDiff(e, range.start));
      for (let i = from; i <= to; i++) {
        const key = toIsoDay(range.days[i]!);
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [occurrences, timeZone, range]);
  const maxCount = Math.max(1, ...counts.values());

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonths(range.start, i) as TZDate), [range.start]);

  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    rootRef.current?.querySelector<HTMLElement>(`[data-date="${toIsoDay(cursor)}"]`)?.focus();
  }, [cursor]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).hasAttribute('data-year-day')) return;
    const inline = cal.direction === 'rtl' ? -1 : 1;
    let next: Date | null = null;
    switch (e.key) {
      case 'ArrowRight': next = addDays(cursor, inline); break;
      case 'ArrowLeft': next = addDays(cursor, -inline); break;
      case 'ArrowDown': next = addDays(cursor, 7); break;
      case 'ArrowUp': next = addDays(cursor, -7); break;
      case 'Home': next = startOfWeek(cursor, { weekStartsOn }); break;
      case 'End': next = endOfWeek(cursor, { weekStartsOn }); break;
      case 'PageUp': next = e.shiftKey ? addYears(cursor, -1) : addMonths(cursor, -1); break;
      case 'PageDown': next = e.shiftKey ? addYears(cursor, 1) : addMonths(cursor, 1); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        drillDown(cursor);
        return;
      default:
        return;
    }
    e.preventDefault();
    wantsFocus.current = true;
    cal.setCursor(new Date(startOfDay(next).getTime()));
  };

  const drillDown = (day: Date) => {
    cal.setCursor(new Date(day.getTime()));
    const target = (['day', 'week', 'month'] as const).find((v) => cal.views.includes(v));
    if (target) cal.setView(target);
  };

  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone });
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'long', timeZone });
  const firstWeek = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(range.start, { weekStartsOn }), i));

  return (
    <div className={cn('@container min-h-0 flex-1 overflow-y-auto p-3', className)}>
      <div
        ref={rootRef}
        onKeyDown={onKeyDown}
        className="grid grid-cols-1 gap-x-6 gap-y-5 @md:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4"
      >
        {months.map((month) => {
          const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn });
          const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
          const weeks = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
          const label = monthFmt.format(month);
          return (
            <section key={month.getTime()} aria-labelledby={`year-${month.getTime()}`}>
              <h3 id={`year-${month.getTime()}`} className="mb-1 px-1 text-sm font-semibold">
                <button
                  type="button"
                  className="rounded px-1 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => {
                    cal.setCursor(new Date(month.getTime()));
                    if (cal.views.includes('month')) cal.setView('month');
                  }}
                >
                  {label}
                </button>
              </h3>
              <div role="grid" aria-labelledby={`year-${month.getTime()}`} className="grid grid-cols-7 gap-0.5 text-center text-xs">
                <div role="row" className="col-span-full grid grid-cols-subgrid text-muted-foreground">
                  {firstWeek.map((d) => (
                    <div key={d.getDay()} role="columnheader" className="py-1">
                      <abbr title={weekdayLong.format(d)} className="no-underline">
                        {weekdayFmt.format(d)}
                      </abbr>
                    </div>
                  ))}
                </div>
                {weeks.map((week) => (
                  <div key={week[0]!.getTime()} role="row" className="col-span-full grid grid-cols-subgrid">
                    {week.map((day) => {
                      const inMonth = day.getMonth() === month.getMonth();
                      if (!inMonth) return <div key={day.getTime()} role="gridcell" aria-hidden className="h-8" />;
                      const key = toIsoDay(day);
                      const count = counts.get(key) ?? 0;
                      const isCursor = isSameDay(day, cursor);
                      const isToday = isSameDay(day, cal.today);
                      return (
                        <div
                          key={day.getTime()}
                          role="gridcell"
                          tabIndex={isCursor ? 0 : -1}
                          aria-selected={isCursor}
                          aria-current={isToday ? 'date' : undefined}
                          aria-label={`${formatDayLabel(day, timeZone, locale)}${
                            count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''
                          }`}
                          data-date={key}
                          data-year-day=""
                          onClick={() => drillDown(day)}
                          className={cn(
                            'relative flex h-8 cursor-pointer items-center justify-center rounded-md tabular-nums outline-none',
                            'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-selected:ring-1 aria-selected:ring-ring',
                            isToday && 'bg-calendar-today font-semibold text-white hover:bg-calendar-today/90',
                          )}
                          style={
                            count && !isToday
                              ? {
                                  background: `color-mix(in oklab, var(--calendar-event) ${Math.round(12 + (count / maxCount) * 45)}%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          {day.getDate()}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
