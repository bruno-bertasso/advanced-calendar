import { TZDate } from '@date-fns/tz';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Calendar, CalendarBody, CalendarHeader, type CalendarEvent, type CalendarProps } from '../index';

const TZ = 'UTC';
const DATE = new TZDate(2026, 9, 28, TZ); // Wed Oct 28 2026

const events: CalendarEvent[] = [
  { id: 'a', title: 'Design review', start: new Date('2026-10-28T10:00Z'), end: new Date('2026-10-28T11:00Z'), resourceIds: ['r1'] },
  { id: 'b', title: 'Offsite', allDay: true, start: new Date('2026-10-29T00:00Z'), end: new Date('2026-10-31T00:00Z') },
  { id: 'c', title: 'Planning', start: new Date('2026-11-03T14:00Z'), end: new Date('2026-11-03T15:00Z'), resourceIds: ['r2'] },
];
const resources = [
  { id: 'r1', title: 'Room 1' },
  { id: 'r2', title: 'Room 2' },
];

const ALL_VIEWS = ['day', 'week', 'work-week', 'month', 'year', 'agenda', 'timeline'] as const;

function renderCalendar(props: Partial<CalendarProps> = {}) {
  return render(
    <Calendar events={events} resources={resources} timeZone={TZ} defaultDate={DATE} views={ALL_VIEWS} {...props}>
      <CalendarHeader />
      <CalendarBody />
    </Calendar>,
  );
}

/** Let async optimistic transitions settle inside act(). */
const settle = (ms = 60) => act(() => new Promise((r) => setTimeout(r, ms)));

describe('year view', () => {
  it('renders 12 month grids with a single tab stop on the cursor day', () => {
    renderCalendar({ defaultView: 'year' });
    expect(screen.getByRole('heading', { name: '2026', level: 2 })).toBeInTheDocument();
    const grids = screen.getAllByRole('grid');
    expect(grids).toHaveLength(12);
    const tabbable = document.querySelectorAll('[data-year-day][tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName(/Wednesday, October 28, 2026, 1 event/);
  });

  it('navigates across months by keyboard and drills into the day view with Enter', async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    renderCalendar({ defaultView: 'year', onViewChange });
    act(() => (document.querySelector('[data-year-day][tabindex="0"]') as HTMLElement).focus());
    await user.keyboard('{PageDown}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-11-28');
    await user.keyboard('{Enter}');
    expect(onViewChange).toHaveBeenCalledWith('day');
  });
});

describe('agenda view', () => {
  it('lists upcoming events grouped by day headings', () => {
    renderCalendar({ defaultView: 'agenda' });
    const list = screen.getByRole('list', { name: /Agenda/ });
    expect(within(list).getByRole('heading', { name: /Wednesday, October 28, 2026/ })).toBeInTheDocument();
    // The two-day offsite appears on both days.
    expect(within(list).getAllByRole('button', { name: /Offsite/ })).toHaveLength(2);
    expect(within(list).getByRole('button', { name: /Planning/ })).toBeInTheDocument();
  });

  it('shows an empty state when there is nothing in range', () => {
    renderCalendar({ defaultView: 'agenda', events: [] });
    expect(screen.getByText(/No events between/)).toHaveAttribute('role', 'status');
  });
});

describe('timeline view', () => {
  it('renders one row per resource with events placed in their row', () => {
    // A week without "now" in it; jsdom doesn't scroll, so the visible window starts at the
    // range start (Sun Nov 1) and spans ~18h at 1200px.
    renderCalendar({
      defaultView: 'timeline',
      defaultDate: new TZDate(2026, 10, 3, TZ),
      events: [{ id: 'p', title: 'Planning', start: new Date('2026-11-01T10:00Z'), end: new Date('2026-11-01T11:00Z'), resourceIds: ['r2'] }],
    });
    const grid = screen.getByRole('grid', { name: /Timeline/ });
    const headers = within(grid).getAllByRole('rowheader').map((h) => h.textContent);
    expect(headers).toEqual(['Room 1', 'Room 2']);
    const btn = within(grid).getByRole('button', { name: /Planning/ });
    expect(btn.closest('[role="row"]')).toHaveTextContent('Room 2');
  });

  it('moves the roving focus between resource rows with arrow keys', async () => {
    const user = userEvent.setup();
    renderCalendar({ defaultView: 'timeline' });
    act(() => (document.querySelector('[data-timeline-track="0"]') as HTMLElement).focus());
    await user.keyboard('{ArrowDown}');
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(document.activeElement).toHaveAttribute('data-timeline-track', '1');
  });

  it('uses renderResourceHeader for row headers', () => {
    renderCalendar({ defaultView: 'timeline', renderResourceHeader: ({ resource }) => <i>res:{resource.title}</i> });
    expect(screen.getByText('res:Room 2')).toBeInTheDocument();
  });
});

describe('event editor dialog', () => {
  it('creates an event from a slot: validates, then calls onEventCreate optimistically', async () => {
    const user = userEvent.setup();
    const onEventCreate = vi.fn(() => Promise.resolve());
    renderCalendar({ defaultView: 'month', onEventCreate });

    const cell = screen.getAllByRole('gridcell').find((c) => c.tabIndex === 0)!;
    act(() => cell.focus());
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', { name: 'New event' });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(within(dialog).getByText('Enter a title.')).toBeInTheDocument();
    expect(onEventCreate).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Title'), 'Retro');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(onEventCreate).toHaveBeenCalledTimes(1);
    const created = (onEventCreate.mock.calls[0] as unknown as [CalendarEvent])[0];
    expect(created).toMatchObject({ title: 'Retro', allDay: true });
    expect(created.start.toISOString()).toBe('2026-10-28T00:00:00.000Z');
    expect(created.end.toISOString()).toBe('2026-10-29T00:00:00.000Z');
    // Optimistically rendered before the promise resolves.
    expect(screen.getByRole('button', { name: /Retro, All day, saving/ })).toBeInTheDocument();
    await settle();
    expect(screen.getByText(/Retro created for/)).toBeInTheDocument();
  });

  it('rejects an end before the start', async () => {
    const user = userEvent.setup();
    renderCalendar({ defaultView: 'month', onEventCreate: vi.fn() });
    act(() => screen.getAllByRole('gridcell').find((c) => c.tabIndex === 0)!.focus());
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'New event' });
    await user.type(within(dialog).getByLabelText('Title'), 'Bad');
    const endDate = within(dialog).getByLabelText('Ends');
    await user.clear(endDate);
    await user.type(endDate, '2026-10-01');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(within(dialog).getByText('End must be after start.')).toBeInTheDocument();
    expect(endDate).toHaveAttribute('aria-invalid', 'true');
  });

  it('edits an event from the details popover and emits an "edit" change', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn(() => Promise.resolve());
    renderCalendar({ defaultView: 'week', onEventChange });
    await user.click(screen.getByRole('button', { name: /Design review/ }));
    const popover = await screen.findByRole('dialog');
    await user.click(within(popover).getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    const title = within(dialog).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Design review (final)');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(onEventChange).toHaveBeenCalledTimes(1);
    const change = (onEventChange.mock.calls[0] as unknown as [import('../types').EventChange])[0];
    expect(change.type).toBe('edit');
    expect(change.nextEvent).toMatchObject({ id: 'a', title: 'Design review (final)', resourceIds: ['r1'] });
    expect(change.nextEvent.start.toISOString()).toBe('2026-10-28T10:00:00.000Z');
  });
});

describe('delete', () => {
  it('removes an event with the Delete key optimistically and announces it', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onEventDelete = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    renderCalendar({ defaultView: 'week', onEventDelete });
    act(() => screen.getByRole('button', { name: /Design review/ }).focus());
    await user.keyboard('{Delete}');
    expect(onEventDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(screen.queryByRole('button', { name: /Design review/ })).not.toBeInTheDocument();
    await act(async () => resolve());
    await settle();
    expect(screen.getByText('Design review deleted.')).toBeInTheDocument();
  });

  it('restores the event when deletion fails', async () => {
    const user = userEvent.setup();
    renderCalendar({ defaultView: 'week', onEventDelete: () => Promise.reject(new Error('no')) });
    act(() => screen.getByRole('button', { name: /Design review/ }).focus());
    await user.keyboard('{Delete}');
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not delete Design review. It has been restored.');
    expect(screen.getByRole('button', { name: /Design review/ })).toBeInTheDocument();
  });
});

describe('RTL', () => {
  it('mirrors horizontal arrow keys in the month grid', async () => {
    const user = userEvent.setup();
    renderCalendar({ defaultView: 'month', direction: 'rtl' });
    expect(screen.getByRole('region', { name: 'Calendar' })).toHaveAttribute('dir', 'rtl');
    act(() => screen.getAllByRole('gridcell').find((c) => c.tabIndex === 0)!.focus());
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-10-29');
  });
});
