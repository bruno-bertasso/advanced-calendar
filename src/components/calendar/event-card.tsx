import { useDraggable } from '@dnd-kit/core';
import { Repeat } from 'lucide-react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { isPreviewOccurrence, useCalendar, useCalendarConfig, useCalendarState, type NudgeAction } from './calendar-context';
import type { DragData } from './lib/dnd';
import { formatTimeRange } from './lib/dates';
import type { EventDensity, EventOccurrence, EventRenderContext } from './types';

export interface EventCardProps {
  occurrence: EventOccurrence;
  /** Unique per rendered segment. */
  segmentKey: string;
  segmentDay: number;
  surface: DragData['surface'];
  resourceId?: string;
  isStart?: boolean;
  isEnd?: boolean;
  density?: EventDensity;
  /** Enable the bottom resize handle (time grid only). */
  resizable?: boolean;
  /** Resize axis: bottom handle (time grid) or inline-end handle (month, all-day, timeline). */
  resizeAxis?: 'vertical' | 'horizontal';
  /** Whether the card is in the tab sequence (true for events in the grid's active cell/day). */
  tabbable?: boolean;
  /** Render without drag affordances (e.g. inside popovers / lists). */
  disableDrag?: boolean;
  className?: string;
  style?: CSSProperties;
}

const KEY_ACTIONS: Record<string, NudgeAction> = {
  'Alt+ArrowUp': 'earlier',
  'Alt+ArrowDown': 'later',
  'Alt+ArrowLeft': 'prev-day',
  'Alt+ArrowRight': 'next-day',
  'Shift+ArrowUp': 'shorter',
  'Shift+ArrowDown': 'longer',
};

/**
 * Event card. Drag previews (ghost occurrences from `DragState.preview`) render as a
 * non-interactive outline; everything else is a draggable, focusable button.
 */
export function EventCard(props: EventCardProps) {
  return isPreviewOccurrence(props.occurrence) ? <EventGhost {...props} /> : <InteractiveEventCard {...props} />;
}

function EventGhost({ occurrence, className, style, isStart = true, isEnd = true }: EventCardProps) {
  const { timeZone, locale, messages } = useCalendarConfig();
  const { resources } = useCalendarState();
  const color = occurrence.color ?? resourceColor(resources, occurrence) ?? 'var(--calendar-event)';
  return (
    <div
      aria-hidden
      data-calendar-ghost=""
      className={cn('pointer-events-none z-40 min-w-0', className)}
      style={{ ...style, ['--event-color' as string]: color }}
    >
      <div
        className={cn(
          'flex size-full flex-col overflow-hidden rounded-md border-2 border-dashed border-[var(--event-color)] bg-[color-mix(in_oklab,var(--event-color)_28%,var(--background))] px-1.5 py-0.5 text-xs shadow-lg',
          !isStart && 'rounded-s-none',
          !isEnd && 'rounded-e-none',
        )}
      >
        <span className="truncate font-medium">{occurrence.title}</span>
        <span className="truncate tabular-nums text-muted-foreground">
          {formatTimeRange(occurrence.start, occurrence.end, timeZone, locale, occurrence.allDay, messages.allDay)}
        </span>
      </div>
    </div>
  );
}

function InteractiveEventCard({
  occurrence,
  segmentKey,
  segmentDay,
  surface,
  resourceId,
  isStart = true,
  isEnd = true,
  density = 'default',
  resizable = false,
  resizeAxis = 'vertical',
  tabbable = false,
  disableDrag = false,
  className,
  style,
}: EventCardProps) {
  const cal = useCalendar();
  const editable = cal.canEdit(occurrence);
  const draggable = editable && !disableDrag;
  const isPending = cal.isPending(occurrence.seriesId);
  const isSelected = cal.selectedOccurrenceId === occurrence.occurrenceId;

  const moveData: DragData = { kind: 'move', occurrence, segmentDay, surface, ...(resourceId ? { resourceId } : {}) };
  const move = useDraggable({ id: `${segmentKey}:move`, data: moveData, disabled: !draggable });
  const resize = useDraggable({
    id: `${segmentKey}:resize`,
    data: { ...moveData, kind: 'resize' } satisfies DragData,
    disabled: !draggable || !resizable || !isEnd,
  });

  const isDragging = move.isDragging || resize.isDragging;
  const timeLabel = formatTimeRange(occurrence.start, occurrence.end, cal.timeZone, cal.locale, occurrence.allDay, cal.messages.allDay);
  const ctx: EventRenderContext = {
    event: occurrence,
    view: cal.view,
    timeZone: cal.timeZone,
    density,
    isStart,
    isEnd,
    isDragging,
    isPending,
    isSelected,
    timeLabel,
  };

  const color = occurrence.color ?? resourceColor(cal.resources, occurrence) ?? 'var(--calendar-event)';
  const label = [
    occurrence.title,
    timeLabel,
    occurrence.location,
    occurrence.isRecurring ? cal.messages.recurring : null,
    isPending ? cal.messages.saving : null,
  ]
    .filter(Boolean)
    .join(', ');

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const combo = `${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`;
    const action = KEY_ACTIONS[combo];
    if (action && editable) {
      if ((action === 'shorter' || action === 'longer') && (surface === 'month' || surface === 'all-day')) return;
      e.preventDefault();
      e.stopPropagation();
      cal.nudge(occurrence, action);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && cal.canDelete(occurrence)) {
      e.preventDefault();
      e.stopPropagation();
      cal.deleteEvent(occurrence);
      return;
    }
    // Let the grid handle arrow navigation; dnd-kit handles Space.
    if (draggable) move.listeners?.onKeyDown?.(e);
  };

  return (
    <div
      ref={move.setNodeRef}
      data-calendar-event=""
      data-occurrence-id={occurrence.occurrenceId}
      data-dragging={isDragging ? '' : undefined}
      data-pending={isPending ? '' : undefined}
      data-selected={isSelected ? '' : undefined}
      className={cn(
        'group/event @container relative min-w-0 select-none [container-type:size]',
        // The card stays in place while dragging; the ghost preview shows the target.
        'data-[dragging]:opacity-50',
        className,
      )}
      style={{ ...style, ['--event-color' as string]: color }}
    >
      <button
        type="button"
        {...(draggable ? move.attributes : {})}
        {...(draggable ? move.listeners : {})}
        onKeyDown={onKeyDown}
        aria-label={label}
        aria-roledescription={draggable ? cal.messages.draggableEvent : cal.messages.event}
        aria-describedby={draggable ? move.attributes['aria-describedby'] : undefined}
        aria-disabled={undefined}
        tabIndex={tabbable ? 0 : -1}
        data-calendar-focusable=""
        onClick={(e) => cal.openEvent(occurrence, e.currentTarget)}
        className={cn(
          'flex size-full min-h-6 overflow-hidden text-start text-xs outline-none',
          'rounded-md border-s-[3px] border-s-[var(--event-color)] bg-[color-mix(in_oklab,var(--event-color)_16%,var(--background))] text-foreground',
          'hover:bg-[color-mix(in_oklab,var(--event-color)_26%,var(--background))]',
          'focus-visible:ring-[3px] focus-visible:ring-ring/60',
          'group-data-[selected]/event:ring-2 group-data-[selected]/event:ring-[var(--event-color)]',
          'group-data-[pending]/event:animate-pulse',
          !isStart && 'rounded-s-none border-s-0',
          !isEnd && 'rounded-e-none',
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        )}
      >
        {cal.renderEvent ? cal.renderEvent(ctx) : <DefaultEventContent ctx={ctx} />}
      </button>
      {resizable && isEnd && draggable && (
        <div
          ref={resize.setNodeRef}
          {...resize.listeners}
          {...resize.attributes}
          aria-hidden
          tabIndex={-1}
          role={undefined}
          data-resize-handle={resizeAxis}
          className={cn(
            'absolute opacity-0 group-hover/event:opacity-100 after:block after:rounded-full after:bg-[var(--event-color)]',
            resizeAxis === 'vertical'
              ? 'inset-x-1 bottom-0 h-2 cursor-ns-resize after:mx-auto after:mt-0.5 after:h-1 after:w-6'
              : 'inset-y-0.5 end-0 w-2 cursor-ew-resize after:my-auto after:ms-0.5 after:h-full after:max-h-4 after:w-1 flex items-center',
          )}
        />
      )}
    </div>
  );
}

function resourceColor(resources: { id: string; color?: string }[], occ: EventOccurrence): string | undefined {
  const id = occ.resourceIds?.[0];
  return id ? resources.find((r) => r.id === id)?.color : undefined;
}

/**
 * Default card. Adapts to its own size via container queries:
 * - narrow (< 7rem): title only
 * - wider: time shown inline
 * - tall (time grid, >= 2.75rem high): stacked title / time / location
 */
function DefaultEventContent({ ctx }: { ctx: EventRenderContext }) {
  const { event, timeLabel, density } = ctx;
  return (
    <span
      className={cn(
        'flex w-full min-w-0 gap-x-1 px-1.5 py-0.5',
        density === 'compact' ? 'items-center' : 'items-start [@container_(min-height:2.75rem)]:flex-col',
      )}
    >
      <span className="flex min-w-0 items-center gap-1 font-medium">
        {event.isRecurring && <Repeat aria-hidden className="hidden size-3 shrink-0 @min-[9rem]:block" />}
        <span className="truncate">{event.title}</span>
      </span>
      {!event.allDay && (
        <span className="hidden shrink-0 truncate text-muted-foreground tabular-nums @min-[7rem]:inline">{timeLabel}</span>
      )}
      {event.location && density !== 'compact' && (
        <span className="hidden truncate text-muted-foreground [@container_(min-height:4rem)]:block">{event.location}</span>
      )}
    </span>
  );
}
