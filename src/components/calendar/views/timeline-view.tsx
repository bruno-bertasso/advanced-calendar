import type { TZDate } from '@date-fns/tz';
import { useDroppable } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { addDays, addMinutes } from 'date-fns';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { isPreviewOccurrence, useCalendar, useOccurrencesWithPreview } from '../calendar-context';
import { useNow } from '../hooks/use-now';
import { blocksFor, hatchStyle } from '../lib/availability';
import { EventCard } from '../event-card';
import type { DropData } from '../lib/dnd';
import { formatDateTime, isSameDay } from '../lib/dates';
import { layoutSpanLanes } from '../lib/layout';
import type { CalendarResource, EventOccurrence } from '../types';

const LANE_PX = 30;
const ROW_PAD_PX = 6;
const MIN_ROW_PX = 44;
const HEADER_PX = 52;
export const UNASSIGNED_ROW_ID = '__unassigned';

export interface TimelineItem {
  occurrence: EventOccurrence;
  startMinute: number;
  endMinute: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
}

export interface TimelineRow {
  id: string;
  resource?: CalendarResource;
  title: string;
  items: TimelineItem[];
  lanes: number;
}

/** Group occurrences into resource rows, clip to the range and stack overlaps into lanes. */
export function buildTimelineRows(
  occurrences: readonly EventOccurrence[],
  resources: readonly CalendarResource[],
  rangeStart: Date,
  rangeEnd: Date,
  labels: { unassigned: string; allEvents: string } = { unassigned: 'Unassigned', allEvents: 'All events' },
): TimelineRow[] {
  const startMs = rangeStart.getTime();
  const total = Math.round((rangeEnd.getTime() - startMs) / 60_000);
  const toMinute = (d: Date) => Math.min(total, Math.max(0, Math.round((d.getTime() - startMs) / 60_000)));

  const groups: { id: string; resource?: CalendarResource; title: string; occs: EventOccurrence[] }[] = resources.map(
    (r) => ({ id: r.id, resource: r, title: r.title, occs: occurrences.filter((o) => o.resourceIds?.includes(r.id)) }),
  );
  const known = new Set(resources.map((r) => r.id));
  const unassigned = occurrences.filter((o) => !o.resourceIds?.some((id) => known.has(id)));
  if (unassigned.length || groups.length === 0) {
    groups.push({ id: UNASSIGNED_ROW_ID, title: resources.length ? labels.unassigned : labels.allEvents, occs: unassigned });
  }

  return groups.map((g) => {
    const raw = g.occs.map((o) => {
      const s = toMinute(o.start);
      const e = Math.max(toMinute(o.end), s + 1);
      return { occurrence: o, startMinute: s, endMinute: e, isStart: o.start.getTime() >= startMs, isEnd: o.end.getTime() <= rangeEnd.getTime() };
    });
    const lanes = layoutSpanLanes(
      raw.map((r) => ({ id: r.occurrence.occurrenceId, startCol: r.startMinute, endCol: r.endMinute - 1 })),
    );
    const items = raw.map((r) => ({ ...r, lane: lanes.get(r.occurrence.occurrenceId) ?? 0 }));
    return {
      id: g.id,
      ...(g.resource ? { resource: g.resource } : {}),
      title: g.title,
      items,
      lanes: Math.max(1, ...items.map((i) => i.lane + 1)),
    };
  });
}

const rowHeight = (row: TimelineRow) => Math.max(MIN_ROW_PX, row.lanes * LANE_PX + ROW_PAD_PX * 2);

export interface TimelineViewProps {
  className?: string;
}

/**
 * Resources as rows × time as columns. Both axes are virtualised (@tanstack/react-virtual):
 * only visible rows, visible hour headers and events intersecting the horizontal window render.
 * Below 768px the range collapses to a single day.
 */
export function TimelineView({ className }: TimelineViewProps) {
  const cal = useCalendar();
  const {
    range, resources, visibleResources, timeZone, locale, timelineSlotMinutes, timelinePxPerMinute,
    isNarrow, today, scrollToHour, direction, messages,
  } = cal;
  const occurrences = useOccurrencesWithPreview(cal.occurrences);
  const now = useNow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerW = isNarrow ? 112 : 192;
  const rowResources = visibleResources.length ? visibleResources : resources;

  const rows = useMemo(
    () => buildTimelineRows(occurrences, rowResources, range.start, range.end, messages),
    [occurrences, rowResources, range.start, range.end, messages],
  );
  const totalMinutes = range.days.length * 24 * 60;
  const columnCount = Math.ceil(totalMinutes / timelineSlotMinutes);
  const colPx = timelineSlotMinutes * timelinePxPerMinute;
  const trackW = totalMinutes * timelinePxPerMinute;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => rowHeight(rows[i]!),
    overscan: 6,
    scrollPaddingStart: HEADER_PX,
    initialRect: { width: 1000, height: 600 },
    getItemKey: (i) => rows[i]!.id,
  });
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: columnCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => colPx,
    overscan: 6,
    paddingStart: headerW,
    scrollPaddingStart: headerW,
    initialRect: { width: 1000, height: 600 },
    isRtl: direction === 'rtl',
  });
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rows, rowVirtualizer]);

  // Horizontal window (minutes) used to cull events.
  const vCols = colVirtualizer.getVirtualItems();
  const windowStart = vCols.length ? (vCols[0]!.start - headerW) / timelinePxPerMinute : 0;
  /** Minute at the inline-start edge of the visible track (behind the sticky row headers). */
  const viewStartMinute = Math.max(0, Math.abs(colVirtualizer.scrollOffset ?? 0) / timelinePxPerMinute);
  const windowEnd = vCols.length ? (vCols[vCols.length - 1]!.end - headerW) / timelinePxPerMinute : totalMinutes;

  // Initial horizontal scroll to `scrollToHour` of the first day (or now, if visible).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nowMinute = (now - range.start.getTime()) / 60_000;
    const minute = nowMinute > 0 && nowMinute < totalMinutes ? nowMinute - 60 : scrollToHour * 60;
    colVirtualizer.scrollToOffset(Math.max(0, minute * timelinePxPerMinute));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), timelinePxPerMinute]);

  // ---- Keyboard: roving focus over row tracks, with a focused time column ----------------
  const [focusRow, setFocusRow] = useState(0);
  const [focusMinute, setFocusMinute] = useState(scrollToHour * 60);
  const focusTrack = (row: number) =>
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-timeline-track="${row}"]`)?.focus());

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (!el.hasAttribute('data-timeline-track')) return;
    const inline = direction === 'rtl' ? -1 : 1;
    const moveMinute = (delta: number) => {
      const next = Math.min(Math.max(focusMinute + delta, 0), totalMinutes - timelineSlotMinutes);
      setFocusMinute(next);
      colVirtualizer.scrollToIndex(Math.floor(next / timelineSlotMinutes), { align: 'auto' });
    };
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const next = Math.min(Math.max(focusRow + (e.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1);
        setFocusRow(next);
        rowVirtualizer.scrollToIndex(next, { align: 'auto' });
        focusTrack(next);
        break;
      }
      case 'ArrowRight': moveMinute(inline * timelineSlotMinutes); break;
      case 'ArrowLeft': moveMinute(-inline * timelineSlotMinutes); break;
      case 'PageDown': moveMinute(24 * 60); break;
      case 'PageUp': moveMinute(-24 * 60); break;
      case 'Home': moveMinute(-totalMinutes); break;
      case 'End': moveMinute(totalMinutes); break;
      case 'Enter':
      case ' ': {
        if (!cal.onSlotSelect) return;
        const row = rows[focusRow];
        const start = addMinutes(range.start, focusMinute);
        cal.onSlotSelect({
          start: new Date(start.getTime()),
          end: new Date(addMinutes(start, timelineSlotMinutes).getTime()),
          allDay: false,
          ...(row?.resource ? { resourceId: row.resource.id } : {}),
        });
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };

  const nowMinute = (now - range.start.getTime()) / 60_000;
  const hourFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: timelineSlotMinutes % 60 ? '2-digit' : undefined, timeZone });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  const dayW = 24 * 60 * timelinePxPerMinute;

  return (
    <div
      ref={scrollRef}
      onKeyDown={onKeyDown}
      className={cn('relative min-h-0 flex-1 overflow-auto overscroll-contain', className)}
      data-calendar-drag-surface="timeline"
    >
      <div
        role="grid"
        aria-label={messages.timeline(cal.title)}
        aria-rowcount={rows.length + 1}
        aria-colcount={2}
        aria-readonly={cal.onSlotSelect ? undefined : true}
        className="relative"
        style={{ width: headerW + trackW, height: HEADER_PX + rowVirtualizer.getTotalSize() }}
      >
        {/* Sticky header: corner + day labels + virtualised time columns */}
        <div role="rowgroup" className="sticky top-0 z-30 flex border-b bg-card" style={{ height: HEADER_PX, width: headerW + trackW }}>
          <div role="row" aria-rowindex={1} className="flex">
            <div role="columnheader" className="sticky start-0 z-10 flex items-end border-e bg-card px-3 pb-1.5 text-xs font-medium text-muted-foreground" style={{ width: headerW }}>
              {messages.resources}
            </div>
            <div role="columnheader" aria-label={cal.title} className="relative" style={{ width: trackW }}>
              {range.days.map((d, i) => (
                <div
                  key={d.getTime()}
                  aria-hidden
                  className={cn('absolute top-0 h-6 border-s px-2 pt-1 text-xs font-semibold', isSameDay(d, today) && 'text-calendar-today')}
                  style={{ insetInlineStart: i * dayW, width: dayW }}
                >
                  <span className="sticky start-[calc(var(--tl-header)+0.5rem)]" style={{ ['--tl-header' as string]: `${headerW}px` }}>
                    {dayFmt.format(d)}
                  </span>
                </div>
              ))}
              {vCols.map((col) => {
                const minute = col.index * timelineSlotMinutes;
                return (
                  <div
                    key={col.key}
                    aria-hidden
                    className="absolute bottom-0 h-6 border-s px-1 pt-1 text-[0.65rem] tabular-nums text-muted-foreground"
                    style={{ insetInlineStart: col.start - headerW, width: col.size }}
                  >
                    {hourFmt.format(addMinutes(range.start, minute))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div role="rowgroup">
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index]!;
            return (
              <TimelineRowView
                key={row.id}
                row={row}
                index={vr.index}
                top={HEADER_PX + vr.start}
                height={vr.size}
                headerW={headerW}
                trackW={trackW}
                colPx={colPx}
                dayW={dayW}
                windowStart={windowStart - 120}
                windowEnd={windowEnd + 120}
                viewStartMinute={viewStartMinute}
                isFocusRow={vr.index === focusRow}
                focusMinute={focusMinute}
                nowMinute={nowMinute >= 0 && nowMinute <= totalMinutes ? nowMinute : null}
                rangeStart={range.start}
                dayCount={range.days.length}
                focusLabel={formatDateTime(addMinutes(range.start, focusMinute), timeZone, locale)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TimelineRowViewProps {
  row: TimelineRow;
  index: number;
  top: number;
  height: number;
  headerW: number;
  trackW: number;
  colPx: number;
  dayW: number;
  windowStart: number;
  windowEnd: number;
  viewStartMinute: number;
  isFocusRow: boolean;
  focusMinute: number;
  nowMinute: number | null;
  rangeStart: TZDate;
  dayCount: number;
  focusLabel: string;
}

function TimelineRowView({
  row, index, top, height, headerW, trackW, colPx, dayW, windowStart, windowEnd, viewStartMinute, isFocusRow, focusMinute, nowMinute,
  rangeStart, dayCount, focusLabel,
}: TimelineRowViewProps) {
  const cal = useCalendar();
  const px = cal.timelinePxPerMinute;
  const slot = cal.timelineSlotMinutes;
  const resourceIds = row.resource ? [row.resource.id] : undefined;
  const rowBlocks = useMemo(
    () =>
      blocksFor(cal.blockedRanges, resourceIds).flatMap((b) => {
        const s0 = Math.max(0, (b.start.getTime() - rangeStart.getTime()) / 60_000);
        const e0 = Math.min(dayCount * 1440, (b.end.getTime() - rangeStart.getTime()) / 60_000);
        return e0 > s0 ? [{ key: `${b.start.getTime()}:${b.resourceId ?? ''}`, label: b.label, s0, e0 }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cal.blockedRanges, row.resource, rangeStart, dayCount],
  );

  // Drag to create (pointer only; keyboard users press Enter on the focused column).
  const [selection, setSelection] = useState<{ anchor: number; current: number } | null>(null);
  const minuteAt = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    const offset = cal.direction === 'rtl' ? rect.right - clientX : clientX - rect.left;
    return Math.max(0, Math.min(dayCount * 1440 - slot, Math.floor(offset / px / slot) * slot));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch' || !cal.onSlotSelect) return;
    if ((e.target as HTMLElement).closest('[data-calendar-event],[data-calendar-ghost]')) return;
    const track = e.currentTarget;
    const anchor = minuteAt(track, e.clientX);
    let current = anchor;
    setSelection({ anchor, current });
    const onMove = (ev: globalThis.PointerEvent) => {
      const m = minuteAt(track, ev.clientX);
      if (m !== current) {
        current = m;
        setSelection({ anchor, current });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setSelection(null);
      if (current === anchor) return;
      const from = Math.min(anchor, current);
      const to = Math.max(anchor, current) + slot;
      cal.onSlotSelect?.({
        start: new Date(addMinutes(rangeStart, from).getTime()),
        end: new Date(addMinutes(rangeStart, to).getTime()),
        allDay: false,
        ...(row.resource ? { resourceId: row.resource.id } : {}),
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const dropData: DropData = {
    surface: 'timeline',
    day: rangeStart.getTime(),
    ...(row.resource ? { resourceId: row.resource.id } : {}),
  };
  const { setNodeRef, isOver } = useDroppable({ id: `tl:${row.id}`, data: dropData });
  const visible = row.items.filter((i) => i.endMinute >= windowStart && i.startMinute <= windowEnd);

  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      data-timeline-row=""
      className="absolute start-0 flex border-b"
      style={{ top, height, width: headerW + trackW }}
    >
      <div role="rowheader" className="sticky start-0 z-20 flex items-center gap-2 border-e bg-card px-3 text-sm" style={{ width: headerW }}>
        {row.resource && cal.renderResourceHeader ? (
          cal.renderResourceHeader({ resource: row.resource, view: cal.view })
        ) : (
          <span className="truncate font-medium">{row.title}</span>
        )}
      </div>
      <div
        ref={setNodeRef}
        role="gridcell"
        tabIndex={isFocusRow ? 0 : -1}
        aria-label={`${row.title}, ${cal.messages.eventCount(row.items.filter((i) => !isPreviewOccurrence(i.occurrence)).length)}. ${cal.messages.focusedTime(focusLabel)}`}
        onPointerDown={onPointerDown}
        data-timeline-track={index}
        data-over={isOver ? '' : undefined}
        className="group/track relative outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 data-[over]:bg-accent/60"
        style={{
          width: trackW,
          backgroundImage: `repeating-linear-gradient(to ${cal.direction === 'rtl' ? 'left' : 'right'}, transparent 0 ${colPx - 1}px, var(--border) ${colPx - 1}px ${colPx}px)`,
        }}
        onDoubleClick={(e) => {
          if (!cal.onSlotSelect || (e.target as HTMLElement).closest('[data-calendar-event]')) return;
          const minute = minuteAt(e.currentTarget, e.clientX);
          const start = addMinutes(rangeStart, minute);
          cal.onSlotSelect({
            start: new Date(start.getTime()),
            end: new Date(addMinutes(start, slot).getTime()),
            allDay: false,
            ...(row.resource ? { resourceId: row.resource.id } : {}),
          });
        }}
      >
        {cal.businessHours &&
          Array.from({ length: dayCount }, (_, i) => {
            const day = addDays(rangeStart, i);
            const bh = cal.businessHours!;
            const open = (bh.daysOfWeek ?? [1, 2, 3, 4, 5]).includes(day.getDay());
            const spans = open ? [[0, bh.startHour * 60], [bh.endHour * 60, 1440]] : [[0, 1440]];
            return spans.map(([a, b]) => (
              <div
                key={`${i}:${a}`}
                aria-hidden
                data-off-hours=""
                className="pointer-events-none absolute inset-y-0 bg-muted/60"
                style={{ insetInlineStart: (i * 1440 + a!) * px, width: (b! - a!) * px }}
              />
            ));
          })}
        {rowBlocks.map((b) => (
          <div
            key={b.key}
            aria-hidden
            data-calendar-blocked=""
            className="pointer-events-none absolute inset-y-0 overflow-hidden px-1 pt-0.5 text-[0.65rem] text-muted-foreground"
            style={{ insetInlineStart: b.s0 * px, width: (b.e0 - b.s0) * px, ...hatchStyle }}
          >
            {b.label}
          </div>
        ))}
        {selection && (
          <div
            aria-hidden
            data-selecting=""
            className="pointer-events-none absolute inset-y-1 rounded-md bg-calendar-event/25 ring-1 ring-calendar-event"
            style={{
              insetInlineStart: Math.min(selection.anchor, selection.current) * px,
              width: (Math.abs(selection.current - selection.anchor) + slot) * px,
            }}
          />
        )}
        {Array.from({ length: dayCount - 1 }, (_, i) => (
          <div key={i} aria-hidden className="absolute inset-y-0 w-px bg-foreground/15" style={{ insetInlineStart: (i + 1) * dayW }} />
        ))}
        {isFocusRow && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 hidden bg-ring/15 group-focus-visible/track:block"
            style={{ insetInlineStart: focusMinute * px, width: cal.timelineSlotMinutes * px }}
          />
        )}
        {visible.map((item) => {
          // Keep titles of long bars readable: clamp the drawn start to the visible edge.
          const clipped = item.startMinute < viewStartMinute && item.endMinute > viewStartMinute + 30;
          const drawStart = clipped ? viewStartMinute : item.startMinute;
          return (
          <EventCard
            key={item.occurrence.occurrenceId}
            occurrence={item.occurrence}
            segmentKey={`tl:${row.id}:${item.occurrence.occurrenceId}`}
            segmentDay={rangeStart.getTime()}
            surface="timeline"
            {...(row.resource ? { resourceId: row.resource.id } : {})}
            isStart={item.isStart && !clipped}
            isEnd={item.isEnd}
            density="compact"
            resizable
            resizeAxis="horizontal"
            tabbable={isFocusRow}
            className="absolute z-10"
            style={{
              insetInlineStart: drawStart * px + 1,
              width: Math.max((item.endMinute - drawStart) * px - 2, 12),
              top: ROW_PAD_PX + item.lane * LANE_PX,
              height: LANE_PX - 4,
            }}
          />
          );
        })}
        {nowMinute !== null && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-calendar-now" style={{ insetInlineStart: nowMinute * px }} />
        )}
      </div>
    </div>
  );
}
