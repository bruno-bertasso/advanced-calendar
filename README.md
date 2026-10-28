# Advanced Calendar

A calendar component built in parts (`Calendar`, `CalendarHeader`, `CalendarBody` and the views) using React 19, Base UI, shadcn/ui tokens and Tailwind CSS v4.

```bash
npm install
npm run dev        # demo at http://localhost:5173  (?view=week&date=2026-10-28&resources=ada,grace)
npm test           # 58 tests (vitest + Testing Library)
npm run typecheck
npm run build
```

## Defaults I chose (these weren't in the spec)

| Choice | Why |
| --- | --- |
| **Vite + Vitest** | Runs as a standalone library or demo, with no framework lock-in. `nuqs` works in any of its adapters. |
| **`@base-ui/react@1.9`** instead of `@base-ui-components/react` | The old package name stopped at `1.0.0-rc.0` and was renamed. Same API, stable release. |
| **`@dnd-kit/core`** | Keyboard sensor + accessibility hooks built in; works with `useOptimistic`. |
| **`@date-fns/tz` (`TZDate`)** | date-fns v4 does its math on the wall clock of the display zone, which handles DST correctly. |
| Layout: `src/components/calendar/{views,lib,hooks,__tests__}`, `src/components/ui` (shadcn-style), `src/demo` | The `lib/` folder holds pure, framework-free logic that is unit tested on its own. |
| Recurring drag = **shift the whole series** | `EventChange` carries both `occurrence` and `nextEvent`, so a consumer can implement "this event only" exceptions instead. |

## Usage

```tsx
import { NuqsAdapter } from 'nuqs/adapters/react';
import { Calendar, CalendarHeader, CalendarBody, useCalendarQueryState } from '@/components/calendar';

function Scheduler() {
  const q = useCalendarQueryState({ defaultView: 'week' });   // URL-synced view/date/resources
  return (
    <Calendar
      events={events}
      resources={resources}
      visibleResourceIds={q.resourceIds}
      view={q.view} onViewChange={q.setView}
      date={q.date} onDateChange={q.setDate}
      views={['day', 'week', 'work-week', 'month', 'year', 'agenda', 'timeline']}
      timeZone="Europe/London"
      direction="ltr"                                               // or "rtl"
      onEventChange={async (change) => api.save(change.nextEvent)}  // move | resize | edit; rejection ⇒ revert
      onEventCreate={async (event) => api.create(event)}            // enables the create dialog + Duplicate
      onEventDelete={async (event) => api.remove(event.id)}         // enables Delete (menu, popover, Delete key)
      renderEvent={(ctx) => <MyCard {...ctx} />}
      renderCell={({ defaultContent, events }) => <>{defaultContent}<Badge n={events.length} /></>}
      renderResourceHeader={({ resource }) => <Avatar resource={resource} />}
    >
      <CalendarHeader />            {/* or <Calendar.Header /> */}
      <CalendarBody views={{ /* agenda: MyAgendaView */ }} />
    </Calendar>
  );
}
// wrap the app in <NuqsAdapter> when using useCalendarQueryState
```

You can also leave the calendar uncontrolled (`defaultView`, `defaultDate`).

## What's implemented

**Month view.** A 6×7 ARIA `grid`. Each week row uses `grid-template-columns: subgrid`, so weekday headers stay aligned with the day columns. Multi-day events are packed into lanes, and overflow goes into a "+N more" Base UI **Popover**. That list switches to virtualized rendering with `@tanstack/react-virtual` once a day has more than 40 events. Below 768px, cells show coloured dots and the selected day's events are listed underneath.

**Week view** (also serves `work-week` and `day`). A single CSS grid with a time gutter plus one column per day (or per day × resource). The sticky header, the all-day lane and every time-slot row are subgrids. Overlapping events are split into side-by-side columns and widen into free space. Events that cross midnight are split per day. It includes a current-time line and optional resource columns using `renderResourceHeader`. Below 768px it collapses to the focused day, with a 7-day picker strip.

**Event cards.** These use `@container` (Tailwind v4) plus a `size` container. Cards hide the time when narrow, stack title / time / location when tall, and show the recurrence icon when there's room.

**Drag & drop.** Drag to move, or drag the bottom handle to resize. Moves snap to slots, and the resize previews the new height while dragging. Dropping on another resource column reassigns the event. Updates appear instantly through React 19 `useOptimistic` and `useTransition`. Cards pulse with the label "saving" until `onEventChange` resolves, and revert automatically if it rejects.

**Recurrence.** Supports RFC 5545 `RRULE` and `EXDATE` via `rrule`. Rules expand on the event zone's wall clock, so a 9:00 meeting stays at 9:00 across DST. Each event can set its own `timeZone`, separate from the calendar's display zone.

**Accessibility (aiming for WCAG 2.2 AA):**
- Roving `tabindex` grid navigation:
  - Month view: arrow keys, Home/End, PageUp/PageDown, Shift+PageUp/PageDown for ±1 year.
  - Week view: arrow keys, Home/End, Ctrl+Home/End, PageUp/PageDown.
- Events in the active cell or day are in the tab order.
- **Enter** opens details. **Space** picks an event up; arrows move it; Space drops it; Esc cancels.
- **Alt+Arrows** move an event by one slot or one day. **Shift+↑/↓** changes its duration.
- Single-pointer alternatives to dragging (WCAG 2.5.7): Earlier / Later / Prev day / Next day / Shorter / Longer buttons in the details popover.
- `aria-live` announcements: polite for pick-up and commit, assertive for failures and reverts.
- Targets are at least 24px (WCAG 2.5.8), `aria-current="date"` marks today, and `prefers-reduced-motion` is respected.

## Year, Agenda and Timeline views

**Year view.** Shows 12 mini-months, and each one is its own ARIA grid. A single tab stop (the cursor day) moves across the whole year: arrow keys, Home/End, PageUp/PageDown, and Shift+PageUp/PageDown for ±1 year. Enter or a click opens that day in the most detailed view available (day → week → month). Days are shaded by how many events they have. The month layout adapts with container queries (1, 2, 3 or 4 columns).

**Agenda view.** Lists the next `agendaDays` days (default 30), grouped under a heading per day. All-day events come first, and multi-day events appear on every day they touch. The list is virtualized with `@tanstack/react-virtual`. ↑/↓/Home/End move between events, scrolling the virtualized list as needed. If nothing is in range, an empty-state message is shown.

**Timeline view.**
- **Layout:** one row per resource (the visible resources, or all of them), plus an "Unassigned" row when needed. Time runs horizontally in columns of `timelineSlotMinutes`.
- **Virtualization:** both axes are virtualized. Only the visible rows and hour headers render, and only events that overlap the visible horizontal window.
- **Sticky parts:** row headers (via `renderResourceHeader`) and the time header stay in place while scrolling.
- **Long events:** bars that start before the visible area are clipped to its edge so their titles stay readable.
- **Editing:** drag horizontally to change the time (snapped to the slot), drag to another row to reassign the resource, and drag the end edge to resize.
- **Keyboard:** ↑/↓ change row, ←/→ move a focused time column, PageUp/PageDown move by a day, and Enter creates an event there. Double-click also creates one.
- **Small screens (< 768px):** the range collapses to a single day.

## Editing, context menu, deletion

- **Create/edit dialog (Base UI Dialog).** Fields: title, all-day, start/end (in the display time zone), repeat (Base UI Select with preset RRULEs; custom rules are kept as-is), location, description and resources. Errors show inline, use `aria-invalid`, and move focus to the first invalid field. Edits to a recurring event apply to the whole series and shift it by the same amount. Opens from: double-click or Enter on a slot (when `onEventCreate` is set), or "Edit" in the popover or context menu.
- **Context menu (Base UI ContextMenu).** One shared menu for the whole body. On an event: View details / Edit… / Duplicate / Delete. On a slot: New event here. Always: Go to today. Everything in it is also reachable by keyboard (popover buttons, Delete key).
- **Optimistic updates.** Create and delete use `useOptimistic` like move and resize do. A failure restores the previous state and is announced through the assertive live region.
- **Resizing in month view and the all-day lane.** A handle on the inline-end edge moves the last day of the event onto the hovered day. All-day events never shrink below one day.
- **RTL (`direction="rtl"`).** Sets `dir` and Base UI's `DirectionProvider`. Layout uses logical properties (`start`/`end`, `inset-inline-start`), horizontal arrow keys are mirrored in every grid, and timeline drag deltas are inverted. Portaled popups (popover, dialog, menu) inherit the direction.

## Known limitations

- Editing a recurring event always applies to the whole series. There is no "this occurrence only" option yet (that would mean adding EXDATEs and a separate exception event). `EventChange.occurrence` is there so consumers can build it.
- The resize preview is live in the time grid and the timeline. In month view, only the hovered target cell is highlighted.
- In the timeline, the context menu's "New event here" doesn't work for an exact time position. Double-click or Enter on the focused column instead.
- If you switch `direction` at runtime, the header Tabs indicator only repositions on the next resize or tab change.
- jsdom prints harmless `act()` warnings from Base UI ScrollArea's internal timers during tests.
