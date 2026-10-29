import { Dialog } from '@base-ui/react/dialog';
import { Select } from '@base-ui/react/select';
import { TZDate } from '@date-fns/tz';
import { addDays } from 'date-fns';
import { Check, ChevronDown, X } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCalendar, type EditorState } from './calendar-context';
import { inZone, toIsoDay } from './lib/dates';
import { createEventId } from './lib/optimistic';
import { REPEAT_PRESETS, repeatKeyFor, type RepeatKey } from './lib/repeat';

export { REPEAT_PRESETS, repeatKeyFor };
import type { CalendarEvent, EventOccurrence } from './types';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function parseLocal(date: string, time: string, timeZone: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time || '00:00');
  if (!dm || !tm) return null;
  const z = new TZDate(+dm[1]!, +dm[2]! - 1, +dm[3]!, +tm[1]!, +tm[2]!, timeZone);
  return Number.isNaN(z.getTime()) ? null : new Date(z.getTime());
}

export interface EventEditorDialogProps {
  state: EditorState | null;
  onClose: () => void;
  onCreate: (event: CalendarEvent) => void;
  onEdit: (occurrence: EventOccurrence, next: CalendarEvent) => void;
  onDelete: (occurrence: EventOccurrence) => void;
}

/** Base UI Dialog for creating and editing events. */
export function EventEditorDialog({ state, onClose, ...handlers }: EventEditorDialogProps) {
  const { direction } = useCalendar();
  const key = state ? (state.mode === 'edit' ? state.occurrence.occurrenceId : `new:${state.slot.start.getTime()}`) : 'closed';
  return (
    <Dialog.Root open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup dir={direction} className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl outline-none transition-[opacity,transform] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          {state && <EditorForm key={key} state={state} onClose={onClose} {...handlers} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30';

function EditorForm({ state, onClose, onCreate, onEdit, onDelete }: Omit<EventEditorDialogProps, 'state'> & { state: EditorState }) {
  const cal = useCalendar();
  const { timeZone, resources } = cal;
  const m = cal.messages.editor;
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const initial: CalendarEvent =
    state.mode === 'edit'
      ? state.occurrence
      : {
          id: '',
          title: '',
          start: state.slot.start,
          end: state.slot.end,
          allDay: state.slot.allDay,
          resourceIds: state.slot.resourceId ? [state.slot.resourceId] : [],
        };

  const zs = inZone(initial.start, timeZone);
  // All-day end is exclusive; show the last included day.
  const ze = inZone(initial.allDay ? addDays(inZone(initial.end, timeZone), -1) : initial.end, timeZone);

  const [title, setTitle] = useState(initial.title);
  const [allDay, setAllDay] = useState(Boolean(initial.allDay));
  const [startDate, setStartDate] = useState(toIsoDay(zs));
  const [startTime, setStartTime] = useState(hhmm(zs));
  const [endDate, setEndDate] = useState(toIsoDay(ze));
  const [endTime, setEndTime] = useState(hhmm(ze));
  const [repeat, setRepeat] = useState<RepeatKey>(repeatKeyFor(initial.rrule));
  const [location, setLocation] = useState(initial.location ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [resourceIds, setResourceIds] = useState<string[]>(initial.resourceIds ?? []);
  const [errors, setErrors] = useState<{ title?: string; end?: string }>({});

  const isEdit = state.mode === 'edit';
  const isRecurring = isEdit && state.occurrence.isRecurring;
  const repeatItems = [
      ...(Object.keys(REPEAT_PRESETS) as (keyof typeof REPEAT_PRESETS)[]).map((value) => ({ value, label: m.repeatOptions[value] })),
    ...(repeat === 'custom' ? [{ value: 'custom', label: m.custom(initial.rrule ?? '') }] : []),
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const start = allDay ? parseLocal(startDate, '00:00', timeZone) : parseLocal(startDate, startTime, timeZone);
    const endRaw = allDay ? parseLocal(endDate, '00:00', timeZone) : parseLocal(endDate, endTime, timeZone);
    const end = allDay && endRaw ? new Date(addDays(inZone(endRaw, timeZone), 1).getTime()) : endRaw;
    const next: typeof errors = {};
    if (!title.trim()) next.title = m.titleRequired;
    if (!start || !end || end.getTime() <= start.getTime()) next.end = m.endAfterStart;
    setErrors(next);
    if (next.title) return titleRef.current?.focus();
    if (next.end || !start || !end) return document.getElementById(`${id}-end-date`)?.focus();

    const rrule = repeat === 'custom' ? initial.rrule : REPEAT_PRESETS[repeat].rule;
    const event: CalendarEvent = {
      ...(isEdit ? cal.events.find((ev) => ev.id === state.occurrence.seriesId) : {}),
      id: isEdit ? state.occurrence.seriesId : createEventId(),
      title: title.trim(),
      start,
      end,
      allDay,
      rrule,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      resourceIds,
    };
    if (isEdit) onEdit(state.occurrence, event);
    else onCreate(event);
    onClose();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Dialog.Title className="text-lg font-semibold">{isEdit ? m.editEvent : m.newEvent}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            {isRecurring ? `${m.seriesNote} ${m.timesIn(timeZone)}` : m.timesIn(timeZone)}
          </Dialog.Description>
        </div>
        <Dialog.Close aria-label={cal.messages.close} className="rounded-md p-1 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <X className="size-4" />
        </Dialog.Close>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-title`} className="text-sm font-medium">
          {m.title}
        </label>
        <input
          ref={titleRef}
          id={`${id}-title`}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? `${id}-title-error` : undefined}
          autoFocus
        />
        {errors.title && (
          <p id={`${id}-title-error`} className="text-xs text-destructive">
            {errors.title}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        {m.allDay}
      </label>

      <fieldset className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-2">
        <legend className="sr-only">{m.when}</legend>
        <label htmlFor={`${id}-start-date`} className="text-sm font-medium">
          {m.starts}
        </label>
        <input id={`${id}-start-date`} type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input
          aria-label={m.startTime}
          type="time"
          className={cn(inputClass, 'w-28', allDay && 'invisible')}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          disabled={allDay}
        />
        <label htmlFor={`${id}-end-date`} className="text-sm font-medium">
          {m.ends}
        </label>
        <input
          id={`${id}-end-date`}
          type="date"
          className={inputClass}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          aria-invalid={Boolean(errors.end)}
          aria-describedby={errors.end ? `${id}-end-error` : undefined}
        />
        <input
          aria-label={m.endTime}
          type="time"
          className={cn(inputClass, 'w-28', allDay && 'invisible')}
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          disabled={allDay}
          aria-invalid={Boolean(errors.end)}
        />
        {errors.end && (
          <p id={`${id}-end-error`} className="col-span-3 text-xs text-destructive">
            {errors.end}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <span id={`${id}-repeat`} className="text-sm font-medium">
          {m.repeat}
        </span>
        <Select.Root value={repeat} onValueChange={(v) => v && setRepeat(v as RepeatKey)} items={repeatItems}>
          <Select.Trigger aria-labelledby={`${id}-repeat`} className={cn(inputClass, 'flex items-center justify-between')}>
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="size-4 opacity-60" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner sideOffset={4} className="z-[60]">
              <Select.Popup className="min-w-[var(--anchor-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                {repeatItems.map((item) => (
                  <Select.Item key={item.value} value={item.value} className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent">
                    <span className="w-4">
                      <Select.ItemIndicator>
                        <Check className="size-4" />
                      </Select.ItemIndicator>
                    </span>
                    <Select.ItemText>{item.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-location`} className="text-sm font-medium">
          {m.location}
        </label>
        <input id={`${id}-location`} className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          {m.description}
        </label>
        <textarea
          id={`${id}-description`}
          className={cn(inputClass, 'h-20 py-2')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {resources.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{m.resources}</legend>
          <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md border p-2">
            {resources.map((r) => (
              <label key={r.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={resourceIds.includes(r.id)}
                  onChange={(e) =>
                    setResourceIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)))
                  }
                />
                {r.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {isEdit && cal.canDelete(state.occurrence) && (
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={() => {
              onDelete(state.occurrence);
              onClose();
            }}
          >
            {m.deleteEvent}
          </Button>
        )}
        <Dialog.Close render={<Button variant="outline" />}>{m.cancel}</Dialog.Close>
        <Button type="submit">{isEdit ? m.save : m.create}</Button>
      </div>
    </form>
  );
}
