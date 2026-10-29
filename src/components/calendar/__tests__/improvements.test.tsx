import { TZDate } from '@date-fns/tz';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Calendar, CalendarBody, CalendarHeader, ptBRMessages, type CalendarEvent, type CalendarProps, type EventChange } from '../index';

const TZ = 'UTC';
const DATE = new TZDate(2026, 9, 28, TZ); // Wed Oct 28 2026

const standup: CalendarEvent = {
  id: 'standup',
  title: 'Stand-up',
  start: new Date('2026-10-26T09:00Z'),
  end: new Date('2026-10-26T09:30Z'),
  rrule: 'FREQ=DAILY;COUNT=5',
};
const review: CalendarEvent = { id: 'a', title: 'Design review', start: new Date('2026-10-28T10:00Z'), end: new Date('2026-10-28T11:00Z') };

function renderCalendar(props: Partial<CalendarProps> = {}) {
  return render(
    <Calendar events={[standup, review]} timeZone={TZ} defaultDate={DATE} defaultView="week" views={['month', 'week', 'day']} {...props}>
      <CalendarHeader />
      <CalendarBody />
    </Calendar>,
  );
}

const settle = (ms = 60) => act(() => new Promise((r) => setTimeout(r, ms)));
const standupOn = (dayLabel: RegExp) =>
  screen.getAllByRole('button', { name: /Stand-up/ }).find((b) => dayLabel.test(b.closest('[role="gridcell"]')!.getAttribute('aria-label') ?? ''))!;

describe('recurring edit scope', () => {
  it('asks for the scope and applies "This event" as an exception', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn((_c: EventChange) => Promise.resolve());
    renderCalendar({ onEventChange });

    act(() => standupOn(/Wednesday/).focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    const dialog = await screen.findByRole('alertdialog', { name: 'Change recurring event' });
    expect(onEventChange).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'This event' }));

    expect(onEventChange).toHaveBeenCalledTimes(1);
    const change = onEventChange.mock.calls[0]![0];
    expect(change.scope).toBe('this');
    expect(change.created?.[0]?.start.toISOString()).toBe('2026-10-28T09:30:00.000Z');
    // Optimistic: only Wednesday moved.
    expect(standupOn(/Wednesday/).closest('[role="gridcell"]')).toHaveAccessibleName(/9:30 AM/);
    expect(standupOn(/Thursday/).closest('[role="gridcell"]')).toHaveAccessibleName(/9:00 AM/);
  });

  it('does nothing when the scope dialog is cancelled', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn();
    renderCalendar({ onEventChange });
    act(() => standupOn(/Wednesday/).focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onEventChange).not.toHaveBeenCalled();
  });

  it('skips the dialog when recurringEditScope is fixed', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn((_c: EventChange) => undefined);
    renderCalendar({ onEventChange, recurringEditScope: 'following' });
    act(() => standupOn(/Wednesday/).focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onEventChange.mock.calls[0]![0].scope).toBe('following');
  });

  it('offers "this" / "following" / "all" when deleting an occurrence', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn((_c: EventChange) => undefined);
    const onEventDelete = vi.fn();
    renderCalendar({ onEventChange, onEventDelete });
    act(() => standupOn(/Thursday/).focus());
    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete recurring event' });
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'This event', 'This and following events', 'All events', 'Cancel',
    ]);
    await user.click(within(dialog).getByRole('button', { name: 'This and following events' }));
    expect(onEventDelete).not.toHaveBeenCalled();
    expect(onEventChange.mock.calls[0]![0]).toMatchObject({ type: 'delete', scope: 'following' });
    expect(screen.getAllByRole('button', { name: /Stand-up/ })).toHaveLength(3); // Mon–Wed remain
  });
});

describe('validation', () => {
  it('rejects a change when onBeforeEventChange returns a reason', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn();
    renderCalendar({ onEventChange, onBeforeEventChange: () => 'room is booked' });
    act(() => screen.getByRole('button', { name: /Design review/ }).focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await settle();
    expect(onEventChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Design review was not changed: room is booked');
    expect(screen.getByRole('button', { name: /Design review, 10:00/ })).toBeInTheDocument();
  });

  it('supports async validators', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn();
    renderCalendar({ onEventChange, onBeforeEventChange: async (c) => c.start.getUTCHours() < 12 });
    act(() => screen.getByRole('button', { name: /Design review/ }).focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await settle();
    expect(onEventChange).toHaveBeenCalledTimes(1);
  });

  it('rejects moves into blocked ranges', async () => {
    const user = userEvent.setup();
    const onEventChange = vi.fn();
    renderCalendar({
      onEventChange,
      blockedRanges: [{ start: new Date('2026-10-28T10:30Z'), end: new Date('2026-10-28T12:00Z'), label: 'Maintenance' }],
    });
    act(() => screen.getByRole('button', { name: /Design review/ }).focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await settle();
    expect(onEventChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('That time is unavailable.');
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });
});

describe('time grid extras', () => {
  it('shades time outside business hours', () => {
    renderCalendar({ businessHours: { startHour: 9, endHour: 17 } });
    const cell = (slot: string) => document.querySelector(`[data-slot="${slot}"]`)!;
    expect(cell('3:420')).toHaveAttribute('data-off-hours'); // Wed 7:00
    expect(cell('3:600')).not.toHaveAttribute('data-off-hours'); // Wed 10:00
    expect(cell('0:600')).toHaveAttribute('data-off-hours'); // Sunday
  });

  it('creates an event by dragging across slots', async () => {
    const onSlotSelect = vi.fn();
    renderCalendar({ onSlotSelect });
    const from = document.querySelector<HTMLElement>('[data-slot="3:840"]')!; // Wed 14:00
    const to = document.querySelector<HTMLElement>('[data-slot="3:900"]')!; // Wed 15:00
    const original = document.elementFromPoint;
    document.elementFromPoint = () => to;
    try {
      fireEvent.pointerDown(from, { button: 0, pointerType: 'mouse' });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1, clientY: 1 }));
      });
      expect(to).toHaveAttribute('data-selecting');
      expect(document.querySelector('[data-slot="3:870"]')).toHaveAttribute('data-selecting');
      await act(async () => {
        window.dispatchEvent(new MouseEvent('pointerup'));
      });
    } finally {
      document.elementFromPoint = original;
    }
    expect(onSlotSelect).toHaveBeenCalledWith({
      start: new Date('2026-10-28T14:00:00.000Z'),
      end: new Date('2026-10-28T15:30:00.000Z'),
      allDay: false,
    });
    expect(document.querySelector('[data-selecting]')).toBeNull();
  });
});

describe('i18n', () => {
  it('renders the pt-BR preset', () => {
    renderCalendar({ messages: ptBRMessages, locale: 'pt-BR' });
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Semana' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Dia inteiro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeInTheDocument();
  });

  it('accepts partial overrides', () => {
    renderCalendar({ messages: { today: 'Now', views: { week: 'Wk' } } });
    expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Wk' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Month' })).toBeInTheDocument();
  });
});
