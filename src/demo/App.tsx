import { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarBody,
  CalendarHeader,
  ptBRMessages,
  useCalendarQueryState,
  type BeforeEventChange,
  type CalendarEvent,
  type EventChange,
} from '@/components/calendar';
import { createBlockedRanges, createSampleEvents, resources } from './sample-data';

const BUSINESS_HOURS = { startHour: 8, endHour: 18 };

/** Example validation: nothing may start before 6:00 or end after 22:00 (display zone). */
const validate: BeforeEventChange = (change) => {
  if (change.type === 'delete' || change.event.allDay) return true;
  const h = (d: Date) => d.getHours() + d.getMinutes() / 60;
  if (h(change.start) < 6 || (h(change.end) > 22 && change.end.getDate() === change.start.getDate())) {
    return 'outside allowed hours (6:00–22:00)';
  }
  return true;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function App() {
  const [events, setEvents] = useState<CalendarEvent[]>(() => createSampleEvents());
  const [failSaves, setFailSaves] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [lang, setLang] = useState<'en' | 'pt-BR'>('en');
  const blockedRanges = useMemo(() => createBlockedRanges(), []);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const q = useCalendarQueryState({ defaultView: 'week', timeZone });

  // Simulated server: the UI updates instantly via useOptimistic and reverts if this throws.
  const handleEventChange = async (change: EventChange) => {
    await sleep(600);
    if (failSaves) throw new Error('Server rejected change');
    // Persist exactly what the change describes: the updated (or deleted) series plus any
    // events it creates (exception for "this event", new series for "this and following").
    setEvents((prev) => {
      const removed = change.type === 'delete' && change.scope === 'all';
      const updated = prev.flatMap((e) => (e.id !== change.event.id ? [e] : removed ? [] : [change.nextEvent]));
      return [...updated, ...(change.created ?? [])];
    });
  };

  const handleCreate = async (event: CalendarEvent) => {
    await sleep(400);
    if (failSaves) throw new Error('Server rejected create');
    setEvents((prev) => [...prev, event]);
  };

  const handleDelete = async (event: CalendarEvent) => {
    await sleep(400);
    if (failSaves) throw new Error('Server rejected delete');
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
  };

  const toggleResource = (id: string) =>
    q.setResourceIds(q.resourceIds.includes(id) ? q.resourceIds.filter((r) => r !== id) : [...q.resourceIds, id]);

  return (
    <main className="mx-auto flex h-dvh max-w-7xl flex-col gap-3 p-3 md:p-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <h1 className="text-xl font-semibold">Advanced Calendar</h1>
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">Resource columns</legend>
          {resources.slice(0, 3).map((r) => (
            <label key={r.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={q.resourceIds.includes(r.id)} onChange={() => toggleResource(r.id)} />
              {r.title}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={failSaves} onChange={(e) => setFailSaves(e.target.checked)} />
          Simulate save failures
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={lang === 'pt-BR'} onChange={(e) => setLang(e.target.checked ? 'pt-BR' : 'en')} />
          Português
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={rtl} onChange={(e) => setRtl(e.target.checked)} />
          RTL
        </label>
        <label className="flex items-center gap-1.5">
          Zone
          <select className="rounded border bg-background px-1 py-0.5" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
            {[Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney']
              .filter((z, i, a) => a.indexOf(z) === i)
              .map((z) => (
                <option key={z}>{z}</option>
              ))}
          </select>
        </label>
      </div>

      <Calendar
        className="flex-1"
        events={events}
        resources={resources}
        visibleResourceIds={q.resourceIds}
        view={q.view}
        onViewChange={q.setView}
        date={q.date}
        onDateChange={q.setDate}
        views={['day', 'week', 'work-week', 'month', 'year', 'agenda', 'timeline']}
        direction={rtl ? 'rtl' : 'ltr'}
        locale={lang}
        messages={lang === 'pt-BR' ? ptBRMessages : undefined}
        businessHours={BUSINESS_HOURS}
        blockedRanges={blockedRanges}
        onBeforeEventChange={validate}
        onEventCreate={handleCreate}
        onEventDelete={handleDelete}
        timeZone={timeZone}
        weekStartsOn={1}
        onEventChange={handleEventChange}
        renderResourceHeader={({ resource }) => (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: resource.color }} />
            {resource.title}
          </span>
        )}
      >
        <CalendarHeader />
        <CalendarBody />
      </Calendar>
    </main>
  );
}
