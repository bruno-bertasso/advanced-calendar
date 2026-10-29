import { describe, expect, it } from 'vitest';
import { expandEvent, expandEvents } from '../lib/recurrence';
import { buildScopedChange, remainingRule, truncateRule } from '../lib/recurrence-edit';
import { isBusinessTime, isRangeBlocked } from '../lib/availability';
import { optimisticReducer } from '../lib/optimistic';
import { enMessages, ptBRMessages, resolveMessages } from '../messages';
import type { CalendarEvent } from '../types';
import { overlapStyle } from '../views/week-view';

const TZ = 'UTC';
const series: CalendarEvent = {
  id: 's',
  title: 'Daily',
  start: new Date('2026-10-26T09:00Z'),
  end: new Date('2026-10-26T10:00Z'),
  rrule: 'FREQ=DAILY;COUNT=10',
  timeZone: TZ,
};
const range = [new Date('2026-10-01T00:00Z'), new Date('2026-12-01T00:00Z')] as const;
const occurrences = () => expandEvent(series, range[0], range[1], TZ);
const third = () => occurrences()[2]!; // Oct 28

const move = (scope: 'this' | 'following' | 'all', hours = 2) =>
  buildScopedChange({
    type: 'move',
    series,
    occurrence: third(),
    start: new Date(third().start.getTime() + hours * 3_600_000),
    end: new Date(third().end.getTime() + hours * 3_600_000),
    scope,
    defaultTimeZone: TZ,
  });

/** Apply a change the way a backend would and expand the result. */
const apply = (change: ReturnType<typeof move>) => {
  const next = optimisticReducer({ events: [series], pendingIds: new Set() }, { kind: 'change', change }).events;
  return expandEvents(next, range[0], range[1], TZ).map((o) => o.start.toISOString().slice(5, 16));
};

describe('recurrence edit scopes', () => {
  it('"this" adds an EXDATE and creates a standalone exception', () => {
    const change = move('this');
    expect(change.nextEvent.exdates?.map((d) => d.toISOString())).toEqual(['2026-10-28T09:00:00.000Z']);
    expect(change.created).toHaveLength(1);
    expect(change.created![0]).toMatchObject({ rrule: undefined, recurringEventId: 's', title: 'Daily' });
    const starts = apply(change);
    expect(starts).toHaveLength(10);
    expect(starts).toContain('10-28T11:00');
    expect(starts).not.toContain('10-28T09:00');
    expect(starts).toContain('10-29T09:00');
  });

  it('"following" truncates the series with UNTIL and splits off the rest (keeping COUNT)', () => {
    const change = move('following');
    expect(change.nextEvent.rrule).toMatch(/UNTIL=20261028T085959Z/);
    expect(change.nextEvent.rrule).not.toMatch(/COUNT/);
    expect(change.created![0]!.rrule).toBe('FREQ=DAILY;COUNT=8');
    const starts = apply(change);
    expect(starts.slice(0, 3)).toEqual(['10-26T09:00', '10-27T09:00', '10-28T11:00']);
    expect(starts).toHaveLength(10);
    expect(starts.at(-1)).toBe('11-04T11:00');
  });

  it('"following" on the first occurrence behaves like "all"', () => {
    const first = occurrences()[0]!;
    const change = buildScopedChange({
      type: 'move', series, occurrence: first, scope: 'following', defaultTimeZone: TZ,
      start: new Date(first.start.getTime() + 3_600_000), end: new Date(first.end.getTime() + 3_600_000),
    });
    expect(change.scope).toBe('all');
    expect(change.created).toBeUndefined();
  });

  it('"all" shifts the series and its EXDATEs together', () => {
    const withEx = { ...series, exdates: [new Date('2026-10-30T09:00Z')] };
    const occ = expandEvent(withEx, range[0], range[1], TZ)[2]!;
    const change = buildScopedChange({
      type: 'move', series: withEx, occurrence: occ, scope: 'all', defaultTimeZone: TZ,
      start: new Date(occ.start.getTime() + 3_600_000), end: new Date(occ.end.getTime() + 3_600_000),
    });
    expect(change.nextEvent.exdates![0]!.toISOString()).toBe('2026-10-30T10:00:00.000Z');
    const starts = expandEvents([change.nextEvent], range[0], range[1], TZ).map((o) => o.start.toISOString());
    expect(starts).not.toContain('2026-10-30T10:00:00.000Z');
    expect(starts).toHaveLength(9);
  });

  it('delete "this" / "following" only touch the series rule', () => {
    const del = (scope: 'this' | 'following') =>
      buildScopedChange({ type: 'delete', series, occurrence: third(), start: third().start, end: third().end, scope, defaultTimeZone: TZ });
    expect(apply(del('this'))).toHaveLength(9);
    expect(apply(del('following'))).toEqual(['10-26T09:00', '10-27T09:00']);
    expect(del('this').created).toBeUndefined();
  });

  it('non-recurring events ignore the requested scope', () => {
    const single: CalendarEvent = { id: 'x', title: 'X', start: series.start, end: series.end };
    const [occ] = expandEvent(single, range[0], range[1], TZ);
    const change = buildScopedChange({ type: 'move', series: single, occurrence: occ!, scope: 'this', defaultTimeZone: TZ, start: series.start, end: series.end });
    expect(change.scope).toBe('all');
  });

  it('truncateRule / remainingRule helpers', () => {
    expect(truncateRule('RRULE:FREQ=WEEKLY;BYDAY=MO', TZ, new Date('2026-11-02T09:00Z'))).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261102T085959Z');
    expect(remainingRule({ ...series, rrule: 'FREQ=DAILY' }, new Date('2026-10-28T09:00Z'), TZ)).toBe('FREQ=DAILY');
  });
});

describe('expansion cache', () => {
  it('reuses results for unchanged event objects and range', () => {
    const a = expandEvents([series], range[0], range[1], TZ);
    const b = expandEvents([series], range[0], range[1], TZ);
    expect(b[0]).toBe(a[0]);
    const c = expandEvents([{ ...series }], range[0], range[1], TZ);
    expect(c[0]).not.toBe(a[0]);
  });
});

describe('availability', () => {
  const blocked = [
    { start: new Date('2026-10-28T12:00Z'), end: new Date('2026-10-28T13:00Z'), resourceId: 'room' },
    { start: new Date('2026-10-31T00:00Z'), end: new Date('2026-11-01T00:00Z') },
  ];
  it('matches global blocks for everyone and resource blocks only for that resource', () => {
    expect(isRangeBlocked(blocked, new Date('2026-10-28T12:30Z'), new Date('2026-10-28T14:00Z'), ['room'])).toBe(true);
    expect(isRangeBlocked(blocked, new Date('2026-10-28T12:30Z'), new Date('2026-10-28T14:00Z'), ['other'])).toBe(false);
    expect(isRangeBlocked(blocked, new Date('2026-10-31T10:00Z'), new Date('2026-10-31T11:00Z'))).toBe(true);
    expect(isRangeBlocked(blocked, new Date('2026-10-28T13:00Z'), new Date('2026-10-28T14:00Z'), ['room'])).toBe(false);
  });
  it('business hours default to Mon–Fri', () => {
    const wed = new Date('2026-10-28T00:00Z');
    const sat = new Date('2026-10-31T00:00Z');
    const bh = { startHour: 9, endHour: 17 };
    expect(isBusinessTime(bh, wed, 9 * 60, 30)).toBe(true);
    expect(isBusinessTime(bh, wed, 8 * 60 + 30, 30)).toBe(false);
    expect(isBusinessTime(bh, sat, 10 * 60, 30)).toBe(false);
    expect(isBusinessTime(undefined, sat, 0, 30)).toBe(true);
  });
});

describe('overlapStyle', () => {
  it('splits width for up to two columns', () => {
    expect(overlapStyle({ column: 1, columns: 2, span: 1 })).toMatchObject({ insetInlineStart: 'calc(50% + 1px)', width: 'calc(50% - 3px)' });
  });
  it('cascades (wider, stacked) for three or more columns', () => {
    const first = overlapStyle({ column: 0, columns: 4, span: 1 });
    const last = overlapStyle({ column: 3, columns: 4, span: 1 });
    expect(first.width).toBe('calc(42.5% - 3px)');
    expect(last.width).toBe('calc(25% - 3px)');
    expect(Number(last.zIndex)).toBeGreaterThan(Number(first.zIndex));
  });
});

describe('messages', () => {
  it('merges partial overrides one level deep', () => {
    const m = resolveMessages({ today: 'Now', editor: { title: 'Name' } });
    expect(m.today).toBe('Now');
    expect(m.editor.title).toBe('Name');
    expect(m.editor.save).toBe(enMessages.editor.save);
  });
  it('ships a complete pt-BR preset', () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k]));
    expect(keys(ptBRMessages).sort()).toEqual(keys(enMessages).sort());
    expect(ptBRMessages.eventCount(2)).toBe('2 eventos');
  });
});

describe('optimistic reducer idempotency', () => {
  it('does not duplicate created events when rebased onto a base that already has them', () => {
    const change = buildScopedChange({
      type: 'move', series, occurrence: expandEvent(series, range[0], range[1], TZ)[2]!, scope: 'this', defaultTimeZone: TZ,
      start: new Date('2026-10-28T11:00Z'), end: new Date('2026-10-28T12:00Z'),
    });
    const persisted = [change.nextEvent, ...change.created!];
    const rebased = optimisticReducer({ events: persisted, pendingIds: new Set() }, { kind: 'change', change });
    expect(rebased.events.map((e) => e.id).sort()).toEqual(persisted.map((e) => e.id).sort());
  });
});
