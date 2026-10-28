import type { TZDate } from '@date-fns/tz';
import { addDays, startOfDay } from 'date-fns';
import type { EventOccurrence } from '../types';
import { dayDiff, inZone, isAllDayLike, lastTouchedDay } from './dates';
import { layoutSpanLanes, layoutTimedItems, type TimedPlacement } from './layout';

export interface SpanSegment {
  key: string;
  occurrence: EventOccurrence;
  startCol: number;
  endCol: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
}

/**
 * Clip occurrences to a row of consecutive days (a month week or the all-day lane) and
 * assign lanes. `days` must be consecutive calendar days in the display zone.
 */
export function buildSpanSegments(
  occurrences: readonly EventOccurrence[],
  days: readonly TZDate[],
  timeZone: string,
): SpanSegment[] {
  if (days.length === 0) return [];
  const rowStart = days[0]!;
  const lastCol = days.length - 1;
  const raw: Omit<SpanSegment, 'lane'>[] = [];

  for (const occ of occurrences) {
    const s = startOfDay(inZone(occ.start, timeZone));
    const e = lastTouchedDay(inZone(occ.start, timeZone), inZone(occ.end, timeZone));
    const startIdx = dayDiff(s, rowStart);
    const endIdx = dayDiff(e, rowStart);
    if (endIdx < 0 || startIdx > lastCol) continue;
    raw.push({
      key: `${occ.occurrenceId}@${rowStart.getTime()}`,
      occurrence: occ,
      startCol: Math.max(0, startIdx),
      endCol: Math.min(lastCol, endIdx),
      isStart: startIdx >= 0,
      isEnd: endIdx <= lastCol,
    });
  }

  const lanes = layoutSpanLanes(raw.map((r) => ({ id: r.key, startCol: r.startCol, endCol: r.endCol })));
  return raw.map((r) => ({ ...r, lane: lanes.get(r.key) ?? 0 }));
}

export interface TimedSegment {
  key: string;
  occurrence: EventOccurrence;
  /** Day this segment belongs to (display zone midnight). */
  day: TZDate;
  /** Minutes from midnight. */
  startMinute: number;
  endMinute: number;
  placement: TimedPlacement;
  isStart: boolean;
  isEnd: boolean;
}

/** Split timed (non all-day) occurrences into per-day segments and compute overlap columns. */
export function buildTimedSegments(
  occurrences: readonly EventOccurrence[],
  day: TZDate,
  timeZone: string,
): TimedSegment[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  const pieces: Omit<TimedSegment, 'placement'>[] = [];

  for (const occ of occurrences) {
    if (isAllDayLike(occ)) continue;
    const s = occ.start.getTime();
    const e = Math.max(occ.end.getTime(), s);
    if (!(s < dayEnd && Math.max(e, s + 1) > dayStart)) continue;
    const clippedStart = Math.max(s, dayStart);
    const clippedEnd = Math.min(e, dayEnd);
    // Minutes are measured on the zoned wall clock so DST days stay aligned to labels.
    const zs = inZone(clippedStart, timeZone);
    const startMinute = zs.getHours() * 60 + zs.getMinutes();
    const endMinute =
      clippedEnd >= dayEnd
        ? 24 * 60
        : (() => {
            const ze = inZone(clippedEnd, timeZone);
            return ze.getHours() * 60 + ze.getMinutes();
          })();
    pieces.push({
      key: `${occ.occurrenceId}@${dayStart}`,
      occurrence: occ,
      day,
      startMinute,
      endMinute: Math.max(endMinute, startMinute),
      isStart: s >= dayStart,
      isEnd: e <= dayEnd,
    });
  }

  const placements = layoutTimedItems(
    pieces.map((p) => ({ id: p.key, start: p.startMinute, end: p.endMinute })),
  );
  return pieces.map((p) => ({ ...p, placement: placements.get(p.key) ?? { column: 0, columns: 1, span: 1 } }));
}
