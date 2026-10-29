import type { TZDate } from '@date-fns/tz';
import { useDroppable } from '@dnd-kit/core';
import { addDays, addMinutes, addWeeks } from 'date-fns';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useCalendar, useCalendarConfig, useOccurrencesWithPreview } from '../calendar-context';
import { useNow } from '../hooks/use-now';
import { blockSegmentsForDay, hatchStyle, isBusinessTime, type BlockSegment } from '../lib/availability';
import type { TimedPlacement } from '../lib/layout';
import { slotDataAttributes } from '../calendar-context-menu';
import { EventCard } from '../event-card';
import type { DropData } from '../lib/dnd';
import { formatDayLabel, inZone, isAllDayLike, isSameDay, isWeekend, toIsoDay } from '../lib/dates';
import { buildSpanSegments, buildTimedSegments, type SpanSegment, type TimedSegment } from '../lib/segments';
import type { CalendarResource, CellRenderContext, EventOccurrence } from '../types';

const LANE_REM = 1.5;

interface Column {
  key: string;
  index: number;
  day: TZDate;
  dayIndex: number;
  resource?: CalendarResource;
}

export interface WeekViewProps {
  className?: string;
}

/**
 * Time-grid view used for `week`, `work-week` and `day`. Below 768px it collapses to the
 * focused day with a 7-day picker strip.
 *
 * Layout: a single CSS grid (time gutter + one track per column). Header, all-day and slot
 * rows are `grid-template-columns: subgrid` so every row aligns to the same tracks, and the
 * header group is `position: sticky` inside the one scroll container.
 */
export function WeekView({ className }: WeekViewProps) {
  const cal = useCalendar();
  const {
    range, cursor, timeZone, locale, slotDuration, pxPerMinute, dayStartHour, dayEndHour,
    scrollToHour, visibleResources, isNarrow, today, view, messages, businessHours, blockedRanges,
  } = cal;
  const occurrences = useOccurrencesWithPreview(cal.occurrences);

  const days = useMemo(() => (isNarrow ? [cursor] : range.days), [isNarrow, cursor, range.days]);
  const resources = visibleResources;
  const columns = useMemo<Column[]>(() => {
    const list: Column[] = [];
    days.forEach((day, dayIndex) => {
      if (resources.length === 0) list.push({ key: `${day.getTime()}`, index: list.length, day, dayIndex });
      else for (const r of resources) list.push({ key: `${day.getTime()}:${r.id}`, index: list.length, day, dayIndex, resource: r });
    });
    return list;
  }, [days, resources]);

  const visStart = dayStartHour * 60;
  const visEnd = dayEndHour * 60;
  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = visStart; m < visEnd; m += slotDuration) out.push(m);
    return out;
  }, [visStart, visEnd, slotDuration]);
  const slotPx = slotDuration * pxPerMinute;

  // ---- Events per column -----------------------------------------------------------------
  const occForColumn = (col: Column, list: EventOccurrence[]) =>
    col.resource ? list.filter((o) => o.resourceIds?.includes(col.resource!.id)) : list;

  const allDayOccs = useMemo(() => occurrences.filter(isAllDayLike), [occurrences]);
  const allDayByColumn = useMemo(() => {
    const map = new Map<number, SpanSegment[]>();
    if (resources.length === 0) {
      for (const seg of buildSpanSegments(allDayOccs, days, timeZone)) {
        const arr = map.get(seg.startCol) ?? [];
        arr.push(seg);
        map.set(seg.startCol, arr);
      }
    } else {
      // With resource columns, multi-day bars can't span across other resources: clip per day.
      for (const col of columns) map.set(col.index, buildSpanSegments(occForColumn(col, allDayOccs), [col.day], timeZone));
    }
    return map;
  }, [allDayOccs, days, columns, resources.length, timeZone]);
  const allDayLanes = Math.max(1, ...[...allDayByColumn.values()].flat().map((s) => s.lane + 1));

  const timedByCell = useMemo(() => {
    const map = new Map<string, TimedSegment[]>();
    for (const col of columns) {
      for (const seg of buildTimedSegments(occForColumn(col, occurrences), col.day, timeZone)) {
        if (seg.endMinute <= visStart || seg.startMinute >= visEnd) continue;
        const start = Math.max(seg.startMinute, visStart);
        const slotIndex = Math.floor((start - visStart) / slotDuration);
        const key = `${col.index}:${slotIndex}`;
        const arr = map.get(key) ?? [];
        arr.push(seg);
        map.set(key, arr);
      }
    }
    return map;
  }, [columns, occurrences, timeZone, visStart, visEnd, slotDuration]);

  const blocksByCell = useMemo(() => {
    const map = new Map<string, BlockSegment[]>();
    if (!blockedRanges.length) return map;
    for (const col of columns) {
      for (const seg of blockSegmentsForDay(blockedRanges, col.day, timeZone, col.resource?.id)) {
        if (seg.endMinute <= visStart || seg.startMinute >= visEnd) continue;
        const slotIndex = Math.floor((Math.max(seg.startMinute, visStart) - visStart) / slotDuration);
        const key = `${col.index}:${slotIndex}`;
        map.set(key, [...(map.get(key) ?? []), seg]);
      }
    }
    return map;
  }, [blockedRanges, columns, timeZone, visStart, visEnd, slotDuration]);

  // ---- Drag to create ---------------------------------------------------------------------
  const [selection, setSelection] = useState<{ col: number; anchor: number; current: number } | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch' || !cal.onSlotSelect) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-calendar-event],[data-calendar-ghost],button')) return;
    const cell = target.closest<HTMLElement>('[data-slot]');
    if (!cell) return;
    const [col, minute] = cell.dataset.slot!.split(':').map(Number) as [number, number];
    setSelection({ col, anchor: minute, current: minute });

    const onMove = (ev: globalThis.PointerEvent) => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-slot]');
      if (!over) return;
      const [c, m] = over.dataset.slot!.split(':').map(Number) as [number, number];
      if (c !== col) return;
      setSelection((s) => (s && s.current !== m ? { ...s, current: m } : s));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const sel = selectionRef.current;
      setSelection(null);
      // A plain click (no movement) does nothing; double-click / Enter handle single slots.
      if (!sel || sel.anchor === sel.current) return;
      const column = columns[sel.col];
      if (!column) return;
      const from = Math.min(sel.anchor, sel.current);
      const to = Math.max(sel.anchor, sel.current) + slotDuration;
      cal.onSlotSelect?.({
        start: new Date(addMinutes(column.day, from).getTime()),
        end: new Date(addMinutes(column.day, to).getTime()),
        allDay: false,
        ...(column.resource ? { resourceId: column.resource.id } : {}),
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const selFrom = selection ? Math.min(selection.anchor, selection.current) : -1;
  const selTo = selection ? Math.max(selection.anchor, selection.current) : -1;

  // ---- Roving focus ----------------------------------------------------------------------
  const [focusMinute, setFocusMinute] = useState(() => Math.min(Math.max(scrollToHour * 60, visStart), visEnd - slotDuration));
  const [focusResource, setFocusResource] = useState(0);
  const focusDayIndex = Math.max(0, days.findIndex((d) => isSameDay(d, cursor)));
  const focusCol = focusDayIndex * Math.max(1, resources.length) + Math.min(focusResource, Math.max(0, resources.length - 1));
  const gridRef = useRef<HTMLDivElement>(null);
  const wantsFocus = useRef(false);

  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-slot="${focusCol}:${focusMinute}"]`)?.focus();
  });

  const moveFocus = (colDelta: number, minuteDelta: number) => {
    const R = Math.max(1, resources.length);
    const nextMinute = Math.min(Math.max(focusMinute + minuteDelta, visStart), visEnd - slotDuration);
    const target = focusCol + colDelta;
    const dayShift = Math.floor(target / R) - focusDayIndex;
    const nextRes = ((target % R) + R) % R;
    setFocusMinute(nextMinute);
    setFocusResource(nextRes);
    wantsFocus.current = true;
    if (dayShift !== 0) cal.setCursor(new Date(addDays(cursor, dayShift).getTime()));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (!el.hasAttribute('data-slot')) return;
    switch (e.key) {
      case 'ArrowRight': moveFocus(cal.direction === 'rtl' ? -1 : 1, 0); break;
      case 'ArrowLeft': moveFocus(cal.direction === 'rtl' ? 1 : -1, 0); break;
      case 'ArrowDown': moveFocus(0, slotDuration); break;
      case 'ArrowUp': moveFocus(0, -slotDuration); break;
      case 'Home': e.ctrlKey ? moveFocus(0, -Infinity) : moveFocus(-focusCol, 0); break;
      case 'End': e.ctrlKey ? moveFocus(0, Infinity) : moveFocus(columns.length - 1 - focusCol, 0); break;
      case 'PageUp':
      case 'PageDown': {
        wantsFocus.current = true;
        const sign = e.key === 'PageUp' ? -1 : 1;
        cal.setCursor(new Date((isNarrow || view === 'day' ? addDays(cursor, sign) : addWeeks(cursor, sign)).getTime()));
        break;
      }
      case 'Enter':
      case ' ': {
        const col = columns[focusCol];
        if (!col || !cal.onSlotSelect) return;
        const start = addMinutes(col.day, focusMinute);
        cal.onSlotSelect({
          start: new Date(start.getTime()),
          end: new Date(addMinutes(start, slotDuration).getTime()),
          allDay: false,
          ...(col.resource ? { resourceId: col.resource.id } : {}),
        });
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };

  // ---- Initial scroll ---------------------------------------------------------------------
  const viewportRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const target = Math.max(0, (scrollToHour * 60 - visStart) * pxPerMinute - 12); // keep the hour label visible
    vp.scrollTop = target; // only on mount / config change, not on every navigation
  }, [scrollToHour, visStart, pxPerMinute]);

  const now = useNow();
  const nowZoned = inZone(now, timeZone);
  const nowMinute = nowZoned.getHours() * 60 + nowZoned.getMinutes();

  const R = Math.max(1, resources.length);
  const gridLabel = cal.title;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {isNarrow && <DayStrip />}
      <ScrollArea className="flex-1" viewportRef={viewportRef}>
        <div
          ref={gridRef}
          role="grid"
          aria-label={gridLabel}
          aria-rowcount={slots.length + 2 + (resources.length ? 1 : 0)}
          aria-colcount={columns.length + 1}
          aria-readonly={cal.onSlotSelect ? undefined : true}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          data-calendar-drag-surface="time-grid"
          className="grid"
          style={{
            gridTemplateColumns: `4rem repeat(${columns.length}, minmax(${resources.length ? '7rem' : '0'}, 1fr))`,
          }}
        >
          {/* Sticky header group: day headers, resource headers, all-day lane. */}
          <div role="rowgroup" className="sticky top-0 z-20 col-span-full grid grid-cols-subgrid border-b bg-card">
            <div role="row" className="col-span-full grid grid-cols-subgrid" aria-rowindex={1}>
              <div role="columnheader" className="border-e" aria-colindex={1}>
                <span className="sr-only">{messages.time}</span>
              </div>
              {days.map((day, di) => (
                <DayHeader key={day.getTime()} day={day} span={R} colIndex={di * R + 2} isToday={isSameDay(day, today)} />
              ))}
            </div>

            {resources.length > 0 && (
              <div role="row" className="col-span-full grid grid-cols-subgrid border-t" aria-rowindex={2}>
                <div role="columnheader" className="border-e" aria-colindex={1}>
                  <span className="sr-only">{messages.resource}</span>
                </div>
                {columns.map((col) => (
                  <div
                    key={col.key}
                    role="columnheader"
                    aria-colindex={col.index + 2}
                    className="min-w-0 truncate border-e px-2 py-1 text-xs font-medium last:border-e-0"
                  >
                    {cal.renderResourceHeader
                      ? cal.renderResourceHeader({ resource: col.resource!, view, date: col.day })
                      : col.resource!.title}
                  </div>
                ))}
              </div>
            )}

            <div role="row" className="col-span-full grid grid-cols-subgrid border-t" aria-rowindex={resources.length ? 3 : 2}>
              <div role="rowheader" aria-colindex={1} className="border-e px-1 py-1 text-right text-[0.65rem] text-muted-foreground">
                {messages.allDay}
              </div>
              {columns.map((col) => (
                <AllDayCell
                  key={col.key}
                  column={col}
                  segments={allDayByColumn.get(col.index) ?? []}
                  lanes={allDayLanes}
                  tabbable={col.index === focusCol}
                />
              ))}
            </div>
          </div>

          {slots.map((minute, si) => (
            <div
              key={minute}
              role="row"
              aria-rowindex={si + (resources.length ? 4 : 3)}
              className="col-span-full grid grid-cols-subgrid"
              style={{ height: slotPx }}
            >
              <div role="rowheader" aria-colindex={1} className="relative border-e">
                {minute % 60 === 0 && (
                  <span className="absolute -top-2 end-1.5 bg-card px-0.5 text-[0.65rem] tabular-nums text-muted-foreground">
                    {formatHour(minute, locale, timeZone, days[0]!)}
                  </span>
                )}
                <span className="sr-only">{formatHour(minute, locale, timeZone, days[0]!)}</span>
              </div>
              {columns.map((col) => (
                <SlotCell
                  key={col.key}
                  column={col}
                  minute={minute}
                  slotIndex={si}
                  isFocusTarget={col.index === focusCol && minute === focusMinute}
                  eventsTabbable={col.index === focusCol}
                  segments={timedByCell.get(`${col.index}:${si}`)}
                  blocks={blocksByCell.get(`${col.index}:${si}`)}
                  isToday={isSameDay(col.day, today)}
                  selecting={selection?.col === col.index && minute >= selFrom && minute <= selTo}
                  offHours={!isBusinessTime(businessHours, col.day, minute, slotDuration)}
                  showNow={isSameDay(col.day, today) && nowMinute >= minute && nowMinute < minute + slotDuration}
                  nowOffset={
                    isSameDay(col.day, today) && nowMinute >= minute && nowMinute < minute + slotDuration
                      ? (nowMinute - minute) * pxPerMinute
                      : 0
                  }
                  showNowDot={col.index % Math.max(1, resources.length) === 0}
                />
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function formatHour(minute: number, locale: string | undefined, timeZone: string, day: TZDate): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: minute % 60 ? '2-digit' : undefined, timeZone }).format(
    addMinutes(day, minute),
  );
}

function DayHeader({ day, span, colIndex, isToday }: { day: TZDate; span: number; colIndex: number; isToday: boolean }) {
  const { locale, timeZone, setCursor, setView, views, messages } = useCalendar();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(day);
  const dayNum = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone }).format(day);
  const canDrill = views.includes('day');
  const content = (
    <>
      <span className="text-xs uppercase text-muted-foreground">{weekday}</span>
      <span
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
          isToday && 'bg-calendar-today text-white',
        )}
      >
        {dayNum}
      </span>
    </>
  );
  return (
    <div
      role="columnheader"
      aria-colindex={colIndex}
      aria-colspan={span > 1 ? span : undefined}
      aria-label={`${formatDayLabel(day, timeZone, locale)}${isToday ? messages.todaySuffix : ''}`}
      className="flex min-w-0 items-center justify-center gap-1.5 border-e py-1.5 last:border-e-0"
      style={{ gridColumn: `span ${span}` }}
    >
      {canDrill ? (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-1 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => {
            setCursor(new Date(day.getTime()));
            setView('day');
          }}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </div>
  );
}

function AllDayCell({
  column,
  segments,
  lanes,
  tabbable,
}: {
  column: Column;
  segments: SpanSegment[];
  lanes: number;
  tabbable: boolean;
}) {
  const dropData: DropData = {
    surface: 'all-day',
    day: column.day.getTime(),
    ...(column.resource ? { resourceId: column.resource.id } : {}),
  };
  const { setNodeRef, isOver } = useDroppable({ id: `allday:${column.key}`, data: dropData });
  // With no resources, each segment's startCol is a day index == column index.
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-colindex={column.index + 2}
      data-over={isOver ? '' : undefined}
      {...slotDataAttributes({
        start: new Date(column.day.getTime()),
        end: new Date(addDays(column.day, 1).getTime()),
        allDay: true,
        ...(column.resource ? { resourceId: column.resource.id } : {}),
      })}
      className="relative border-e last:border-e-0 data-[over]:bg-accent"
      style={{ height: `${lanes * LANE_REM + 0.25}rem` }}
    >
      {segments
        .filter((s) => (column.resource ? true : s.startCol === column.dayIndex))
        .map((s) => (
          <EventCard
            key={s.key}
            occurrence={s.occurrence}
            segmentKey={`ad:${column.key}:${s.key}`}
            segmentDay={column.day.getTime()}
            surface="all-day"
            {...(column.resource ? { resourceId: column.resource.id } : {})}
            isStart={s.isStart}
            isEnd={s.isEnd}
            density="compact"
            tabbable={tabbable}
            resizable
            resizeAxis="horizontal"
            className="absolute start-0.5 z-10"
            style={{
              top: `${0.125 + s.lane * LANE_REM}rem`,
              height: `${LANE_REM - 0.125}rem`,
              width: `calc(${(column.resource ? 1 : s.endCol - s.startCol + 1) * 100}% - 0.25rem)`,
            }}
          />
        ))}
    </div>
  );
}

interface SlotCellProps {
  column: Column;
  minute: number;
  slotIndex: number;
  isFocusTarget: boolean;
  eventsTabbable: boolean;
  segments: TimedSegment[] | undefined;
  blocks: BlockSegment[] | undefined;
  isToday: boolean;
  /** Part of an in-progress drag-to-create selection. */
  selecting: boolean;
  offHours: boolean;
  showNow: boolean;
  nowOffset: number;
  showNowDot: boolean;
}

/**
 * One time slot. Memoised and subscribed to the (rarely changing) config context only, so
 * navigation, selection and optimistic updates re-render just the cells whose props change.
 */
const SlotCell = memo(function SlotCell({
  column,
  minute,
  isFocusTarget,
  eventsTabbable,
  segments,
  blocks,
  isToday,
  selecting,
  offHours,
  showNow,
  nowOffset,
  showNowDot,
}: SlotCellProps) {
  const cfg = useCalendarConfig();
  const { pxPerMinute, slotDuration, dayStartHour, dayEndHour, locale, timeZone, messages } = cfg;
  const dropData: DropData = {
    surface: 'time-grid',
    day: column.day.getTime(),
    ...(column.resource ? { resourceId: column.resource.id } : {}),
  };
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${column.key}:${minute}`, data: dropData });
  const start = addMinutes(column.day, minute);
  const visStart = dayStartHour * 60;
  const visEnd = dayEndHour * 60;

  const label = `${formatDayLabel(column.day, timeZone, locale)}, ${new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(start)}${column.resource ? `, ${column.resource.title}` : ''}${blocks?.length ? `, ${messages.unavailable}` : ''}`;

  const cellCtx: CellRenderContext | null = cfg.renderCell
    ? {
        date: start,
        view: 'week',
        isToday,
        isOutsideRange: false,
        isWeekend: isWeekend(column.day),
        isSelected: isFocusTarget,
        events: segments?.map((s) => s.occurrence) ?? [],
        ...(column.resource ? { resource: column.resource } : {}),
        defaultContent: null,
      }
    : null;

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-colindex={column.index + 2}
      aria-label={label}
      aria-selected={isFocusTarget}
      tabIndex={isFocusTarget ? 0 : -1}
      data-slot={`${column.index}:${minute}`}
      {...slotDataAttributes({
        start: new Date(start.getTime()),
        end: new Date(addMinutes(start, slotDuration).getTime()),
        allDay: false,
        ...(column.resource ? { resourceId: column.resource.id } : {}),
      })}
      data-calendar-day-column={column.index === 0 && minute === visStart ? '' : undefined}
      data-hour-start={minute % 60 === 0 ? '' : undefined}
      data-over={isOver ? '' : undefined}
      data-weekend={isWeekend(column.day) ? '' : undefined}
      data-off-hours={offHours ? '' : undefined}
      data-selecting={selecting ? '' : undefined}
      onDoubleClick={() =>
        cfg.onSlotSelect?.({
          start: new Date(start.getTime()),
          end: new Date(addMinutes(start, slotDuration).getTime()),
          allDay: false,
          ...(column.resource ? { resourceId: column.resource.id } : {}),
        })
      }
      className={cn(
        'relative min-w-0 border-e last:border-e-0 outline-none',
        'data-[hour-start]:border-t data-[hour-start]:border-t-border',
        'data-[weekend]:bg-muted/30 data-[off-hours]:bg-muted/60 data-[over]:bg-accent',
        'data-[selecting]:bg-calendar-event/20',
        'focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
      )}
    >
      {cellCtx && cfg.renderCell?.(cellCtx)}
      {blocks?.map((b) => {
        const s0 = Math.max(b.startMinute, visStart);
        return (
          <div
            key={b.key}
            aria-hidden
            data-calendar-blocked=""
            className="pointer-events-none absolute inset-x-0 z-0 overflow-hidden px-1 text-[0.65rem] text-muted-foreground"
            style={{ top: (s0 - minute) * pxPerMinute, height: (Math.min(b.endMinute, visEnd) - s0) * pxPerMinute, ...hatchStyle }}
          >
            {b.block.label}
          </div>
        );
      })}
      {segments?.map((seg) => {
        const clampedStart = Math.max(seg.startMinute, visStart);
        const top = (clampedStart - minute) * pxPerMinute;
        const height = Math.max((Math.min(seg.endMinute, visEnd) - clampedStart) * pxPerMinute, 20);
        return (
          <EventCard
            key={seg.key}
            occurrence={seg.occurrence}
            segmentKey={`tg:${column.key}:${seg.key}`}
            segmentDay={column.day.getTime()}
            surface="time-grid"
            {...(column.resource ? { resourceId: column.resource.id } : {})}
            isStart={seg.isStart}
            isEnd={seg.isEnd}
            resizable
            tabbable={eventsTabbable}
            className={cn('absolute', seg.placement.columns >= 3 && 'ring-1 ring-card')}
            style={{ top, height, ...overlapStyle(seg.placement) }}
          />
        );
      })}
      {showNow && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-calendar-now" style={{ top: nowOffset }}>
          {showNowDot && <span className="absolute -start-1 -top-1 size-2.5 rounded-full bg-calendar-now" />}
        </div>
      )}
    </div>
  );
});

/**
 * Horizontal placement for overlapping events. Up to two columns split the width; with
 * three or more, events cascade (each wider than its share, overlapping the next) so titles
 * stay readable instead of shrinking to slivers.
 */
export function overlapStyle({ column, columns, span }: TimedPlacement): CSSProperties {
  const share = 100 / columns;
  const start = column * share;
  if (columns < 3) {
    return { insetInlineStart: `calc(${start}% + 1px)`, width: `calc(${span * share}% - 3px)`, zIndex: 10 };
  }
  const isLast = column + span >= columns;
  const width = isLast ? 100 - start : Math.min(100 - start, span * share * 1.7);
  return { insetInlineStart: `calc(${start}% + 1px)`, width: `calc(${width}% - 3px)`, zIndex: 10 + column };
}

/** 7-day picker shown above the collapsed (single-day) time grid on narrow screens. */
function DayStrip() {
  const { cursor, setCursor, weekStartsOn, locale, timeZone, today, messages } = useCalendar();
  const start = useMemo(() => {
    const d = cursor.getDay();
    return addDays(cursor, -((d - weekStartsOn + 7) % 7));
  }, [cursor, weekStartsOn]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div role="group" aria-label={messages.chooseDay} className="grid grid-cols-7 gap-1 border-b p-2">
      {days.map((d) => {
        const selected = isSameDay(d, cursor);
        return (
          <button
            key={toIsoDay(d)}
            type="button"
            aria-pressed={selected}
            aria-label={formatDayLabel(d, timeZone, locale)}
            onClick={() => setCursor(new Date(d.getTime()))}
            className={cn(
              'flex min-h-11 flex-col items-center justify-center rounded-md text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              'aria-pressed:bg-primary aria-pressed:text-primary-foreground',
              !selected && isSameDay(d, today) && 'text-calendar-today font-semibold',
            )}
          >
            <span>{new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone }).format(d)}</span>
            <span className="text-sm tabular-nums">{new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone }).format(d)}</span>
          </button>
        );
      })}
    </div>
  );
}
