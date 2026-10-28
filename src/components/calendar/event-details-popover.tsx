import { Popover } from '@base-ui/react/popover';
import { CalendarClock, Copy, MapPin, Pencil, Repeat, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RefObject } from 'react';
import { useCalendar } from './calendar-context';
import { formatDayLabel, formatTimeRange } from './lib/dates';
import type { EventOccurrence } from './types';

const actionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50';

interface EventDetailsPopoverProps {
  occurrence: EventOccurrence | null;
  anchor: HTMLElement | null;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

/** Single shared, controlled popover anchored to whichever event card was activated. */
export function EventDetailsPopover({ occurrence, anchor, onClose, returnFocusRef }: EventDetailsPopoverProps) {
  const { direction, timeZone, locale, resources, canEdit, canDelete, canCreate, nudge, openEditor, deleteEvent, duplicateEvent } = useCalendar();
  const editable = occurrence ? canEdit(occurrence) : false;
  const open = Boolean(occurrence && anchor);
  const resourceNames = occurrence?.resourceIds
    ?.map((id) => resources.find((r) => r.id === id)?.title)
    .filter(Boolean)
    .join(', ');

  return (
    <Popover.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Popover.Portal>
        <Popover.Positioner anchor={anchor} side="right" align="start" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup
            dir={direction}
                        finalFocus={returnFocusRef}
            className="w-80 max-w-[calc(100vw-2rem)] origin-[var(--transform-origin)] rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
          >
            {occurrence && (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 size-3 shrink-0 rounded-sm"
                    style={{ background: occurrence.color ?? 'var(--calendar-event)' }}
                  />
                  <Popover.Title className="flex-1 text-base font-semibold leading-snug">{occurrence.title}</Popover.Title>
                  <Popover.Close
                    aria-label="Close"
                    className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
                  >
                    <X className="size-4" />
                  </Popover.Close>
                </div>
                <Popover.Description render={<div />} className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <CalendarClock aria-hidden className="size-4" />
                    <span>
                      {formatDayLabel(occurrence.start, timeZone, locale)}
                      <br />
                      {formatTimeRange(occurrence.start, occurrence.end, timeZone, locale, occurrence.allDay)}
                    </span>
                  </p>
                  {occurrence.isRecurring && (
                    <p className="flex items-center gap-2">
                      <Repeat aria-hidden className="size-4" /> Recurring event
                    </p>
                  )}
                  {occurrence.location && (
                    <p className="flex items-center gap-2">
                      <MapPin aria-hidden className="size-4" /> {occurrence.location}
                    </p>
                  )}
                  {resourceNames && <p>With: {resourceNames}</p>}
                  {occurrence.description && <p className="text-foreground">{occurrence.description}</p>}
                </Popover.Description>
                {occurrence && (editable || canCreate || canDelete(occurrence)) && (
                  <div role="group" aria-label="Event actions" className="flex flex-wrap gap-1 border-t pt-3">
                    {editable && (
                      <button type="button" className={actionClass} onClick={() => openEditor({ mode: 'edit', occurrence })}>
                        <Pencil aria-hidden className="size-3.5" /> Edit
                      </button>
                    )}
                    {canCreate && (
                      <button type="button" className={actionClass} onClick={() => duplicateEvent(occurrence)}>
                        <Copy aria-hidden className="size-3.5" /> Duplicate
                      </button>
                    )}
                    {canDelete(occurrence) && (
                      <button type="button" className={cn(actionClass, 'text-destructive')} onClick={() => deleteEvent(occurrence)}>
                        <Trash2 aria-hidden className="size-3.5" /> Delete
                      </button>
                    )}
                  </div>
                )}
                {editable && occurrence && (
                  <div role="group" aria-label="Adjust event" className="grid grid-cols-3 gap-1 border-t pt-3">
                    {(
                      [
                        ['earlier', 'Earlier'],
                        ['later', 'Later'],
                        ['shorter', 'Shorter'],
                        ['prev-day', 'Prev day'],
                        ['next-day', 'Next day'],
                        ['longer', 'Longer'],
                      ] as const
                    )
                      .filter(([a]) => !occurrence.allDay || (a !== 'earlier' && a !== 'later' && a !== 'shorter' && a !== 'longer'))
                      .map(([action, text]) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => nudge(occurrence, action)}
                          className="h-8 rounded-md border bg-background px-2 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          {text}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
