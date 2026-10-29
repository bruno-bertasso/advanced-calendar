import { TZDate } from '@date-fns/tz';
import { describe, expect, it } from 'vitest';
import { repeatKeyFor } from '../lib/repeat';
import { getRangeForView, toIsoDay } from '../lib/dates';
import { resolveDrop, type DragData } from '../lib/dnd';
import { optimisticReducer } from '../lib/optimistic';
import type { CalendarEvent, EventOccurrence } from '../types';
import { buildAgendaRows } from '../views/agenda-view';
import { buildTimelineRows, UNASSIGNED_ROW_ID } from '../views/timeline-view';

const occ = (e: CalendarEvent): EventOccurrence => ({ ...e, occurrenceId: e.id, seriesId: e.id, isRecurring: false, originalStart: e.start });
const cursor = new TZDate(2026, 9, 28, 'UTC'); // Wed

describe('ranges for the new views', () => {
  it('year covers Jan 1 – Dec 31', () => {
    const r = getRangeForView('year', cursor, 1);
    expect(toIsoDay(r.start)).toBe('2026-01-01');
    expect(r.days).toHaveLength(365);
    expect(toIsoDay(r.end)).toBe('2027-01-01');
  });
  it('agenda covers agendaDays from the cursor', () => {
    const r = getRangeForView('agenda', cursor, 1, { agendaDays: 14 });
    expect(toIsoDay(r.start)).toBe('2026-10-28');
    expect(r.days).toHaveLength(14);
  });
  it('timeline is a week, collapsing to a day when narrow', () => {
    expect(getRangeForView('timeline', cursor, 1).days).toHaveLength(7);
    expect(getRangeForView('timeline', cursor, 1, { narrow: true }).days).toHaveLength(1);
  });
});

describe('resolveDrop (new surfaces)', () => {
  const opts = { timeZone: 'UTC', slotDuration: 30, pxPerMinute: 1.2, timelinePxPerMinute: 64 / 60 };
  const allDay = occ({ id: 'a', title: 'A', allDay: true, start: new Date('2026-10-28T00:00Z'), end: new Date('2026-10-30T00:00Z') });
  const timed = occ({ id: 't', title: 'T', start: new Date('2026-10-28T09:00Z'), end: new Date('2026-10-28T10:00Z'), resourceIds: ['r1'] });
  const drag = (o: EventOccurrence, over: Partial<DragData>): DragData => ({
    kind: 'move', occurrence: o, segmentDay: Date.parse('2026-10-28T00:00Z'), surface: 'month', ...over,
  });

  it('month resize moves the last day onto the hovered cell', () => {
    const r = resolveDrop(drag(allDay, { kind: 'resize' }), { surface: 'month', day: Date.parse('2026-10-31T00:00Z') }, 0, opts)!;
    expect(r.end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(r.start.toISOString()).toBe('2026-10-28T00:00:00.000Z');
  });
  it('month resize never shrinks an all-day event below one day', () => {
    const r = resolveDrop(drag(allDay, { kind: 'resize' }), { surface: 'month', day: Date.parse('2026-10-20T00:00Z') }, 0, opts)!;
    expect(r.end.toISOString()).toBe('2026-10-29T00:00:00.000Z');
  });
  it('timeline move snaps horizontal delta and reassigns the row resource', () => {
    const r = resolveDrop(
      drag(timed, { surface: 'timeline', resourceId: 'r1' }),
      { surface: 'timeline', day: 0, resourceId: 'r2' },
      { x: 64, y: 40 },
      opts,
    )!;
    expect(r.start.toISOString()).toBe('2026-10-28T10:00:00.000Z');
    expect(r.resourceIds).toEqual(['r2']);
  });
  it('timeline drop from the unassigned row assigns the resource', () => {
    const r = resolveDrop(
      drag({ ...timed, resourceIds: [] }, { surface: 'timeline' }),
      { surface: 'timeline', day: 0, resourceId: 'r2' },
      { x: 0, y: 0 },
      opts,
    )!;
    expect(r.resourceIds).toEqual(['r2']);
  });
  it('timeline resize extends the end with a one-slot minimum', () => {
    const grow = resolveDrop(drag(timed, { surface: 'timeline', kind: 'resize' }), { surface: 'timeline', day: 0 }, { x: 32, y: 0 }, opts)!;
    expect(grow.end.toISOString()).toBe('2026-10-28T10:30:00.000Z');
    const shrink = resolveDrop(drag(timed, { surface: 'timeline', kind: 'resize' }), { surface: 'timeline', day: 0 }, { x: -999, y: 0 }, opts)!;
    expect(shrink.end.toISOString()).toBe('2026-10-28T09:30:00.000Z');
  });
});

describe('optimistic create / delete', () => {
  const e: CalendarEvent = { id: 'n', title: 'N', start: new Date(0), end: new Date(1) };
  it('adds created events as pending and removes deleted ones', () => {
    const created = optimisticReducer({ events: [], pendingIds: new Set() }, { kind: 'create', event: e });
    expect(created.events).toEqual([e]);
    expect(created.pendingIds.has('n')).toBe(true);
    expect(optimisticReducer(created, { kind: 'delete', event: e }).events).toEqual([]);
  });
});

describe('buildAgendaRows', () => {
  it('groups by day, lists all-day first, and repeats multi-day events', () => {
    const days = [new TZDate(2026, 9, 28, 'UTC'), new TZDate(2026, 9, 29, 'UTC'), new TZDate(2026, 9, 30, 'UTC')];
    const rows = buildAgendaRows(
      [
        occ({ id: 'late', title: 'late', start: new Date('2026-10-28T15:00Z'), end: new Date('2026-10-28T16:00Z') }),
        occ({ id: 'multi', title: 'multi', allDay: true, start: new Date('2026-10-28T00:00Z'), end: new Date('2026-10-30T00:00Z') }),
      ],
      days,
    );
    expect(rows.map((r) => (r.type === 'day' ? `#${toIsoDay(r.day)}` : r.occurrence.id))).toEqual([
      '#2026-10-28', 'multi', 'late', '#2026-10-29', 'multi',
    ]);
  });
});

describe('buildTimelineRows', () => {
  const start = new Date('2026-10-26T00:00Z');
  const end = new Date('2026-11-02T00:00Z');
  it('creates one row per resource plus an unassigned row, with overlap lanes', () => {
    const rows = buildTimelineRows(
      [
        occ({ id: 'a', title: 'a', start: new Date('2026-10-26T09:00Z'), end: new Date('2026-10-26T11:00Z'), resourceIds: ['r1'] }),
        occ({ id: 'b', title: 'b', start: new Date('2026-10-26T10:00Z'), end: new Date('2026-10-26T12:00Z'), resourceIds: ['r1'] }),
        occ({ id: 'c', title: 'c', start: new Date('2026-10-26T11:00Z'), end: new Date('2026-10-26T12:00Z'), resourceIds: ['r1'] }),
        occ({ id: 'u', title: 'u', start: new Date('2026-10-27T00:00Z'), end: new Date('2026-10-27T01:00Z') }),
      ],
      [{ id: 'r1', title: 'R1' }, { id: 'r2', title: 'R2' }],
      start,
      end,
    );
    expect(rows.map((r) => r.id)).toEqual(['r1', 'r2', UNASSIGNED_ROW_ID]);
    const r1 = rows[0]!;
    expect(r1.lanes).toBe(2);
    expect(r1.items.find((i) => i.occurrence.id === 'a')).toMatchObject({ startMinute: 540, endMinute: 660, lane: 0 });
    expect(r1.items.find((i) => i.occurrence.id === 'c')!.lane).toBe(0); // reuses lane after "a" ends
    expect(rows[2]!.items[0]!.startMinute).toBe(1440);
  });
});

describe('repeatKeyFor', () => {
  it('maps presets and flags custom rules', () => {
    expect(repeatKeyFor(undefined)).toBe('none');
    expect(repeatKeyFor('RRULE:FREQ=WEEKLY')).toBe('weekly');
    expect(repeatKeyFor('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('weekdays');
    expect(repeatKeyFor('FREQ=WEEKLY;INTERVAL=2;COUNT=6')).toBe('custom');
  });
});
