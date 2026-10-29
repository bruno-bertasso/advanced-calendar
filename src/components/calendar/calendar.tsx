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
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type Over,
} from '@dnd-kit/core';
import { addDays, addMinutes, addMonths, addWeeks, addYears, startOfDay } from 'date-fns';
import { lazy, memo, Suspense, useCallback, useMemo, useOptimistic, useRef, useState, useTransition, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  CalendarConfigContext,
  CalendarStateContext,
  DragStateContext,
  IDLE_DRAG,
  PREVIEW_SUFFIX,
  type CalendarConfigValue,
  type CalendarStateValue,
  type DragState,
  type EditorState,
  type NudgeAction,
  useCalendarConfig,
  useCalendarState,
  useDragState,
} from './calendar-context';
import { CalendarContextMenu } from './calendar-context-menu';
import { EventDetailsPopover } from './event-details-popover';
import { useIsNarrow } from './hooks/use-media-query';
import { useStableCallback } from './hooks/use-stable-callback';
import { isRangeBlocked } from './lib/availability';
import { formatDateTime, formatDayLabel, formatTitle, getLocalTimeZone, getRangeForView, inZone } from './lib/dates';
import { resolveDrop, type DragData, type DropData } from './lib/dnd';
import { createEventId, optimisticReducer, type OptimisticState } from './lib/optimistic';
import { expandEvents } from './lib/recurrence';
import { buildScopedChange } from './lib/recurrence-edit';
import { useLiveAnnouncer } from './live-region';
import { resolveMessages } from './messages';
import { RecurrenceScopeDialog, type ScopePrompt } from './recurrence-scope-dialog';
import type {
  CalendarEvent,
  CalendarProps,
  CalendarResource,
  CalendarView,
  EventChange,
  EventChangeType,
  EventOccurrence,
  RecurrenceScope,
  SlotSelectInfo,
} from './types';

// The editor is only needed once someone creates/edits: load it on demand.
const EventEditorDialog = lazy(() => import('./event-editor-dialog').then((m) => ({ default: m.EventEditorDialog })));

const DEFAULT_VIEWS: readonly CalendarView[] = ['month', 'week'];
const POINTER_OPTIONS = { activationConstraint: { distance: 5 } };
const EMPTY_PENDING: ReadonlySet<string> = new Set();
const EMPTY_BLOCKS: [] = [];
// Stable defaults: a fresh `[]` per render would invalidate every memo downstream.
const EMPTY_RESOURCES: CalendarResource[] = [];
/** Width of one timeline column in px (the column covers `timelineSlotMinutes`). */
export const TIMELINE_COLUMN_PX = 64;

function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void) {
  const [inner, setInner] = useState(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : inner;
  const set = useStableCallback((next: T) => {
    if (!isControlled) setInner(next);
    onChange?.(next);
  });
  return [current, set] as const;
}

interface ChangeInput {
  type: EventChangeType;
  occurrence: EventOccurrence;
  start: Date;
  end: Date;
  resourceIds?: string[];
  patch?: Partial<CalendarEvent>;
}

/**
 * Root of the compound calendar. Owns state (view, date, optimistic events), drag & drop,
 * live announcements, the shared event popover, context menu and dialogs.
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
    resources = EMPTY_RESOURCES,
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
    recurringEditScope = 'ask',
    businessHours,
    blockedRanges = EMPTY_BLOCKS,
    onEventChange,
    onEventCreate,
    onEventDelete,
    onBeforeEventChange,
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

  const messages = useMemo(() => resolveMessages(props.messages), [props.messages]);
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

  const isBlocked = useCallback(
    (start: Date, end: Date, resourceIds?: readonly string[]) => isRangeBlocked(blockedRanges, start, end, resourceIds),
    [blockedRanges],
  );

  const when = (d: Date, allDay?: boolean) =>
    allDay ? formatDayLabel(d, timeZone, locale) : formatDateTime(d, timeZone, locale);

  // ---- Recurrence scope prompt ----------------------------------------------------------
  const [scopePrompt, setScopePrompt] = useState<ScopePrompt | null>(null);
  const askScope = useStableCallback(
    (occ: EventOccurrence, action: 'edit' | 'delete'): Promise<RecurrenceScope | null> => {
      if (!occ.isRecurring) return Promise.resolve('all');
      if (recurringEditScope !== 'ask') return Promise.resolve(recurringEditScope);
      const options: RecurrenceScope[] =
        action === 'edit'
          ? ['this', 'following', 'all']
          : [...(onEventChange ? (['this', 'following'] as const) : []), ...(onEventDelete ? (['all'] as const) : [])];
      if (options.length <= 1) return Promise.resolve(options[0] ?? null);
      return new Promise((resolve) =>
        setScopePrompt({
          action,
          title: occ.title,
          options,
          resolve: (scope) => {
            setScopePrompt(null);
            resolve(scope);
          },
        }),
      );
    },
  );

  // ---- Applying changes ---------------------------------------------------------------------
  /** Validate (blocked ranges, onBeforeEventChange), then apply optimistically and persist. */
  const applyChange = useStableCallback((change: EventChange, success: string) => {
    if (change.type !== 'delete') {
      const target = change.created?.[0] ?? change.nextEvent;
      if (isBlocked(change.start, change.end, target.resourceIds)) {
        announce(messages.announce.blocked, 'assertive');
        return;
      }
    }
    const persist = () =>
      startTransition(async () => {
        addOptimistic({ kind: 'change', change });
        try {
          if (change.type === 'delete' && change.scope === 'all') await onEventDelete?.(change.event);
          else await onEventChange?.(change);
          announce(success);
        } catch {
          announce(
            change.type === 'delete'
              ? messages.announce.deleteFailed(change.event.title)
              : messages.announce.updateFailed(change.event.title),
            'assertive',
          );
        }
      });
    const verdictOk = (v: boolean | string | void) => v === undefined || v === true;
    const reject = (v: boolean | string | void) =>
      announce(messages.announce.rejected(change.event.title, typeof v === 'string' ? v : undefined), 'assertive');

    const verdict = onBeforeEventChange?.(change);
    if (verdict instanceof Promise) {
      verdict.then((v) => (verdictOk(v) ? persist() : reject(v)), () => reject(false));
    } else if (verdictOk(verdict)) {
      persist();
    } else {
      reject(verdict);
    }
  });

  const requestChange = useStableCallback(async (input: ChangeInput) => {
    const series = events.find((e) => e.id === input.occurrence.seriesId);
    if (!series) return;
    const scope = await askScope(input.occurrence, input.type === 'delete' ? 'delete' : 'edit');
    if (!scope) {
      if (input.type !== 'delete') announce(messages.announce.returned(input.occurrence.title));
      return;
    }
    const change = buildScopedChange({ ...input, series, scope, defaultTimeZone: timeZone });
    const t = input.patch?.title ?? input.occurrence.title;
    const success =
      input.type === 'delete'
        ? messages.announce.deleted(t)
        : input.type === 'edit'
          ? messages.announce.updated(t)
          : input.type === 'resize'
            ? input.occurrence.allDay
              ? messages.announce.lastsUntil(t, formatDayLabel(new Date(input.end.getTime() - 1), timeZone, locale))
              : messages.announce.resized(t, when(input.end))
            : messages.announce.moved(t, when(input.start, input.occurrence.allDay));
    applyChange(change, success);
  });

  const commit = useStableCallback(
    (type: EventChangeType, occurrence: EventOccurrence, start: Date, end: Date, resourceIds?: string[]) =>
      void requestChange({ type, occurrence, start, end, ...(resourceIds ? { resourceIds } : {}) }),
  );

  /** Persist an edit from the dialog. `next` holds the edited occurrence's times + fields. */
  const commitEdit = useStableCallback((occurrence: EventOccurrence, next: CalendarEvent) => {
    const { id: _id, start, end, ...patch } = next;
    void _id;
    void requestChange({ type: 'edit', occurrence, start, end, resourceIds: next.resourceIds ?? [], patch });
  });

  const createEvent = useStableCallback((event: CalendarEvent) => {
    if (!onEventCreate) return;
    if (isBlocked(event.start, event.end, event.resourceIds)) {
      announce(messages.announce.blocked, 'assertive');
      return;
    }
    startTransition(async () => {
      addOptimistic({ kind: 'create', event });
      try {
        await onEventCreate(event);
        announce(messages.announce.created(event.title, when(event.start, event.allDay)));
      } catch {
        announce(messages.announce.createFailed(event.title), 'assertive');
      }
    });
  });

  const deleteEvent = useStableCallback((occurrence: EventOccurrence) => {
    setSelected(null);
    void requestChange({ type: 'delete', occurrence, start: occurrence.start, end: occurrence.end });
  });

  const duplicateEvent = useStableCallback((occurrence: EventOccurrence) => {
    const series = events.find((e) => e.id === occurrence.seriesId);
    if (!series) return;
    // Duplicate the clicked occurrence as a standalone event.
    createEvent({
      ...series,
      rrule: undefined,
      exdates: undefined,
      recurringEventId: undefined,
      originalStart: undefined,
      id: createEventId(),
      title: `${series.title}${messages.copySuffix}`,
      start: occurrence.start,
      end: occurrence.end,
    });
  });

  const canEdit = useStableCallback((event: CalendarEvent) => Boolean(onEventChange) && event.editable !== false);
  const canDelete = useStableCallback(
    (event: CalendarEvent) => (Boolean(onEventDelete) || Boolean(onEventChange && event.rrule)) && event.editable !== false,
  );
  const canCreate = Boolean(onEventCreate);

  const nudge = useStableCallback((occ: EventOccurrence, action: NudgeAction) => {
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
  });

  // ---- Navigation -------------------------------------------------------------------------
  const navigate = useStableCallback((dir: 'prev' | 'next' | 'today') => {
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
  });

  // ---- Event popover ----------------------------------------------------------------------
  const [selected, setSelected] = useState<{ occ: EventOccurrence; anchor: HTMLElement } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openEvent = useStableCallback((occ: EventOccurrence, anchor: HTMLElement) => {
    onEventClick?.(occ);
    if (disableEventPopover) return;
    returnFocusRef.current = anchor;
    setSelected({ occ, anchor });
  });
  const selectedLive = selected
    ? (occurrences.find((o) => o.occurrenceId === selected.occ.occurrenceId) ?? selected.occ)
    : null;

  // ---- Editor dialog ----------------------------------------------------------------------
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const editorEnabled = !disableEventEditor;
  const showEditor = (state: EditorState) => {
    setEditorLoaded(true);
    setEditor(state);
  };
  const openEditor = useStableCallback((state: EditorState) => {
    if (!editorEnabled) return;
    if (state.mode === 'create' && !onEventCreate) return;
    if (state.mode === 'edit' && !onEventChange) return;
    setSelected(null);
    showEditor(state);
  });

  /** Slot activation: notify the consumer and open the create dialog when enabled. */
  const requestSlot = useStableCallback((slot: SlotSelectInfo) => {
    if (isBlocked(slot.start, slot.end, slot.resourceId ? [slot.resourceId] : undefined)) {
      announce(messages.announce.blocked, 'assertive');
      return;
    }
    onSlotSelect?.(slot);
    if (onEventCreate && editorEnabled) showEditor({ mode: 'create', slot });
  });
  const slotHandler = onSlotSelect || (onEventCreate && editorEnabled) ? requestSlot : undefined;

  // ---- Drag & drop ------------------------------------------------------------------------
  const pxPerMinute = Math.max(24 / slotDuration, 1.2);
  const timelinePxPerMinute = TIMELINE_COLUMN_PX / timelineSlotMinutes;
  const [dragState, setDragState] = useState<DragState>(IDLE_DRAG);

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

  // Options must be referentially stable or dnd-kit recreates sensors (and re-renders every
  // droppable) on each render.
  const keyboardOptions = useMemo(
    () => ({
      coordinateGetter,
      // Enter is reserved for opening event details; Space picks up / drops.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
    [coordinateGetter],
  );
  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTIONS), useSensor(KeyboardSensor, keyboardOptions));

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
  }, []);

  const resolve = (active: Active, over: Over | null, delta: { x: number; y: number }) => {
    const drag = active.data.current as DragData | undefined;
    const drop = over?.data.current as DropData | undefined;
    if (!drag || !drop) return { drag, result: null };
    // The timeline's time axis runs right-to-left in RTL.
    const d = direction === 'rtl' && drag.surface === 'timeline' ? { ...delta, x: -delta.x } : delta;
    return { drag, result: resolveDrop(drag, drop, d, { timeZone, slotDuration, pxPerMinute, timelinePxPerMinute }) };
  };

  /** Live drop preview: a ghost occurrence at the snapped target. */
  const updatePreview = useStableCallback(({ active, over, delta }: DragMoveEvent | DragOverEvent) => {
    const { drag, result } = resolve(active, over, delta);
    const preview: EventOccurrence | null =
      drag && result
        ? {
            ...drag.occurrence,
            start: result.start,
            end: result.end,
            resourceIds: result.resourceIds ?? drag.occurrence.resourceIds,
            occurrenceId: `${drag.occurrence.occurrenceId}${PREVIEW_SUFFIX}`,
          }
        : null;
    setDragState((s) => {
      const p = s.preview;
      const same =
        p === preview ||
        (p &&
          preview &&
          p.start.getTime() === preview.start.getTime() &&
          p.end.getTime() === preview.end.getTime() &&
          (p.resourceIds ?? []).join() === (preview.resourceIds ?? []).join());
      return same ? s : { ...s, preview };
    });
  });

  const onDragStart = useStableCallback(({ active }: DragStartEvent) => {
    const data = active.data.current as DragData;
    setSelected(null);
    setDragState({ activeId: String(active.id), kind: data.kind, preview: null });
    announce(
      data.kind === 'move' ? messages.announce.pickedUp(data.occurrence.title) : messages.announce.resizing(data.occurrence.title),
    );
  });

  const onDragEnd = useStableCallback(({ active, over, delta }: DragEndEvent) => {
    setDragState(IDLE_DRAG);
    const { drag, result } = resolve(active, over, delta);
    if (!drag || !over) {
      announce(messages.announce.dropCancelled);
      return;
    }
    if (!result) {
      announce(messages.announce.returned(drag.occurrence.title));
      return;
    }
    commit(drag.kind, drag.occurrence, result.start, result.end, result.resourceIds);
  });

  const onDragCancel = useStableCallback(() => {
    setDragState(IDLE_DRAG);
    announce(messages.announce.dragCancelled);
  });
  const accessibility = useMemo(
    () => ({
      // We announce through our own live region (consistent wording + commit results).
      announcements: {
        onDragStart: () => undefined,
        onDragOver: () => undefined,
        onDragEnd: () => undefined,
        onDragCancel: () => undefined,
      },
      screenReaderInstructions: { draggable: messages.dragInstructions },
    }),
    [messages.dragInstructions],
  );

  // ---- Context values ---------------------------------------------------------------------
  const config = useMemo<CalendarConfigValue>(
    () => ({
      timeZone,
      locale,
      weekStartsOn,
      direction,
      slotDuration,
      pxPerMinute,
      timelineSlotMinutes,
      timelinePxPerMinute,
      agendaDays,
      dayStartHour,
      dayEndHour,
      scrollToHour,
      maxEventsPerCell,
      messages,
      businessHours,
      blockedRanges,
      isBlocked,
      renderEvent,
      renderCell,
      renderResourceHeader,
      setView,
      setCursor: setDate,
      navigate,
      canEdit,
      canDelete,
      openEvent,
      openEditor,
      deleteEvent,
      duplicateEvent,
      nudge,
      onSlotSelect: slotHandler,
      announce,
      canCreate,
    }),
    [
      timeZone, locale, weekStartsOn, direction, slotDuration, pxPerMinute, timelineSlotMinutes, timelinePxPerMinute,
      agendaDays, dayStartHour, dayEndHour, scrollToHour, maxEventsPerCell, messages, businessHours, blockedRanges,
      isBlocked, renderEvent, renderCell, renderResourceHeader, setView, setDate, navigate, canEdit, canDelete,
      openEvent, openEditor, deleteEvent, duplicateEvent, nudge, slotHandler, announce, canCreate,
    ],
  );

  const pendingIds = optimistic.pendingIds;
  const state = useMemo<CalendarStateValue>(
    () => ({
      view,
      views,
      cursor,
      range,
      today,
      title,
      events: optimistic.events,
      occurrences,
      resources,
      visibleResources,
      isPending: (id) => pendingIds.has(id),
      selectedOccurrenceId: selected?.occ.occurrenceId ?? null,
      isNarrow,
    }),
    [view, views, cursor, range, today, title, optimistic.events, occurrences, resources, visibleResources, pendingIds, selected, isNarrow],
  );

  return (
    <DirectionProvider direction={direction}>
      <CalendarConfigContext value={config}>
        <CalendarStateContext value={state}>
          <DragStateContext value={dragState}>
            <DndShell
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={onDragStart}
              onDragMove={updatePreview}
              onDragOver={updatePreview}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
              accessibility={accessibility}
            >
              <CalendarSection className={className} aria-label={props['aria-label']}>
                {children}
              </CalendarSection>
            </DndShell>
            {regions}
            <EventDetailsPopover
              occurrence={selectedLive}
              anchor={selected?.anchor ?? null}
              onClose={() => setSelected(null)}
              returnFocusRef={returnFocusRef}
            />
            {editorEnabled && editorLoaded && (
              <Suspense fallback={null}>
                <EventEditorDialog
                  state={editor}
                  onClose={() => setEditor(null)}
                  onCreate={createEvent}
                  onEdit={commitEdit}
                  onDelete={deleteEvent}
                />
              </Suspense>
            )}
            <RecurrenceScopeDialog prompt={scopePrompt} />
          </DragStateContext>
        </CalendarStateContext>
      </CalendarConfigContext>
    </DirectionProvider>
  );
}

/**
 * dnd-kit re-renders every `useDraggable`/`useDroppable` consumer whenever `DndContext`
 * renders. Memoising it with stable props means calendar state changes (selection, popovers,
 * optimistic updates) no longer re-render hundreds of droppable slot cells.
 */
const DndShell = memo(function DndShell(props: ComponentProps<typeof DndContext>) {
  return <DndContext {...props} />;
});

/** The outer region; reads state itself so its parent element stays referentially stable. */
const CalendarSection = memo(function CalendarSection({
  className,
  children,
  'aria-label': ariaLabel,
}: {
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
}) {
  const { direction, messages } = useCalendarConfig();
  const { view, isNarrow } = useCalendarState();
  const { activeId } = useDragState();
  return (
    <section
      dir={direction}
      aria-label={ariaLabel ?? messages.calendar}
      data-view={view}
      data-narrow={isNarrow ? '' : undefined}
      data-dragging={activeId ? '' : undefined}
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground', className)}
    >
      <CalendarContextMenu>{children}</CalendarContextMenu>
    </section>
  );
});
