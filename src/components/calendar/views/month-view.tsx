import { Popover } from '@base-ui/react/popover';
import { useDroppable } from '@dnd-kit/core';
import type { TZDate } from '@date-fns/tz';
import { useVirtualizer } from '@tanstack/react-virtual';
import { addDays, addMonths, addYears, endOfWeek, isSameMonth, startOfDay, startOfWeek } from 'date-fns';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { isPreviewOccurrence, useCalendar, useOccurrencesWithPreview } from '../calendar-context';
import { slotDataAttributes } from '../calendar-context-menu';
import { EventCard } from '../event-card';
import type { DropData } from '../lib/dnd';
import { formatDayLabel, inZone, isSameDay, isWeekend, toIsoDay } from '../lib/dates';
import { buildSpanSegments, type SpanSegment } from '../lib/segments';
import type { CellRenderContext, EventOccurrence } from '../types';

const LANE_REM = 1.5; // 24px lanes → WCAG 2.5.8 minimum target size
const HEADER_REM = 1.75;

export interface MonthViewProps {
  className?: string;
}

export function MonthView({ className }: MonthViewProps) {
  const cal = useCalendar();
  const { range, cursor, timeZone, locale, weekStartsOn, maxEventsPerCell, isNarrow } = cal;
  const occurrences = useOccurrencesWithPreview(cal.occurrences);
  const gridRef = useRef<HTMLDivElement>(null);
  const wantsFocus = useRef(false);

  const weeks = useMemo(() => {
    const rows: TZDate[][] = [];
    for (let i = 0; i < range.days.length; i += 7) rows.push(range.days.slice(i, i + 7));
    return rows;
  }, [range.days]);

  const segmentsByWeek = useMemo(
    () => weeks.map((days) => buildSpanSegments(occurrences, days, timeZone)),
    [weeks, occurrences, timeZone],
  );

  const weekdayLabels = useMemo(() => {
    const short = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone });
    const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone });
    return (weeks[0] ?? []).map((d) => ({ short: short.format(d), long: long.format(d) }));
  }, [weeks, locale, timeZone]);

  // Move DOM focus to the cursor cell after keyboard navigation (cells may have re-mounted).
  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${toIsoDay(cursor)}"]`)?.focus();
  }, [cursor]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).hasAttribute('data-calendar-month-cell')) return;
    let next: Date | null = null;
    const inline = cal.direction === 'rtl' ? -1 : 1;
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
        if (cal.onSlotSelect) {
          e.preventDefault();
          cal.onSlotSelect({ start: new Date(cursor.getTime()), end: new Date(addDays(cursor, 1).getTime()), allDay: true });
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    wantsFocus.current = true;
    if (isSameDay(next, cursor)) {
      gridRef.current?.querySelector<HTMLElement>(`[data-date="${toIsoDay(cursor)}"]`)?.focus();
      wantsFocus.current = false;
    } else {
      cal.setCursor(new Date(startOfDay(next).getTime()));
    }
  };

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone }).format(cursor);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div
        ref={gridRef}
        role="grid"
        aria-label={monthLabel}
        aria-readonly={cal.onSlotSelect ? undefined : true}
        onKeyDown={onKeyDown}
        data-calendar-drag-surface="month"
        className={cn(
          'grid grid-cols-7',
          isNarrow ? 'content-start' : 'flex-1 grid-rows-[auto_repeat(6,minmax(var(--month-row-min),1fr))]',
        )}
        style={{ ['--month-row-min' as string]: `${HEADER_REM + LANE_REM * (maxEventsPerCell + 1) + 0.25}rem` }}
      >
        {/* Header row: subgrid keeps weekday labels aligned with the day columns. */}
        <div role="row" className="col-span-full grid grid-cols-subgrid border-b">
          {weekdayLabels.map((w) => (
            <div key={w.long} role="columnheader" className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
              <abbr title={w.long} className="no-underline">
                {isNarrow ? w.short.slice(0, 1) : w.short}
              </abbr>
            </div>
          ))}
        </div>

        {weeks.map((days, wi) => (
          <div key={days[0]!.getTime()} role="row" className="col-span-full grid grid-cols-subgrid border-b last:border-b-0">
            {days.map((day, di) => (
              <MonthCell
                key={day.getTime()}
                day={day}
                column={di}
                segments={segmentsByWeek[wi] ?? []}
              />
            ))}
          </div>
        ))}
      </div>

      {isNarrow && <NarrowDayAgenda />}
    </div>
  );
}

interface MonthCellProps {
  day: TZDate;
  column: number;
  segments: SpanSegment[];
}

function MonthCell({ day, column, segments }: MonthCellProps) {
  const cal = useCalendar();
  const { cursor, today, timeZone, locale, maxEventsPerCell, isNarrow, view, messages, blockedRanges } = cal;
  // A day fully covered by a global blocked range is shaded and announced as unavailable.
  const dayBlocked =
    blockedRanges.length > 0 &&
    blockedRanges.some((b) => !b.resourceId && b.start.getTime() <= day.getTime() && b.end.getTime() >= addDays(day, 1).getTime());
  const isToday = isSameDay(day, today);
  const isSelected = isSameDay(day, cursor);
  const isOutside = !isSameMonth(day, cursor);
  const dropData: DropData = { surface: 'month', day: day.getTime() };
  const { setNodeRef, isOver } = useDroppable({ id: `month:${day.getTime()}`, data: dropData });

  const covering = segments.filter((s) => s.startCol <= column && s.endCol >= column);
  const visible = segments.filter((s) => s.startCol === column && s.lane < maxEventsPerCell);
  const hidden = covering.filter((s) => s.lane >= maxEventsPerCell && !isPreviewOccurrence(s.occurrence));
  const dayEvents = covering.map((s) => s.occurrence).filter((o) => !isPreviewOccurrence(o));

  const dayNumber = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone }).format(day);
  const defaultContent = (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
        isToday && 'bg-calendar-today font-semibold text-white',
        !isToday && isOutside && 'text-muted-foreground',
      )}
    >
      {dayNumber}
    </span>
  );
  const cellCtx: CellRenderContext = {
    date: day,
    view,
    isToday,
    isOutsideRange: isOutside,
    isWeekend: isWeekend(day),
    isSelected,
    events: dayEvents,
    defaultContent,
  };

  const realEvents = dayEvents.filter((o) => !isPreviewOccurrence(o));
  const label = `${formatDayLabel(day, timeZone, locale)}${isToday ? messages.todaySuffix : ''}${
    realEvents.length ? `, ${messages.eventCount(realEvents.length)}` : ''}${dayBlocked ? `, ${messages.unavailable}` : ''
  }`;

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={label}
      aria-selected={isSelected}
      aria-current={isToday ? 'date' : undefined}
      tabIndex={isSelected ? 0 : -1}
      data-date={toIsoDay(day)}
      data-calendar-month-cell=""
      {...slotDataAttributes({ start: new Date(day.getTime()), end: new Date(addDays(day, 1).getTime()), allDay: true })}
      data-outside={isOutside ? '' : undefined}
      data-today={isToday ? '' : undefined}
      data-blocked={dayBlocked ? '' : undefined}
      data-over={isOver ? '' : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('[data-calendar-event],button')) {
          cal.setCursor(new Date(day.getTime()));
        }
      }}
      onDoubleClick={() =>
        cal.onSlotSelect?.({ start: new Date(day.getTime()), end: new Date(addDays(day, 1).getTime()), allDay: true })
      }
      className={cn(
        'relative min-w-0 border-e p-1 outline-none last:border-e-0',
        'data-[outside]:bg-muted/40 data-[over]:bg-accent data-[blocked]:[background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--muted-foreground)_18%,transparent)_0_2px,transparent_2px_8px)]',
        'focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
        'aria-selected:bg-accent/60',
      )}
    >
      <div className="flex h-6 items-center justify-between">{cal.renderCell ? cal.renderCell(cellCtx) : defaultContent}</div>

      {isNarrow ? (
        <div aria-hidden className="mt-0.5 flex h-2 justify-center gap-0.5">
          {dayEvents.slice(0, 3).map((o) => (
            <span key={o.occurrenceId} className="size-1.5 rounded-full" style={{ background: o.color ?? 'var(--calendar-event)' }} />
          ))}
        </div>
      ) : (
        <>
          {visible.map((s) => (
            <EventCard
              key={s.key}
              occurrence={s.occurrence}
              segmentKey={`m:${s.key}:${column}`}
              segmentDay={day.getTime()}
              surface="month"
              isStart={s.isStart}
              isEnd={s.isEnd}
              density="compact"
              tabbable={isSelected}
              resizable
              resizeAxis="horizontal"
              className="absolute start-0.5 z-10"
              style={{
                top: `${HEADER_REM + 0.25 + s.lane * LANE_REM}rem`,
                height: `${LANE_REM - 0.125}rem`,
                width: `calc(${(s.endCol - s.startCol + 1) * 100}% - 0.25rem)`,
              }}
            />
          ))}
          {hidden.length > 0 && (
            <MoreEventsPopover
              day={day}
              events={dayEvents}
              hiddenCount={hidden.length}
              tabbable={isSelected}
              top={HEADER_REM + 0.25 + maxEventsPerCell * LANE_REM}
            />
          )}
        </>
      )}
    </div>
  );
}

function MoreEventsPopover({
  day,
  events,
  hiddenCount,
  tabbable,
  top,
}: {
  day: TZDate;
  events: EventOccurrence[];
  hiddenCount: number;
  tabbable: boolean;
  top: number;
}) {
  const { timeZone, locale, messages } = useCalendar();
  return (
    <Popover.Root>
      <Popover.Trigger
        tabIndex={tabbable ? 0 : -1}
        className="absolute start-0.5 z-10 h-5 rounded px-1.5 text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={{ top: `${top}rem` }}
        aria-label={messages.showMore(hiddenCount, formatDayLabel(day, timeZone, locale))}
      >
        {messages.more(hiddenCount)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="start" collisionPadding={12} className="z-50">
          <Popover.Popup className="w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg outline-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity">
            <Popover.Title className="px-1 pb-2 text-sm font-semibold">{formatDayLabel(day, timeZone, locale)}</Popover.Title>
            <EventList events={events} day={day} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const VIRTUALIZE_THRESHOLD = 40;
const ROW_PX = 28;

/** Vertical list of events; virtualised for high-density days. */
function EventList({ events, day }: { events: EventOccurrence[]; day: TZDate }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = events.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX,
    overscan: 8,
    enabled: virtualize,
  });

  const renderItem = (o: EventOccurrence) => (
    <EventCard
      occurrence={o}
      segmentKey={`list:${o.occurrenceId}:${day.getTime()}`}
      segmentDay={day.getTime()}
      surface="month"
      density="compact"
      disableDrag
      tabbable
      className="h-6"
    />
  );

  if (!virtualize) {
    return (
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {events.map((o) => (
          <li key={o.occurrenceId}>{renderItem(o)}</li>
        ))}
      </ul>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-72 overflow-y-auto">
      <ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const o = events[item.index]!;
          return (
            <li
              key={o.occurrenceId}
              aria-setsize={events.length}
              aria-posinset={item.index + 1}
              className="absolute inset-x-0"
              style={{ top: item.start, height: ROW_PX }}
            >
              {renderItem(o)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Below 768px the month grid shows dots only; the selected day's events are listed here. */
function NarrowDayAgenda() {
  const { cursor, occurrences, timeZone, locale, messages } = useCalendar();
  const dayStart = cursor.getTime();
  const dayEnd = addDays(cursor, 1).getTime();
  const events = occurrences.filter(
    (o) => o.start.getTime() < dayEnd && Math.max(o.end.getTime(), o.start.getTime() + 1) > dayStart,
  );
  return (
    <section aria-label={messages.selectedDay} className="border-t p-3">
      <h3 className="mb-2 text-sm font-semibold">{formatDayLabel(inZone(cursor, timeZone), timeZone, locale)}</h3>
      {events.length ? (
        <EventList events={events} day={cursor} />
      ) : (
        <p className="text-sm text-muted-foreground">{messages.noEvents}</p>
      )}
    </section>
  );
}
