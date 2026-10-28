import { TZDate } from '@date-fns/tz';
import { describe, expect, it } from 'vitest';
import { getMonthGridRange, getWeekRange, lastTouchedDay, parseIsoDay, toIsoDay } from '../lib/dates';
import { resolveDrop, type DragData } from '../lib/dnd';
import { layoutSpanLanes, layoutTimedItems } from '../lib/layout';
import { buildEventChange, optimisticReducer } from '../lib/optimistic';
import { expandEvent } from '../lib/recurrence';
import { buildSpanSegments, buildTimedSegments } from '../lib/segments';
import type { CalendarEvent, EventOccurrence } from '../types';

const NY = 'America/New_York';
const occ = (e: CalendarEvent): EventOccurrence => ({
  ...e,
  occurrenceId: e.id,
  seriesId: e.id,
  isRecurring: false,
  originalStart: e.start,
});

describe('layoutTimedItems', () => {
  it('places non-overlapping items in a single column', () => {
    const r = layoutTimedItems([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 60, end: 120 },
    ]);
    expect(r.get('a')).toEqual({ column: 0, columns: 1, span: 1 });
    expect(r.get('b')).toEqual({ column: 0, columns: 1, span: 1 });
  });

  it('splits overlapping items into columns and expands where free', () => {
    const r = layoutTimedItems([
      { id: 'a', start: 0, end: 120 },
      { id: 'b', start: 30, end: 60 },
      { id: 'c', start: 30, end: 90 },
      { id: 'd', start: 70, end: 100 },
    ]);
    expect(r.get('a')).toMatchObject({ column: 0, columns: 3 });
    expect(r.get('c')!.column).not.toBe(r.get('b')!.column);
    // d reuses b's column after b ends and can expand into nothing else (c still running).
    expect(r.get('d')).toMatchObject({ column: r.get('b')!.column, columns: 3 });
  });
});

describe('layoutSpanLanes', () => {
  it('stacks overlapping spans and reuses free lanes', () => {
    const lanes = layoutSpanLanes([
      { id: 'long', startCol: 0, endCol: 4 },
      { id: 'mon', startCol: 0, endCol: 0 },
      { id: 'tue', startCol: 1, endCol: 1 },
      { id: 'sat', startCol: 5, endCol: 6 },
    ]);
    expect(lanes.get('long')).toBe(0);
    expect(lanes.get('mon')).toBe(1);
    expect(lanes.get('tue')).toBe(1);
    expect(lanes.get('sat')).toBe(0);
  });
});

describe('date ranges', () => {
  it('month grid always has 42 days starting on weekStartsOn', () => {
    const r = getMonthGridRange(new TZDate(2026, 1, 10, 'UTC'), 1);
    expect(r.days).toHaveLength(42);
    expect(r.days[0]!.getDay()).toBe(1);
    expect(toIsoDay(r.days[0]!)).toBe('2026-01-26');
  });

  it('work week excludes weekends', () => {
    const r = getWeekRange(new TZDate(2026, 9, 28, 'UTC'), 0, 'work-week');
    expect(r.days.map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses ISO days in the target zone', () => {
    const d = parseIsoDay('2026-10-28', 'Asia/Tokyo')!;
    expect(d.getTime()).toBe(Date.parse('2026-10-27T15:00:00.000Z'));
    expect(parseIsoDay('nope', 'UTC')).toBeNull();
  });

  it('timed events ending at midnight do not touch the next day', () => {
    const s = new TZDate(2026, 9, 28, 22, 'UTC');
    const e = new TZDate(2026, 9, 29, 0, 'UTC');
    expect(toIsoDay(lastTouchedDay(s, e))).toBe('2026-10-28');
  });
});

describe('recurrence', () => {
  it('keeps wall-clock time across DST transitions (RFC 5545)', () => {
    const event: CalendarEvent = {
      id: 'weekly',
      title: 'Weekly',
      start: new TZDate(2026, 9, 26, 9, 0, NY), // Mon Oct 26, EDT
      end: new TZDate(2026, 9, 26, 10, 0, NY),
      rrule: 'RRULE:FREQ=WEEKLY;COUNT=3',
      timeZone: NY,
    };
    const out = expandEvent(event, new Date('2026-10-01'), new Date('2026-12-01'), 'UTC');
    expect(out).toHaveLength(3);
    for (const o of out) {
      const local = new TZDate(o.start.getTime(), NY);
      expect(local.getHours()).toBe(9);
      expect(o.end.getTime() - o.start.getTime()).toBe(3_600_000);
    }
    // UTC offsets differ before/after Nov 1 (EDT → EST).
    expect(out[0]!.start.toISOString()).toBe('2026-10-26T13:00:00.000Z');
    expect(out[1]!.start.toISOString()).toBe('2026-11-02T14:00:00.000Z');
    expect(out[0]!.occurrenceId).toBe('weekly::2026-10-26T13:00:00.000Z');
  });

  it('honours EXDATE and the visible range', () => {
    const start = new Date('2026-10-01T09:00:00Z');
    const event: CalendarEvent = {
      id: 'd',
      title: 'Daily',
      start,
      end: new Date('2026-10-01T09:30:00Z'),
      rrule: 'FREQ=DAILY',
      exdates: [new Date('2026-10-03T09:00:00Z')],
      timeZone: 'UTC',
    };
    const out = expandEvent(event, new Date('2026-10-02T00:00:00Z'), new Date('2026-10-05T00:00:00Z'), 'UTC');
    expect(out.map((o) => o.start.toISOString().slice(0, 10))).toEqual(['2026-10-02', '2026-10-04']);
  });

  it('returns no occurrences for an invalid rule instead of throwing', () => {
    const event: CalendarEvent = { id: 'x', title: 'x', start: new Date(), end: new Date(), rrule: 'FREQ=NOPE' };
    expect(() => expandEvent(event, new Date(0), new Date(), 'UTC')).not.toThrow();
  });
});

describe('segments', () => {
  const days = Array.from({ length: 7 }, (_, i) => new TZDate(2026, 9, 26 + i, 'UTC'));

  it('clips multi-day events to the row and flags continuation', () => {
    const e = occ({ id: 'm', title: 'm', allDay: true, start: new Date('2026-10-24T00:00Z'), end: new Date('2026-10-28T00:00Z') });
    const [seg] = buildSpanSegments([e], days, 'UTC');
    expect(seg).toMatchObject({ startCol: 0, endCol: 1, isStart: false, isEnd: true });
  });

  it('splits timed events crossing midnight into per-day pieces', () => {
    const e = occ({ id: 't', title: 't', start: new Date('2026-10-26T22:00Z'), end: new Date('2026-10-27T02:00Z') });
    const [a] = buildTimedSegments([e], days[0]!, 'UTC');
    const [b] = buildTimedSegments([e], days[1]!, 'UTC');
    expect(a).toMatchObject({ startMinute: 1320, endMinute: 1440, isStart: true, isEnd: false });
    expect(b).toMatchObject({ startMinute: 0, endMinute: 120, isStart: false, isEnd: true });
  });
});

describe('resolveDrop', () => {
  const base = occ({ id: 'e', title: 'E', start: new Date('2026-10-26T09:00Z'), end: new Date('2026-10-26T10:00Z') });
  const opts = { timeZone: 'UTC', slotDuration: 30, pxPerMinute: 1.2 };
  const drag = (over: Partial<DragData> = {}): DragData => ({
    kind: 'move',
    occurrence: base,
    segmentDay: Date.parse('2026-10-26T00:00Z'),
    surface: 'time-grid',
    ...over,
  });

  it('moves by day (from drop target) and snapped minutes (from delta)', () => {
    const r = resolveDrop(drag(), { surface: 'time-grid', day: Date.parse('2026-10-28T00:00Z') }, 40, opts)!;
    expect(r.start.toISOString()).toBe('2026-10-28T09:30:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-28T10:30:00.000Z');
  });

  it('ignores vertical delta in the month grid', () => {
    const r = resolveDrop(drag({ surface: 'month' }), { surface: 'month', day: Date.parse('2026-10-27T00:00Z') }, 300, opts)!;
    expect(r.start.toISOString()).toBe('2026-10-27T09:00:00.000Z');
  });

  it('returns null for a no-op drop', () => {
    expect(resolveDrop(drag(), { surface: 'time-grid', day: Date.parse('2026-10-26T00:00Z') }, 5, opts)).toBeNull();
  });

  it('resizes with a one-slot minimum', () => {
    const r = resolveDrop(drag({ kind: 'resize' }), { surface: 'time-grid', day: 0 }, -500, opts)!;
    expect(r.end.toISOString()).toBe('2026-10-26T09:30:00.000Z');
  });

  it('reassigns resources when dropped on another resource column', () => {
    const r = resolveDrop(
      drag({ occurrence: { ...base, resourceIds: ['a', 'x'] }, resourceId: 'a' }),
      { surface: 'time-grid', day: Date.parse('2026-10-26T00:00Z'), resourceId: 'b' },
      0,
      opts,
    )!;
    expect(r.resourceIds).toEqual(['x', 'b']);
  });
});

describe('optimistic reducer', () => {
  it('shifts a whole recurring series by the occurrence delta and marks it pending', () => {
    const series: CalendarEvent = {
      id: 's',
      title: 'S',
      start: new Date('2026-10-01T09:00Z'),
      end: new Date('2026-10-01T10:00Z'),
      rrule: 'FREQ=DAILY',
    };
    const o: EventOccurrence = {
      ...series,
      start: new Date('2026-10-05T09:00Z'),
      end: new Date('2026-10-05T10:00Z'),
      occurrenceId: 's::x',
      seriesId: 's',
      isRecurring: true,
      originalStart: new Date('2026-10-05T09:00Z'),
    };
    const change = buildEventChange('move', series, o, new Date('2026-10-05T11:00Z'), new Date('2026-10-05T12:00Z'));
    const next = optimisticReducer({ events: [series], pendingIds: new Set() }, { kind: 'change', change });
    expect(next.events[0]!.start.toISOString()).toBe('2026-10-01T11:00:00.000Z');
    expect(next.pendingIds.has('s')).toBe(true);
  });
});
