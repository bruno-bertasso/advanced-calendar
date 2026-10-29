import { addDays, addHours, setHours, setMinutes, startOfDay, startOfWeek } from 'date-fns';
import type { BlockedRange, CalendarEvent, CalendarResource } from '@/components/calendar';

export const resources: CalendarResource[] = [
  { id: 'ada', title: 'Ada Lovelace', color: 'oklch(0.6 0.18 260)' },
  { id: 'grace', title: 'Grace Hopper', color: 'oklch(0.65 0.17 150)' },
  { id: 'room-a', title: 'Room A', color: 'oklch(0.7 0.16 60)' },
  // Extra rows so the timeline's row virtualisation has something to do.
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `desk-${i + 1}`,
    title: `Hot desk ${i + 1}`,
    color: `oklch(0.65 0.14 ${(i * 37) % 360})`,
  })),
];

const at = (day: Date, h: number, m = 0) => setMinutes(setHours(day, h), m);

export function createSampleEvents(today = new Date()): CalendarEvent[] {
  const week = startOfWeek(startOfDay(today), { weekStartsOn: 1 });
  const d = (n: number) => addDays(week, n);
  return [
    {
      id: 'standup',
      title: 'Daily stand-up',
      start: at(d(0), 9, 30),
      end: at(d(0), 9, 45),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      resourceIds: ['ada', 'grace'],
      location: 'Zoom',
    },
    {
      id: 'design-review',
      title: 'Design review',
      start: at(d(1), 10),
      end: at(d(1), 11, 30),
      resourceIds: ['ada', 'room-a'],
      location: 'Room A',
      description: 'Review the calendar component interaction spec.',
    },
    { id: 'overlap-1', title: '1:1 with Grace', start: at(d(1), 10, 30), end: at(d(1), 11), resourceIds: ['grace'] },
    { id: 'overlap-2', title: 'Customer call', start: at(d(1), 10, 45), end: at(d(1), 12), resourceIds: ['ada'], color: 'oklch(0.63 0.2 25)' },
    {
      id: 'offsite',
      title: 'Team offsite',
      start: d(2),
      end: d(4),
      allDay: true,
      color: 'oklch(0.65 0.17 150)',
      resourceIds: ['ada', 'grace'],
    },
    { id: 'lunch', title: 'Lunch & learn', start: at(d(3), 12), end: at(d(3), 13), resourceIds: ['room-a'] },
    {
      id: 'deploy',
      title: 'Overnight deploy',
      start: at(d(4), 22),
      end: addHours(at(d(4), 22), 4),
      resourceIds: ['grace'],
      color: 'oklch(0.55 0.2 300)',
    },
    {
      id: 'retro',
      title: 'Sprint retro',
      start: at(d(4), 15),
      end: at(d(4), 16),
      rrule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=6',
      resourceIds: ['ada', 'grace', 'room-a'],
    },
    { id: 'locked', title: 'Board meeting (locked)', start: at(d(8), 14), end: at(d(8), 16), editable: false },
    // Deterministic bookings across the hot desks (timeline density).
    ...Array.from({ length: 45 }, (_, i) => {
      const day = d(i % 7);
      const startHour = 6 + ((i * 5) % 14);
      return {
        id: `booking-${i}`,
        title: `Booking ${i + 1}`,
        start: at(day, startHour, (i % 2) * 30),
        end: at(day, startHour + 1, (i % 2) * 30),
        resourceIds: [`desk-${(i % 40) + 1}`],
      };
    }),
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `busy-${i}`,
      title: `Interview #${i + 1}`,
      start: at(d(10), 9 + i),
      end: at(d(10), 9 + i, 45),
      resourceIds: ['grace'],
    })),
  ];
}

/** Room A is closed for cleaning 12:00–13:00 every weekday; Saturday afternoon is a global freeze. */
export function createBlockedRanges(today = new Date()): BlockedRange[] {
  const week = startOfWeek(startOfDay(today), { weekStartsOn: 1 });
  return [
    ...Array.from({ length: 5 }, (_, i) => ({
      start: at(addDays(week, i), 12),
      end: at(addDays(week, i), 13),
      resourceId: 'room-a',
      label: 'Cleaning',
    })),
    { start: at(addDays(week, 5), 13), end: at(addDays(week, 5), 18), label: 'Change freeze' },
  ];
}
