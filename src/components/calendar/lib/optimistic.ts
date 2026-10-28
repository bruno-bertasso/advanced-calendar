import type { CalendarEvent, EventChange, EventChangeType, EventOccurrence } from '../types';

/** Build the persisted event for a move/resize of one occurrence. */
export function applyOccurrenceChange(
  event: CalendarEvent,
  occurrence: EventOccurrence,
  start: Date,
  end: Date,
  resourceIds?: string[],
): CalendarEvent {
  const startDelta = start.getTime() - occurrence.start.getTime();
  const endDelta = end.getTime() - occurrence.end.getTime();
  return {
    ...event,
    start: new Date(event.start.getTime() + startDelta),
    end: new Date(event.end.getTime() + endDelta),
    ...(resourceIds ? { resourceIds } : {}),
  };
}

export function buildEventChange(
  type: EventChangeType,
  event: CalendarEvent,
  occurrence: EventOccurrence,
  start: Date,
  end: Date,
  resourceIds?: string[],
): EventChange {
  return {
    type,
    event,
    occurrence,
    start,
    end,
    nextEvent: applyOccurrenceChange(event, occurrence, start, end, resourceIds),
  };
}

export interface OptimisticState {
  events: CalendarEvent[];
  pendingIds: ReadonlySet<string>;
}

export type OptimisticAction =
  | { kind: 'change'; change: EventChange }
  | { kind: 'create'; event: CalendarEvent }
  | { kind: 'delete'; event: CalendarEvent };

/** Reducer for React 19 `useOptimistic`. */
export function optimisticReducer(state: OptimisticState, action: OptimisticAction): OptimisticState {
  const pendingIds = new Set(state.pendingIds);
  switch (action.kind) {
    case 'change':
      pendingIds.add(action.change.event.id);
      return {
        events: state.events.map((e) => (e.id === action.change.event.id ? action.change.nextEvent : e)),
        pendingIds,
      };
    case 'create':
      pendingIds.add(action.event.id);
      return { events: [...state.events.filter((e) => e.id !== action.event.id), action.event], pendingIds };
    case 'delete':
      return { events: state.events.filter((e) => e.id !== action.event.id), pendingIds };
  }
}

/** Collision-resistant id for client-created events (consumers may replace it server-side). */
export function createEventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
