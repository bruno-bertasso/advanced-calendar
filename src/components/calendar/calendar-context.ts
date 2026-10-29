import type { TZDate } from '@date-fns/tz';
import { createContext, use, useMemo } from 'react';
import type { VisibleRange } from './lib/dates';
import type { CalendarMessages } from './messages';
import type {
  BlockedRange,
  BusinessHours,
  CalendarEvent,
  CalendarProps,
  CalendarResource,
  CalendarView,
  EventOccurrence,
  SlotSelectInfo,
  WeekStartsOn,
} from './types';

export type EditorState =
  | { mode: 'create'; slot: SlotSelectInfo }
  | { mode: 'edit'; occurrence: EventOccurrence };

export type NudgeAction = 'earlier' | 'later' | 'prev-day' | 'next-day' | 'shorter' | 'longer';

/**
 * Configuration + stable callbacks. Changes rarely (only when the corresponding props
 * change), so heavy leaf components such as time-grid slot cells subscribe to this only.
 */
export interface CalendarConfigValue {
  timeZone: string;
  locale: string | undefined;
  weekStartsOn: WeekStartsOn;
  direction: 'ltr' | 'rtl';
  slotDuration: 15 | 30 | 60;
  pxPerMinute: number;
  timelineSlotMinutes: number;
  /** Horizontal scale of the timeline view. */
  timelinePxPerMinute: number;
  agendaDays: number;
  dayStartHour: number;
  dayEndHour: number;
  scrollToHour: number;
  maxEventsPerCell: number;
  messages: CalendarMessages;
  businessHours: BusinessHours | undefined;
  blockedRanges: readonly BlockedRange[];
  /** Whether [start, end) overlaps a blocked range for any of the given resources. */
  isBlocked: (start: Date, end: Date, resourceIds?: readonly string[]) => boolean;

  renderEvent: CalendarProps['renderEvent'];
  renderCell: CalendarProps['renderCell'];
  renderResourceHeader: CalendarProps['renderResourceHeader'];

  // Stable callbacks (identity never changes).
  setView: (view: CalendarView) => void;
  setCursor: (date: Date) => void;
  navigate: (direction: 'prev' | 'next' | 'today') => void;
  canEdit: (event: CalendarEvent) => boolean;
  canDelete: (event: CalendarEvent) => boolean;
  openEvent: (occurrence: EventOccurrence, anchor: HTMLElement) => void;
  openEditor: (state: EditorState) => void;
  deleteEvent: (occurrence: EventOccurrence) => void;
  duplicateEvent: (occurrence: EventOccurrence) => void;
  /** Keyboard / single-pointer alternative to drag & resize (WCAG 2.5.7). */
  nudge: (occurrence: EventOccurrence, action: NudgeAction) => void;
  /** Defined when slot activation does something (consumer callback and/or create dialog). */
  onSlotSelect: CalendarProps['onSlotSelect'];
  announce: (message: string, politeness?: 'polite' | 'assertive') => void;
  /** Whether new events can be created (onEventCreate provided). */
  canCreate: boolean;
}

/** Frequently-changing state (navigation, data, selection). */
export interface CalendarStateValue {
  view: CalendarView;
  views: readonly CalendarView[];
  /** Focused/anchor date, in the display zone. */
  cursor: TZDate;
  range: VisibleRange;
  today: TZDate;
  title: string;
  /** Base events with optimistic edits applied. */
  events: CalendarEvent[];
  /** Expanded occurrences for the visible range. */
  occurrences: EventOccurrence[];
  resources: CalendarResource[];
  visibleResources: CalendarResource[];
  isPending: (eventId: string) => boolean;
  selectedOccurrenceId: string | null;
  isNarrow: boolean;
}

export type CalendarContextValue = CalendarConfigValue & CalendarStateValue;

export const CalendarConfigContext = createContext<CalendarConfigValue | null>(null);
export const CalendarStateContext = createContext<CalendarStateValue | null>(null);

const missing = () => new Error('Calendar compound components must be rendered inside <Calendar>.');

export function useCalendarConfig(): CalendarConfigValue {
  const ctx = use(CalendarConfigContext);
  if (!ctx) throw missing();
  return ctx;
}

export function useCalendarState(): CalendarStateValue {
  const ctx = use(CalendarStateContext);
  if (!ctx) throw missing();
  return ctx;
}

/** Everything (config + state). Convenient for views; leaf cells should prefer `useCalendarConfig`. */
export function useCalendar(): CalendarContextValue {
  const config = useCalendarConfig();
  const state = useCalendarState();
  return useMemo(() => ({ ...config, ...state }), [config, state]);
}

/** Live drag state, split out so pointer moves only re-render drag-aware consumers. */
export interface DragState {
  activeId: string | null;
  kind: 'move' | 'resize' | null;
  /** Where the dragged occurrence would land; rendered as a ghost by the views. */
  preview: EventOccurrence | null;
}

export const IDLE_DRAG: DragState = { activeId: null, kind: null, preview: null };
export const DragStateContext = createContext<DragState>(IDLE_DRAG);

export function useDragState(): DragState {
  return use(DragStateContext);
}

export const PREVIEW_SUFFIX = '::preview';
export const isPreviewOccurrence = (o: EventOccurrence) => o.occurrenceId.endsWith(PREVIEW_SUFFIX);

/** Occurrences plus the drag preview ghost (if any). */
export function useOccurrencesWithPreview(occurrences: EventOccurrence[]): EventOccurrence[] {
  const { preview } = useDragState();
  return useMemo(() => (preview ? [...occurrences, preview] : occurrences), [occurrences, preview]);
}
