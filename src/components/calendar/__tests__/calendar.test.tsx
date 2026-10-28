import { TZDate } from '@date-fns/tz';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Calendar, CalendarBody, CalendarHeader, type CalendarEvent, type CalendarProps } from '../index';

const TZ = 'UTC';
const DATE = new TZDate(2026, 9, 28, TZ); // Wed Oct 28 2026

const events: CalendarEvent[] = [
  { id: 'a', title: 'Design review', start: new Date('2026-10-28T10:00Z'), end: new Date('2026-10-28T11:00Z') },
  { id: 'b', title: 'Offsite', allDay: true, start: new Date('2026-10-29T00:00Z'), end: new Date('2026-10-31T00:00Z') },
  {
    id: 'r',
    title: 'Stand-up',
    start: new Date('2026-10-26T09:00Z'),
    end: new Date('2026-10-26T09:15Z'),
    rrule: 'FREQ=DAILY;COUNT=3',
  },
];

function renderCalendar(props: Partial<CalendarProps> = {}) {
  return render(
    <Calendar events={events} timeZone={TZ} defaultDate={DATE} views={['month', 'week', 'day']} {...props}>
      <CalendarHeader />
      <CalendarBody />
    </Calendar>,
  );
}

describe('<Calendar> month view', () => {
  it('renders a 6×7 ARIA grid with weekday column headers', () => {
    renderCalendar({ defaultView: 'month' });
    const grid = screen.getByRole('grid', { name: 'October 2026' });
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(7);
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(42);
    expect(within(grid).getAllByRole('row')).toHaveLength(7);
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
  });

  it('marks the selected day as the only tab stop', () => {
    renderCalendar({ defaultView: 'month' });
    const cells = screen.getAllByRole('gridcell');
    const tabbable = cells.filter((c) => c.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabbable[0]).toHaveAccessibleName(/Wednesday, October 28, 2026/);
  });

  it('renders expanded recurring occurrences and multi-day events', () => {
    renderCalendar({ defaultView: 'month' });
    expect(screen.getAllByRole('button', { name: /Stand-up/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Offsite/ })).toBeInTheDocument();
  });

  it('moves focus with arrow keys and navigates months with PageDown', async () => {
    const user = userEvent.setup();
    const onDateChange = vi.fn();
    renderCalendar({ defaultView: 'month', onDateChange });
    const cell = screen.getAllByRole('gridcell').find((c) => c.tabIndex === 0)!;
    act(() => cell.focus());

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-10-29');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-11-05');
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    await user.keyboard('{PageDown}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-12-05');
    expect(onDateChange).toHaveBeenCalledTimes(3);
  });

  it('supports the renderCell slot', () => {
    renderCalendar({
      defaultView: 'month',
      renderCell: ({ date, defaultContent, events: dayEvents }) => (
        <>
          {defaultContent}
          {date.getMonth() === 9 && date.getDate() === 28 && <span data-testid="badge">{dayEvents.length}</span>}
        </>
      ),
    });
    // Design review + the third Stand-up occurrence
    expect(screen.getByTestId('badge').textContent).toBe('2');
  });

  it('collapses overflow into a "+N more" popover', async () => {
    const many: CalendarEvent[] = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      title: `Busy ${i}`,
      start: new Date(`2026-10-28T0${i}:00Z`),
      end: new Date(`2026-10-28T0${i}:30Z`),
    }));
    const user = userEvent.setup();
    renderCalendar({ defaultView: 'month', events: many, maxEventsPerCell: 3 });
    const more = screen.getByRole('button', { name: /Show 2 more events/ });
    await user.click(more);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('button', { name: /Busy/ })).toHaveLength(5);
  });

  it('switches views via the header tabs', async () => {
    const user = userEvent.setup();
    renderCalendar({ defaultView: 'month' });
    await user.click(screen.getByRole('tab', { name: 'Week' }));
    expect(screen.getByRole('heading', { name: /Oct 25\W+31, 2026/ })).toBeInTheDocument();
  });
});

describe('<Calendar> week view', () => {
  it('renders a time grid with day headers, all-day lane and slot rows', () => {
    renderCalendar({ defaultView: 'week' });
    const grid = screen.getByRole('grid');
    expect(within(grid).getByRole('columnheader', { name: /Wednesday, October 28, 2026/ })).toBeInTheDocument();
    expect(within(grid).getByRole('rowheader', { name: 'All day' })).toBeInTheDocument();
    // 48 half-hour slots × 7 days + 7 all-day cells
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(48 * 7 + 7);
  });

  it('places a timed event inside its starting slot cell', () => {
    renderCalendar({ defaultView: 'week' });
    const btn = screen.getByRole('button', { name: /Design review/ });
    const cell = btn.closest('[role="gridcell"]')!;
    expect(cell).toHaveAccessibleName(/Wednesday, October 28, 2026, 10:00 AM/);
  });

  it('passes a full EventRenderContext to renderEvent', () => {
    const renderEvent = vi.fn(({ event, timeLabel }) => (
      <span>
        custom:{event.title} {timeLabel}
      </span>
    ));
    renderCalendar({ defaultView: 'week', renderEvent });
    expect(screen.getByText(/custom:Design review/)).toBeInTheDocument();
    const ctx = renderEvent.mock.calls.find(([c]) => c.event.id === 'a')![0];
    expect(ctx).toMatchObject({ view: 'week', timeZone: TZ, isPending: false, isDragging: false, isStart: true, isEnd: true });
  });

  it('renders resource columns with the renderResourceHeader slot', () => {
    renderCalendar({
      defaultView: 'day',
      resources: [
        { id: 'x', title: 'Room X' },
        { id: 'y', title: 'Room Y' },
      ],
      visibleResourceIds: ['x', 'y'],
      renderResourceHeader: ({ resource }) => <b>res:{resource.title}</b>,
    });
    expect(screen.getByText('res:Room X')).toBeInTheDocument();
    expect(screen.getByText('res:Room Y')).toBeInTheDocument();
  });

  it('applies keyboard moves optimistically, then persists and announces', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onEventChange = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    renderCalendar({ defaultView: 'week', onEventChange });

    const btn = screen.getByRole('button', { name: /Design review/ });
    act(() => btn.focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(onEventChange).toHaveBeenCalledTimes(1);
    const change = (onEventChange.mock.calls[0] as unknown as [import('../types').EventChange])[0];
    expect(change.type).toBe('move');
    expect(change.nextEvent.start.toISOString()).toBe('2026-10-28T10:30:00.000Z');

    // Optimistic: label updates and is flagged as saving before the promise resolves.
    expect(await screen.findByRole('button', { name: /Design review, 10:30.*saving/ })).toBeInTheDocument();

    await act(async () => resolve());
    expect(await screen.findByText(/Design review moved to/)).toBeInTheDocument();
  });

  it('reverts and announces assertively when persisting fails', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn(() => Promise.reject(new Error('nope')));
    renderCalendar({ defaultView: 'week', onEventChange });
    act(() => screen.getByRole('button', { name: /Design review/ }).focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    // Let the rejected transition settle inside act() so React commits the revert.
    await act(() => new Promise((r) => setTimeout(r, 60)));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not update Design review. Change reverted.');
    expect(screen.getByRole('button', { name: /Design review, 10:00/ })).toBeInTheDocument();
  });

  it('does not allow editing events marked editable: false', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn();
    renderCalendar({
      defaultView: 'week',
      onEventChange,
      events: [{ ...events[0]!, editable: false }],
    });
    const btn = screen.getByRole('button', { name: /Design review/ });
    expect(btn).toHaveAttribute('aria-roledescription', 'event');
    act(() => btn.focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(onEventChange).not.toHaveBeenCalled();
  });

  it('opens the details popover on click', async () => {
    const user = userEvent.setup();
    renderCalendar({ defaultView: 'week' });
    await user.click(screen.getByRole('button', { name: /Design review/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Design review')).toBeInTheDocument();
  });
});
