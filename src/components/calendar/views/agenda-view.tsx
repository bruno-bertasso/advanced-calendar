import type { TZDate } from '@date-fns/tz';
import { useVirtualizer } from '@tanstack/react-virtual';
import { addDays } from 'date-fns';
import { useMemo, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { useCalendar } from '../calendar-context';
import { EventCard } from '../event-card';
import { formatDayLabel, formatTimeRange, isAllDayLike, isSameDay } from '../lib/dates';
import type { EventOccurrence } from '../types';

type AgendaRow =
  | { type: 'day'; key: string; day: TZDate; count: number }
  | { type: 'event'; key: string; day: TZDate; occurrence: EventOccurrence; isStart: boolean; isEnd: boolean };

const DAY_ROW_PX = 40;
const EVENT_ROW_PX = 52;

/** Build flat rows (day headers + events). Multi-day events appear on every day they touch. */
export function buildAgendaRows(occurrences: readonly EventOccurrence[], days: readonly TZDate[]): AgendaRow[] {
  const rows: AgendaRow[] = [];
  for (const day of days) {
    const dayStart = day.getTime();
    const dayEnd = addDays(day, 1).getTime();
    const items = occurrences
      .filter((o) => o.start.getTime() < dayEnd && Math.max(o.end.getTime(), o.start.getTime() + 1) > dayStart)
      .sort((a, b) => Number(isAllDayLike(b)) - Number(isAllDayLike(a)) || a.start.getTime() - b.start.getTime());
    if (!items.length) continue;
    rows.push({ type: 'day', key: `d:${dayStart}`, day, count: items.length });
    for (const o of items) {
      rows.push({
        type: 'event',
        key: `e:${o.occurrenceId}:${dayStart}`,
        day,
        occurrence: o,
        isStart: o.start.getTime() >= dayStart,
        isEnd: o.end.getTime() <= dayEnd,
      });
    }
  }
  return rows;
}

export interface AgendaViewProps {
  className?: string;
}

/** Chronological list for the next `agendaDays`, virtualised with @tanstack/react-virtual. */
export function AgendaView({ className }: AgendaViewProps) {
  const cal = useCalendar();
  const { occurrences, range, timeZone, locale, today, title } = cal;
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildAgendaRows(occurrences, range.days), [occurrences, range.days]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.type === 'day' ? DAY_ROW_PX : EVENT_ROW_PX),
    overscan: 10,
    initialRect: { width: 800, height: 600 },
    getItemKey: (i) => rows[i]!.key,
  });

  const eventIndexes = useMemo(() => rows.flatMap((r, i) => (r.type === 'event' ? [i] : [])), [rows]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-agenda-index]');
    if (!rowEl || e.altKey || e.shiftKey) return;
    const current = Number(rowEl.dataset.agendaIndex);
    const pos = eventIndexes.indexOf(current);
    const nextPos =
      e.key === 'Home' ? 0 : e.key === 'End' ? eventIndexes.length - 1 : pos + (e.key === 'ArrowDown' ? 1 : -1);
    const target = eventIndexes[nextPos];
    if (target === undefined) return;
    e.preventDefault();
    virtualizer.scrollToIndex(target, { align: 'auto' });
    requestAnimationFrame(() =>
      scrollRef.current?.querySelector<HTMLElement>(`[data-agenda-index="${target}"] button`)?.focus(),
    );
  };

  if (!rows.length) {
    return (
      <div role="status" className={cn('flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground', className)}>
        No events between {formatDayLabel(range.days[0]!, timeZone, locale)} and{' '}
        {formatDayLabel(range.days[range.days.length - 1]!, timeZone, locale)}.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className={cn('@container min-h-0 flex-1 overflow-y-auto', className)} onKeyDown={onKeyDown}>
      <div role="list" aria-label={`Agenda, ${title}`} className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]!;
          const common = {
            role: 'listitem',
            'aria-setsize': rows.length,
            'aria-posinset': item.index + 1,
            'data-agenda-index': item.index,
            className: 'absolute inset-x-0',
            style: { transform: `translateY(${item.start}px)`, height: item.size },
          } as const;
          if (row.type === 'day') {
            const isToday = isSameDay(row.day, today);
            return (
              <div key={row.key} {...common}>
                <h3
                  className={cn(
                    'flex h-full items-end gap-2 border-b bg-muted/40 px-4 pb-1.5 text-sm font-semibold',
                    isToday && 'text-calendar-today',
                  )}
                >
                  {formatDayLabel(row.day, timeZone, locale)}
                  {isToday && <span className="text-xs font-medium">· Today</span>}
                  <span className="ms-auto text-xs font-normal text-muted-foreground">
                    {row.count} {row.count === 1 ? 'event' : 'events'}
                  </span>
                </h3>
              </div>
            );
          }
          const o = row.occurrence;
          const allDay = isAllDayLike(o) || !row.isStart || !row.isEnd;
          return (
            <div key={row.key} {...common}>
              <div className="flex h-full items-center gap-3 px-4 py-1">
                <span className="w-20 shrink-0 text-xs @min-[40rem]:w-36 tabular-nums text-muted-foreground">
                  {allDay ? 'All day' : formatTimeRange(o.start, o.end, timeZone, locale)}
                </span>
                <EventCard
                  occurrence={o}
                  segmentKey={`ag:${row.key}`}
                  segmentDay={row.day.getTime()}
                  surface="month"
                  isStart={row.isStart}
                  isEnd={row.isEnd}
                  disableDrag
                  tabbable
                  className="h-10 flex-1"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
