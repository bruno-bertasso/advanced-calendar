import { ContextMenu } from '@base-ui/react/context-menu';
import { CalendarPlus, Copy, Eye, Pencil, Trash2, Undo2 } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { useCalendar } from './calendar-context';
import type { EventOccurrence, SlotSelectInfo } from './types';

/** Attributes views put on slot elements so the context menu knows what was right-clicked. */
export function slotDataAttributes(slot: SlotSelectInfo): Record<string, string> {
  return {
    'data-slot-start': String(slot.start.getTime()),
    'data-slot-end': String(slot.end.getTime()),
    ...(slot.allDay ? { 'data-slot-allday': '' } : {}),
    ...(slot.resourceId ? { 'data-slot-resource': slot.resourceId } : {}),
  };
}

function readSlot(el: Element | null): SlotSelectInfo | null {
  const node = el?.closest<HTMLElement>('[data-slot-start]');
  if (!node) return null;
  const { slotStart, slotEnd, slotResource } = node.dataset;
  return {
    start: new Date(Number(slotStart)),
    end: new Date(Number(slotEnd)),
    allDay: node.hasAttribute('data-slot-allday'),
    ...(slotResource ? { resourceId: slotResource } : {}),
  };
}

type Target =
  | { type: 'event'; occurrence: EventOccurrence; anchor: HTMLElement }
  | { type: 'slot'; slot: SlotSelectInfo }
  | { type: 'none' };

const itemClass =
  'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground';

/**
 * One shared Base UI ContextMenu for the whole calendar body (right-click / long-press).
 * Everything here is also reachable by keyboard via the event popover and shortcuts.
 */
export function CalendarContextMenu({ children }: { children: ReactNode }) {
  const cal = useCalendar();
  const [target, setTarget] = useState<Target>({ type: 'none' });

  const capture = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    const card = el.closest<HTMLElement>('[data-occurrence-id]');
    if (card) {
      const occurrence = cal.occurrences.find((o) => o.occurrenceId === card.dataset.occurrenceId);
      const anchor = card.querySelector<HTMLElement>('button') ?? card;
      if (occurrence) return setTarget({ type: 'event', occurrence, anchor });
    }
    const slot = readSlot(el);
    setTarget(slot ? { type: 'slot', slot } : { type: 'none' });
  };

  const occ = target.type === 'event' ? target.occurrence : null;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className="flex min-h-0 flex-1 flex-col" onContextMenuCapture={capture}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50">
          <ContextMenu.Popup dir={cal.direction} className="min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity">
            {occ && target.type === 'event' && (
              <>
                <div className="truncate px-2 py-1 text-xs font-medium text-muted-foreground">{occ.title}</div>
                <ContextMenu.Item className={itemClass} onClick={() => cal.openEvent(occ, target.anchor)}>
                  <Eye /> {cal.messages.viewDetails}
                </ContextMenu.Item>
                {cal.canEdit(occ) && (
                  <ContextMenu.Item className={itemClass} onClick={() => cal.openEditor({ mode: 'edit', occurrence: occ })}>
                    <Pencil /> {cal.messages.editEllipsis}
                  </ContextMenu.Item>
                )}
                {cal.canCreate && (
                  <ContextMenu.Item className={itemClass} onClick={() => cal.duplicateEvent(occ)}>
                    <Copy /> {cal.messages.duplicate}
                  </ContextMenu.Item>
                )}
                {cal.canDelete(occ) && (
                  <ContextMenu.Item className={`${itemClass} text-destructive [&_svg]:text-destructive`} onClick={() => cal.deleteEvent(occ)}>
                    <Trash2 /> {cal.messages.delete}
                  </ContextMenu.Item>
                )}
                <ContextMenu.Separator className="my-1 h-px bg-border" />
              </>
            )}
            {target.type === 'slot' && cal.onSlotSelect && (
              <>
                <ContextMenu.Item className={itemClass} onClick={() => cal.onSlotSelect?.(target.slot)}>
                  <CalendarPlus /> {cal.messages.newEventHere}
                </ContextMenu.Item>
                <ContextMenu.Separator className="my-1 h-px bg-border" />
              </>
            )}
            <ContextMenu.Item className={itemClass} onClick={() => cal.navigate('today')}>
              <Undo2 /> {cal.messages.goToToday}
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
