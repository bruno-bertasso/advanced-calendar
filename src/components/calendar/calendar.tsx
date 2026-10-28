import { TZDate } from '@date-fns/tz';
import { DirectionProvider } from '@base-ui/react/direction-provider';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type Modifier,
} from '@dnd-kit/core';
import { addDays, addMinutes, addMonths, addWeeks, addYears, startOfDay } from 'date-fns';
import { useCallback, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import {
  CalendarContext,
  DragStateContext,
  type CalendarContextValue,
  type DragState,
  type EditorState,
  type NudgeAction,
} from './calendar-context';
import { CalendarContextMenu } from './calendar-context-menu';
import { EventDetailsPopover } from './event-details-popover';
import { EventEditorDialog } from './event-editor-dialog';
import { useIsNarrow } from './hooks/use-media-query';
import { formatDateTime, formatDayLabel, formatTitle, getLocalTimeZone, getRangeForView, inZone } from './lib/dates';
import { resolveDrop, type DragData, type DropData } from './lib/dnd';
import {
  buildEventChange,
  createEventId,
  optimisticReducer,
  type OptimisticState,
} from './lib/optimistic';
import { expandEvents } from './lib/recurrence';
import { useLiveAnnouncer } from './live-region';
import type {
  CalendarEvent,
  CalendarProps,
  CalendarView,
  EventChange,
  EventChangeType,
  EventOccurrence,
  SlotSelectInfo,
} from './types';

const DEFAULT_VIEWS: readonly CalendarView[] = ['month', 'week'];
const EMPTY_PENDING: ReadonlySet<string> = new Set();
/** Width of one timeline column in px (the column covers `timelineSlotMinutes`). */
export const TIMELINE_COLUMN_PX = 64;

function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void) {
  const [inner, setInner] = useState(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : inner;
  const set = useCallback(
    (next: T) => {
      if (!isControlled) setInner(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );
  return [current, set] as const;
}

/**
 * Root of the compound calendar. Owns state (view, date, optimistic events), drag & drop,
 * live announcements, the shared event popover, context menu and editor dialog.
 *
 * @example
 * <Calendar events={events} onEventChange={save}>
 *   <CalendarHeader />
 *   <CalendarBody />
 * </Calendar>
 */
export function Calendar(props: CalendarProps) {
  const {
    events,
    resources = [],
    visibleResourceIds,
    views = DEFAULT_VIEWS,
    timeZone = getLocalTimeZone(),
    weekStartsOn = 0,
    locale,
    slotDuration = 30,
    dayStartHour = 0,
    dayEndHour = 24,
    scrollToHour = 8,
    maxEventsPerCell = 3,
    agendaDays = 30,
    timelineSlotMinutes = 60,
    direction = 'ltr',
    onEventChange,
    onEventCreate,
    onEventDelete,
    onEventClick,
    onSlotSelect,
    renderEvent,
    renderCell,
    renderResourceHeader,
    disableEventPopover = false,
    disableEventEditor = false,
    className,
    children,
  } = props;

  const [view, setView] = useControllable<CalendarView>(props.view, props.defaultView ?? views[0] ?? 'month', props.onViewChange);
  const [date, setDate] = useControllable<Date>(props.date, props.defaultDate ?? new Date(), props.onDateChange);
  const isNarrow = useIsNarrow();
  const { announce, regions } = useLiveAnnouncer();

  const cursor = useMemo(() => startOfDay(inZone(date, timeZone)), [date, timeZone]);
  const today = useMemo(() => startOfDay(inZone(Date.now(), timeZone)), [timeZone]);
  const range = useMemo(
    () => getRangeForView(view, cursor, weekStartsOn, { narrow: isNarrow, agendaDays }),
    [view, cursor, weekStartsOn, isNarrow, agendaDays],
  );
  const title = formatTitle(view, range, cursor, timeZone, locale);

  // ---- Optimistic events (React 19) ------------------------------------------------------
  const baseState = useMemo<OptimisticState>(() => ({ events, pendingIds: EMPTY_PENDING }), [events]);
  const [optimistic, addOptimistic] = useOptimistic(baseState, optimisticReducer);
  const [, startTransition] = useTransition();

  const occurrences = useMemo(
    () => expandEvents(optimistic.events, range.start, range.end, timeZone),
    [optimistic.events, range.start, range.end, timeZone],
  );

  const visibleResources = useMemo(
    () => (visibleResourceIds ? resources.filter((r) => visibleResourceIds.includes(r.id)) : []),
    [resources, visibleResourceIds],
  );

  /** Run a change optimistically; React discards the optimistic state if the promise rejects. */
  const runChange = useCallback(
    (change: EventChange, success: string) => {
      startTransition(async () => {
        addOptimistic({ kind: 'change', change });
        try {
          await onEventChange?.(change);
          announce(success);
        } catch {
          announce(`Could not update ${change.event.title}. Change reverted.`, 'assertive');
        }
      });
    },
    [onEventChange, addOptimistic, announce],
  );

  const commit = useCallback(
    (type: EventChangeType, occurrence: EventOccurrence, start: Date, end: Date, resourceIds?: string[]) => {
      const series = events.find((e) => e.id === occurrence.seriesId);
      if (!series) return;
      const change = buildEventChange(type, series, occurrence, start, end, resourceIds);
      runChange(
        change,
        type === 'resize'
          ? occurrence.allDay
            ? `${occurrence.title} now lasts until ${formatDayLabel(new Date(end.getTime() - 1), timeZone, locale)}.`
            : `${occurrence.title} now ends ${formatDateTime(end, timeZone, locale)}.`
          : `${occurrence.title} moved to ${
              occurrence.allDay ? formatDayLabel(start, timeZone, locale) : formatDateTime(start, timeZone, locale)
            }.`,
      );
    },
    [events, runChange, timeZone, locale],
  );

  /** Persist an edit from the dialog. `next` holds the edited occurrence's times + fields. */
  const commitEdit = useCallback(
    (occurrence: EventOccurrence, next: CalendarEvent) => {
      const series = events.find((e) => e.id === occurrence.seriesId);
      if (!series) return;
      const base = buildEventChange('edit', series, occurrence, next.start, next.end, next.resourceIds);
      // Field edits replace the series' fields; time edits shift the series by the same delta.
      const change: EventChange = {
        ...base,
        nextEvent: { ...next, id: series.id, start: base.nextEvent.start, end: base.nextEvent.end },
      };
      runChange(change, `${next.title} updated.`);
    },
    [events, runChange],
  );

  const createEvent = useCallback(
    (event: CalendarEvent) => {
      if (!onEventCreate) return;
      startTransition(async () => {
        addOptimistic({ kind: 'create', event });
        try {
          await onEventCreate(event);
          announce(`${event.title} created for ${formatDateTime(event.start, timeZone, locale)}.`);
        } catch {
          announce(`Could not create ${event.title}.`, 'assertive');
        }
      });
    },
    [onEventCreate, addOptimistic, announce, timeZone, locale],
  );

  const deleteEvent = useCallback(
    (occurrence: EventOccurrence) => {
      const series = events.find((e) => e.id === occurrence.seriesId);
      if (!series || !onEventDelete) return;
      setSelected(null);
      startTransition(async () => {
        addOptimistic({ kind: 'delete', event: series });
        try {
          await onEventDelete(series);
          announce(`${series.title} deleted.`);
        } catch {
          announce(`Could not delete ${series.title}. It has been restored.`, 'assertive');
        }
      });
    },
    [events, onEventDelete, addOptimistic, announce],
  );

  const duplicateEvent = useCallback(
    (occurrence: EventOccurrence) => {
      const series = events.find((e) => e.id === occurrence.seriesId);
      if (!series) return;
      // Duplicate the clicked occurrence as a standalone event.
      createEvent({
        ...series,
        rrule: undefined,
        exdates: undefined,
        id: createEventId(), title: `${series.title} (copy)`,
        start: occurrence.start,
        end: occurrence.end,
      });
    },
    [events, createEvent],
  );

  const canEdit = useCallback(
    (event: CalendarEvent) => Boolean(onEventChange) && event.editable !== false,
    [onEventChange],
  );
  const canDelete = useCallback(
    (event: CalendarEvent) => Boolean(onEventDelete) && event.editable !== false,
    [onEventDelete],
  );
  const canCreate = Boolean(onEventCreate);

  const nudge = useCallback(
    (occ: EventOccurrence, action: NudgeAction) => {
      const s = inZone(occ.start, timeZone);
      const e = inZone(occ.end, timeZone);
      const step = slotDuration;
      const toDate = (d: TZDate) => new Date(d.getTime());
      switch (action) {
        case 'earlier':
        case 'later': {
          const m = action === 'earlier' ? -step : step;
          return commit('move', occ, toDate(addMinutes(s, m)), toDate(addMinutes(e, m)));
        }
        case 'prev-day':
        case 'next-day': {
          const d = action === 'prev-day' ? -1 : 1;
          return commit('move', occ, toDate(addDays(s, d)), toDate(addDays(e, d)));
        }
        case 'shorter':
        case 'longer': {
          const next = addMinutes(e, action === 'shorter' ? -step : step);
          if (next.getTime() - s.getTime() < step * 60_000) return;
          return commit('resize', occ, occ.start, toDate(next));
        }
      }
    },
    [commit, slotDuration, timeZone],
  );

  // ---- Navigation -------------------------------------------------------------------------
  const navigate = useCallback(
    (dir: 'prev' | 'next' | 'today') => {
      if (dir === 'today') {
        setDate(new Date());
        return;
      }
      const sign = dir === 'next' ? 1 : -1;
      let next: Date;
      switch (view) {
        case 'year':
          next = addYears(cursor, sign);
          break;
        case 'month':
          next = addMonths(cursor, sign);
          break;
        case 'agenda':
          next = addDays(cursor, sign * agendaDays);
          break;
        case 'day':
          next = addDays(cursor, sign);
          break;
        default:
          next = isNarrow ? addDays(cursor, sign) : addWeeks(cursor, sign);
      }
      setDate(new Date(next.getTime()));
    },
    [view, cursor, isNarrow, agendaDays, setDate],
  );

  // ---- Event popover ----------------------------------------------------------------------
  const [selected, setSelected] = useState<{ occ: EventOccurrence; anchor: HTMLElement } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openEvent = useCallback(
    (occ: EventOccurrence, anchor: HTMLElement) => {
      onEventClick?.(occ);
      if (disableEventPopover) return;
      returnFocusRef.current = anchor;
      setSelected({ occ, anchor });
    },
    [onEventClick, disableEventPopover],
  );
  const selectedLive = selected
    ? (occurrences.find((o) => o.occurrenceId === selected.occ.occurrenceId) ?? selected.occ)
    : null;

  // ---- Editor dialog ----------------------------------------------------------------------
  const [editor, setEditor] = useState<EditorState | null>(null);
  const editorEnabled = !disableEventEditor;
  const openEditor = useCallback(
    (state: EditorState) => {
      if (!editorEnabled) return;
      if (state.mode === 'create' && !onEventCreate) return;
      if (state.mode === 'edit' && !onEventChange) return;
      setSelected(null);
      setEditor(state);
    },
    [editorEnabled, onEventCreate, onEventChange],
  );

  /** Slot activation: notify the consumer and open the create dialog when enabled. */
  const requestSlot = useCallback(
    (slot: SlotSelectInfo) => {
      onSlotSelect?.(slot);
      if (onEventCreate && editorEnabled) setEditor({ mode: 'create', slot });
    },
    [onSlotSelect, onEventCreate, editorEnabled],
  );
  const slotHandler = onSlotSelect || (onEventCreate && editorEnabled) ? requestSlot : undefined;

  // ---- Drag & drop ------------------------------------------------------------------------
  const pxPerMinute = Math.max(24 / slotDuration, 1.2);
  const timelinePxPerMinute = TIMELINE_COLUMN_PX / timelineSlotMinutes;
  const [dragState, setDragState] = useState<DragState>({ activeId: null, kind: null, resizeMinutes: 0 });

  const coordinateGetter = useMemo<KeyboardCoordinateGetter>(
    () => (event, { currentCoordinates, context }) => {
      const surface = (context.active?.data.current as DragData | undefined)?.surface;
      let dx: number;
      let dy: number;
      if (surface === 'timeline') {
        dx = slotDuration * timelinePxPerMinute;
        dy = document.querySelector<HTMLElement>('[data-timeline-row]')?.getBoundingClientRect().height || 48;
      } else {
        const cell = document.querySelector<HTMLElement>(
          surface === 'month' ? '[data-calendar-month-cell]' : '[data-calendar-day-column]',
        );
        const rect = cell?.getBoundingClientRect();
        dx = rect?.width || 100;
        dy = surface === 'month' ? rect?.height || 100 : slotDuration * pxPerMinute;
      }
      switch (event.code) {
        case 'ArrowRight':
          return { ...currentCoordinates, x: currentCoordinates.x + dx };
        case 'ArrowLeft':
          return { ...currentCoordinates, x: currentCoordinates.x - dx };
        case 'ArrowDown':
          return { ...currentCoordinates, y: currentCoordinates.y + dy };
        case 'ArrowUp':
          return { ...currentCoordinates, y: currentCoordinates.y - dy };
        default:
          return undefined;
      }
    },
    [slotDuration, pxPerMinute, timelinePxPerMinute],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter,
      // Enter is reserved for opening event details; Space picks up / drops.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
  }, []);

  /**
   * Snap movement to whole slots. dnd-kit's `delta` in drag events includes modifier output,
   * so resize drags keep their raw transform (cards ignore it and preview via DragState).
   */
  const snapModifier = useCallback<Modifier>(
    ({ transform, active }) => {
      const data = active?.data.current as DragData | undefined;
      if (!data || data.kind === 'resize') return transform;
      if (data.surface === 'time-grid') {
        const slotPx = slotDuration * pxPerMinute;
        return { ...transform, y: Math.round(transform.y / slotPx) * slotPx };
      }
      if (data.surface === 'timeline') {
        const slotPx = slotDuration * timelinePxPerMinute;
        return { ...transform, x: Math.round(transform.x / slotPx) * slotPx };
      }
      return transform;
    },
    [slotDuration, pxPerMinute, timelinePxPerMinute],
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current as DragData;
    setSelected(null);
    setDragState({ activeId: String(active.id), kind: data.kind, resizeMinutes: 0 });
    announce(
      data.kind === 'move'
        ? `Picked up ${data.occurrence.title}. Use arrow keys to move, Space to drop, Escape to cancel.`
        : `Resizing ${data.occurrence.title}.`,
    );
  };

  const onDragMove = ({ active, delta }: DragMoveEvent) => {
    const data = active.data.current as DragData;
    if (data.kind !== 'resize') return;
    const minutes =
      data.surface === 'timeline'
        ? Math.round(((direction === 'rtl' ? -1 : 1) * delta.x) / timelinePxPerMinute / slotDuration) * slotDuration
        : data.surface === 'time-grid'
          ? Math.round(delta.y / pxPerMinute / slotDuration) * slotDuration
          : 0;
    setDragState((s) => (s.resizeMinutes === minutes ? s : { ...s, resizeMinutes: minutes }));
  };

  const resetDrag = () => setDragState({ activeId: null, kind: null, resizeMinutes: 0 });

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    resetDrag();
    const drag = active.data.current as DragData | undefined;
    const drop = over?.data.current as DropData | undefined;
    if (!drag || !drop) {
      announce('Drop cancelled.');
      return;
    }
    // The timeline's time axis runs right-to-left in RTL.
    const d = direction === 'rtl' && drag.surface === 'timeline' ? { ...delta, x: -delta.x } : delta;
    const result = resolveDrop(drag, drop, d, { timeZone, slotDuration, pxPerMinute, timelinePxPerMinute });
    if (!result) {
      announce(`${drag.occurrence.title} returned to its original time.`);
      return;
    }
    commit(drag.kind, drag.occurrence, result.start, result.end, result.resourceIds);
  };

  const onDragCancel = () => {
    resetDrag();
    announce('Drag cancelled. Event returned to its original time.');
  };

  const pendingIds = optimistic.pendingIds;
  const ctx = useMemo<CalendarContextValue>(
    () => ({
      view,
      views,
      setView,
      cursor,
      setCursor: setDate,
      navigate,
      range,
      today,
      title,
      timeZone,
      locale,
      weekStartsOn,
      direction,
      slotDuration,
      pxPerMinute,
      timelineSlotMinutes,
      timelinePxPerMinute,
      dayStartHour,
      dayEndHour,
      scrollToHour,
      maxEventsPerCell,
      agendaDays,
      events: optimistic.events,
      occurrences,
      resources,
      visibleResources,
      isPending: (id) => pendingIds.has(id),
      canEdit,
      canDelete,
      canCreate,
      selectedOccurrenceId: selected?.occ.occurrenceId ?? null,
      openEvent,
      openEditor,
      deleteEvent,
      duplicateEvent,
      onSlotSelect: slotHandler,
      nudge,
      renderEvent,
      renderCell,
      renderResourceHeader,
      announce,
      isNarrow,
    }),
    [
      view, views, setView, cursor, setDate, navigate, range, today, title, timeZone, locale, weekStartsOn, direction,
      slotDuration, pxPerMinute, timelineSlotMinutes, timelinePxPerMinute, dayStartHour, dayEndHour, scrollToHour,
      maxEventsPerCell, agendaDays, optimistic.events, occurrences, resources, visibleResources, pendingIds, canEdit,
      canDelete, canCreate, selected, openEvent, openEditor, deleteEvent, duplicateEvent, slotHandler, nudge,
      renderEvent, renderCell, renderResourceHeader, announce, isNarrow,
    ],
  );

  return (
    <DirectionProvider direction={direction}>
      <CalendarContext value={ctx}>
        <DragStateContext value={dragState}>
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            modifiers={[snapModifier]}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
            accessibility={{
              // We announce through our own live region (consistent wording + commit results).
              announcements: {
                onDragStart: () => undefined,
                onDragOver: () => undefined,
                onDragEnd: () => undefined,
                onDragCancel: () => undefined,
              },
              screenReaderInstructions: {
                draggable:
                  'Press Enter to view details. Press Space to pick up, arrow keys to move, Space to drop, Escape to cancel. Alt plus arrow keys moves by one slot or day; Shift plus Up or Down arrow changes duration; Delete removes the event.',
              },
            }}
          >
            <section
              dir={direction}
              aria-label={props['aria-label'] ?? 'Calendar'}
              data-view={view}
              data-narrow={isNarrow ? '' : undefined}
              className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground', className)}
            >
              <CalendarContextMenu>{children}</CalendarContextMenu>
            </section>
            {regions}
            <EventDetailsPopover
              occurrence={selectedLive}
              anchor={selected?.anchor ?? null}
              onClose={() => setSelected(null)}
              returnFocusRef={returnFocusRef}
            />
            {editorEnabled && (
              <EventEditorDialog
                state={editor}
                onClose={() => setEditor(null)}
                onCreate={createEvent}
                onEdit={commitEdit}
                onDelete={deleteEvent}
              />
            )}
          </DndContext>
        </DragStateContext>
      </CalendarContext>
    </DirectionProvider>
  );
}
