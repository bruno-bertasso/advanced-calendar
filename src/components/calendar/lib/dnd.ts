import { TZDate } from '@date-fns/tz';
import { addDays, addMinutes, startOfDay } from 'date-fns';
import type { EventOccurrence } from '../types';
import { dayDiff, lastTouchedDay } from './dates';

export type DragSurface = 'month' | 'time-grid' | 'all-day' | 'timeline';

/** Data attached to draggable event cards / resize handles. */
export interface DragData {
  kind: 'move' | 'resize';
  occurrence: EventOccurrence;
  /** Midnight (ms) of the day column/cell the grabbed segment is rendered in. */
  segmentDay: number;
  surface: DragSurface;
  resourceId?: string;
}

/** Data attached to drop targets. */
export interface DropData {
  surface: DragSurface;
  /** Midnight (ms) of the target day (timeline rows: start of the visible range). */
  day: number;
  resourceId?: string;
}

export interface DropResult {
  start: Date;
  end: Date;
  resourceIds?: string[];
}

export interface ResolveOptions {
  timeZone: string;
  slotDuration: number;
  /** Vertical scale of the time grid. */
  pxPerMinute: number;
  /** Horizontal scale of the timeline. */
  timelinePxPerMinute?: number;
}

function reassignResources(drag: DragData, drop: DropData): string[] | undefined {
  if (!drop.resourceId || drop.resourceId === drag.resourceId) return undefined;
  // Only surfaces with resource lanes (resource columns / timeline rows) reassign.
  if (!drag.resourceId && drag.surface !== 'timeline') return undefined;
  const current = drag.occurrence.resourceIds ?? [];
  return [...current.filter((id) => id !== drag.resourceId && id !== drop.resourceId), drop.resourceId];
}

const toDate = (d: Date) => new Date(d.getTime());

/**
 * Translate a drag gesture into new occurrence times.
 * - Time grid: day offset from the hovered target, minutes from vertical delta (snapped).
 * - Month / all-day: day offset from the hovered target; resize changes the last day.
 * - Timeline: minutes from horizontal delta (snapped), resource from the hovered row.
 * Day shifts use zoned `addDays` so wall-clock time is preserved across DST.
 */
export function resolveDrop(
  drag: DragData,
  drop: DropData,
  delta: number | { x: number; y: number },
  opts: ResolveOptions,
): DropResult | null {
  const d = typeof delta === 'number' ? { x: 0, y: delta } : delta;
  const occ = drag.occurrence;
  const start = new TZDate(occ.start.getTime(), opts.timeZone);
  const end = new TZDate(occ.end.getTime(), opts.timeZone);
  const snap = (px: number, scale: number) => Math.round(px / scale / opts.slotDuration) * opts.slotDuration;

  // ---- Timeline (horizontal time axis) ----------------------------------------------------
  if (drag.surface === 'timeline') {
    if (drop.surface !== 'timeline') return null;
    const minutes = snap(d.x, opts.timelinePxPerMinute ?? 1);
    if (drag.kind === 'resize') {
      let nextEnd = addMinutes(end, minutes);
      const minEnd = addMinutes(start, opts.slotDuration);
      if (nextEnd.getTime() < minEnd.getTime()) nextEnd = minEnd;
      return nextEnd.getTime() === end.getTime() ? null : { start: toDate(start), end: toDate(nextEnd) };
    }
    const resourceIds = reassignResources(drag, drop);
    if (minutes === 0 && !resourceIds) return null;
    return {
      start: toDate(addMinutes(start, minutes)),
      end: toDate(addMinutes(end, minutes)),
      ...(resourceIds ? { resourceIds } : {}),
    };
  }

  // ---- Resize -------------------------------------------------------------------------------
  if (drag.kind === 'resize') {
    if (drag.surface === 'time-grid') {
      const minEnd = addMinutes(start, opts.slotDuration);
      let nextEnd = addMinutes(end, snap(d.y, opts.pxPerMinute));
      if (nextEnd.getTime() < minEnd.getTime()) nextEnd = minEnd;
      return nextEnd.getTime() === end.getTime() ? null : { start: toDate(start), end: toDate(nextEnd) };
    }
    // Month / all-day: move the last touched day onto the hovered day.
    const days = dayDiff(new TZDate(drop.day, opts.timeZone), lastTouchedDay(start, end));
    if (days === 0) return null;
    let nextEnd = addDays(end, days);
    const minEnd = occ.allDay ? addDays(startOfDay(start), 1) : new TZDate(start.getTime() + 15 * 60_000, opts.timeZone);
    if (nextEnd.getTime() < minEnd.getTime()) nextEnd = minEnd as TZDate;
    if (nextEnd.getTime() === end.getTime()) return null;
    return { start: toDate(start), end: toDate(nextEnd) };
  }

  // ---- Move ---------------------------------------------------------------------------------
  const minutes = drag.surface === 'time-grid' && drop.surface === 'time-grid' ? snap(d.y, opts.pxPerMinute) : 0;
  const days = dayDiff(new TZDate(drop.day, opts.timeZone), new TZDate(drag.segmentDay, opts.timeZone));
  const resourceIds = reassignResources(drag, drop);
  if (days === 0 && minutes === 0 && !resourceIds) return null;

  return {
    start: toDate(addMinutes(addDays(start, days), minutes)),
    end: toDate(addMinutes(addDays(end, days), minutes)),
    ...(resourceIds ? { resourceIds } : {}),
  };
}
