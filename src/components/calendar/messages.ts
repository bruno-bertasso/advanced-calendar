import type { CalendarView } from './types';

/**
 * Every user-facing string in the calendar. Pass a partial object via `messages` to
 * override; dates and times are always localised through `Intl` using `locale`.
 */
export interface CalendarMessages {
  calendar: string;
  views: Record<CalendarView, string>;
  today: string;
  todaySuffix: string;
  previous: (unit: string) => string;
  next: (unit: string) => string;
  units: { day: string; week: string; month: string; year: string; days: (n: number) => string };
  dateNavigation: string;
  calendarView: string;
  viewUnavailable: (view: string) => string;

  allDay: string;
  time: string;
  resource: string;
  resources: string;
  unassigned: string;
  allEvents: string;
  chooseDay: string;
  selectedDay: string;
  noEvents: string;
  noEventsBetween: (from: string, to: string) => string;
  eventCount: (n: number) => string;
  showMore: (n: number, day: string) => string;
  more: (n: number) => string;
  agenda: (title: string) => string;
  timeline: (title: string) => string;
  focusedTime: (time: string) => string;
  unavailable: string;

  recurring: string;
  recurringEvent: string;
  saving: string;
  draggableEvent: string;
  event: string;
  close: string;
  with: (names: string) => string;
  eventActions: string;
  adjustEvent: string;
  edit: string;
  editEllipsis: string;
  duplicate: string;
  delete: string;
  viewDetails: string;
  newEventHere: string;
  goToToday: string;
  copySuffix: string;
  nudge: { earlier: string; later: string; shorter: string; longer: string; 'prev-day': string; 'next-day': string };

  editor: {
    newEvent: string;
    editEvent: string;
    title: string;
    allDay: string;
    starts: string;
    ends: string;
    startTime: string;
    endTime: string;
    when: string;
    repeat: string;
    location: string;
    description: string;
    resources: string;
    cancel: string;
    create: string;
    save: string;
    deleteEvent: string;
    timesIn: (zone: string) => string;
    seriesNote: string;
    titleRequired: string;
    endAfterStart: string;
    repeatOptions: { none: string; daily: string; weekdays: string; weekly: string; monthly: string; yearly: string };
    custom: (rule: string) => string;
  };

  scope: {
    title: (action: 'edit' | 'delete') => string;
    description: string;
    this: string;
    following: string;
    all: string;
    cancel: string;
  };

  announce: {
    pickedUp: (title: string) => string;
    resizing: (title: string) => string;
    moved: (title: string, when: string) => string;
    resized: (title: string, when: string) => string;
    lastsUntil: (title: string, day: string) => string;
    updated: (title: string) => string;
    created: (title: string, when: string) => string;
    deleted: (title: string) => string;
    updateFailed: (title: string) => string;
    createFailed: (title: string) => string;
    deleteFailed: (title: string) => string;
    rejected: (title: string, reason?: string) => string;
    blocked: string;
    returned: (title: string) => string;
    dropCancelled: string;
    dragCancelled: string;
    selecting: (range: string) => string;
  };
  dragInstructions: string;
}

export const enMessages: CalendarMessages = {
  calendar: 'Calendar',
  views: {
    day: 'Day',
    week: 'Week',
    'work-week': 'Work week',
    month: 'Month',
    year: 'Year',
    agenda: 'Agenda',
    timeline: 'Timeline',
  },
  today: 'Today',
  todaySuffix: ', today',
  previous: (u) => `Previous ${u}`,
  next: (u) => `Next ${u}`,
  units: { day: 'day', week: 'week', month: 'month', year: 'year', days: (n) => `${n} days` },
  dateNavigation: 'Date navigation',
  calendarView: 'Calendar view',
  viewUnavailable: (v) => `${v} view is not available yet.`,

  allDay: 'All day',
  time: 'Time',
  resource: 'Resource',
  resources: 'Resources',
  unassigned: 'Unassigned',
  allEvents: 'All events',
  chooseDay: 'Choose day',
  selectedDay: 'Selected day',
  noEvents: 'No events',
  noEventsBetween: (a, b) => `No events between ${a} and ${b}.`,
  eventCount: (n) => `${n} ${n === 1 ? 'event' : 'events'}`,
  showMore: (n, day) => `Show ${n} more ${n === 1 ? 'event' : 'events'} on ${day}`,
  more: (n) => `+${n} more`,
  agenda: (t) => `Agenda, ${t}`,
  timeline: (t) => `Timeline, ${t}`,
  focusedTime: (t) => `Focused time ${t}`,
  unavailable: 'Unavailable',

  recurring: 'recurring',
  recurringEvent: 'Recurring event',
  saving: 'saving',
  draggableEvent: 'draggable event',
  event: 'event',
  close: 'Close',
  with: (n) => `With: ${n}`,
  eventActions: 'Event actions',
  adjustEvent: 'Adjust event',
  edit: 'Edit',
  editEllipsis: 'Edit…',
  duplicate: 'Duplicate',
  delete: 'Delete',
  viewDetails: 'View details',
  newEventHere: 'New event here',
  goToToday: 'Go to today',
  copySuffix: ' (copy)',
  nudge: { earlier: 'Earlier', later: 'Later', shorter: 'Shorter', longer: 'Longer', 'prev-day': 'Prev day', 'next-day': 'Next day' },

  editor: {
    newEvent: 'New event',
    editEvent: 'Edit event',
    title: 'Title',
    allDay: 'All day',
    starts: 'Starts',
    ends: 'Ends',
    startTime: 'Start time',
    endTime: 'End time',
    when: 'When',
    repeat: 'Repeat',
    location: 'Location',
    description: 'Description',
    resources: 'Resources',
    cancel: 'Cancel',
    create: 'Create',
    save: 'Save',
    deleteEvent: 'Delete',
    timesIn: (z) => `Times are in ${z}.`,
    seriesNote: 'This event is part of a recurring series.',
    titleRequired: 'Enter a title.',
    endAfterStart: 'End must be after start.',
    repeatOptions: {
      none: 'Does not repeat',
      daily: 'Daily',
      weekdays: 'Every weekday (Mon–Fri)',
      weekly: 'Weekly',
      monthly: 'Monthly',
      yearly: 'Yearly',
    },
    custom: (r) => `Custom (${r})`,
  },

  scope: {
    title: (a) => (a === 'delete' ? 'Delete recurring event' : 'Change recurring event'),
    description: 'Which events should this apply to?',
    this: 'This event',
    following: 'This and following events',
    all: 'All events',
    cancel: 'Cancel',
  },

  announce: {
    pickedUp: (t) => `Picked up ${t}. Use arrow keys to move, Space to drop, Escape to cancel.`,
    resizing: (t) => `Resizing ${t}.`,
    moved: (t, w) => `${t} moved to ${w}.`,
    resized: (t, w) => `${t} now ends ${w}.`,
    lastsUntil: (t, d) => `${t} now lasts until ${d}.`,
    updated: (t) => `${t} updated.`,
    created: (t, w) => `${t} created for ${w}.`,
    deleted: (t) => `${t} deleted.`,
    updateFailed: (t) => `Could not update ${t}. Change reverted.`,
    createFailed: (t) => `Could not create ${t}.`,
    deleteFailed: (t) => `Could not delete ${t}. It has been restored.`,
    rejected: (t, r) => `${t} was not changed${r ? `: ${r}` : '.'}`,
    blocked: 'That time is unavailable.',
    returned: (t) => `${t} returned to its original time.`,
    dropCancelled: 'Drop cancelled.',
    dragCancelled: 'Drag cancelled. Event returned to its original time.',
    selecting: (r) => `Selecting ${r}.`,
  },
  dragInstructions:
    'Press Enter to view details. Press Space to pick up, arrow keys to move, Space to drop, Escape to cancel. Alt plus arrow keys moves by one slot or day; Shift plus Up or Down arrow changes duration; Delete removes the event.',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Brazilian Portuguese preset. */
export const ptBRMessages: CalendarMessages = {
  calendar: 'Calendário',
  views: {
    day: 'Dia',
    week: 'Semana',
    'work-week': 'Semana útil',
    month: 'Mês',
    year: 'Ano',
    agenda: 'Agenda',
    timeline: 'Linha do tempo',
  },
  today: 'Hoje',
  todaySuffix: ', hoje',
  previous: (u) => `${capitalize(u)} anterior`,
  next: (u) => `${capitalize(u)} seguinte`,
  units: { day: 'dia', week: 'semana', month: 'mês', year: 'ano', days: (n) => `${n} dias` },
  dateNavigation: 'Navegação de datas',
  calendarView: 'Visualização do calendário',
  viewUnavailable: (v) => `A visualização ${v} ainda não está disponível.`,

  allDay: 'Dia inteiro',
  time: 'Horário',
  resource: 'Recurso',
  resources: 'Recursos',
  unassigned: 'Sem recurso',
  allEvents: 'Todos os eventos',
  chooseDay: 'Escolher dia',
  selectedDay: 'Dia selecionado',
  noEvents: 'Nenhum evento',
  noEventsBetween: (a, b) => `Nenhum evento entre ${a} e ${b}.`,
  eventCount: (n) => `${n} ${n === 1 ? 'evento' : 'eventos'}`,
  showMore: (n, day) => `Mostrar mais ${n} ${n === 1 ? 'evento' : 'eventos'} em ${day}`,
  more: (n) => `+${n} mais`,
  agenda: (t) => `Agenda, ${t}`,
  timeline: (t) => `Linha do tempo, ${t}`,
  focusedTime: (t) => `Horário em foco ${t}`,
  unavailable: 'Indisponível',

  recurring: 'recorrente',
  recurringEvent: 'Evento recorrente',
  saving: 'salvando',
  draggableEvent: 'evento arrastável',
  event: 'evento',
  close: 'Fechar',
  with: (n) => `Com: ${n}`,
  eventActions: 'Ações do evento',
  adjustEvent: 'Ajustar evento',
  edit: 'Editar',
  editEllipsis: 'Editar…',
  duplicate: 'Duplicar',
  delete: 'Excluir',
  viewDetails: 'Ver detalhes',
  newEventHere: 'Novo evento aqui',
  goToToday: 'Ir para hoje',
  copySuffix: ' (cópia)',
  nudge: { earlier: 'Mais cedo', later: 'Mais tarde', shorter: 'Mais curto', longer: 'Mais longo', 'prev-day': 'Dia anterior', 'next-day': 'Próximo dia' },

  editor: {
    newEvent: 'Novo evento',
    editEvent: 'Editar evento',
    title: 'Título',
    allDay: 'Dia inteiro',
    starts: 'Início',
    ends: 'Fim',
    startTime: 'Hora de início',
    endTime: 'Hora de término',
    when: 'Quando',
    repeat: 'Repetir',
    location: 'Local',
    description: 'Descrição',
    resources: 'Recursos',
    cancel: 'Cancelar',
    create: 'Criar',
    save: 'Salvar',
    deleteEvent: 'Excluir',
    timesIn: (z) => `Horários em ${z}.`,
    seriesNote: 'Este evento faz parte de uma série recorrente.',
    titleRequired: 'Informe um título.',
    endAfterStart: 'O fim deve ser depois do início.',
    repeatOptions: {
      none: 'Não se repete',
      daily: 'Diariamente',
      weekdays: 'Todo dia útil (seg–sex)',
      weekly: 'Semanalmente',
      monthly: 'Mensalmente',
      yearly: 'Anualmente',
    },
    custom: (r) => `Personalizado (${r})`,
  },

  scope: {
    title: (a) => (a === 'delete' ? 'Excluir evento recorrente' : 'Alterar evento recorrente'),
    description: 'A quais eventos isso deve se aplicar?',
    this: 'Este evento',
    following: 'Este e os seguintes',
    all: 'Todos os eventos',
    cancel: 'Cancelar',
  },

  announce: {
    pickedUp: (t) => `${t} selecionado. Use as setas para mover, Espaço para soltar, Esc para cancelar.`,
    resizing: (t) => `Redimensionando ${t}.`,
    moved: (t, w) => `${t} movido para ${w}.`,
    resized: (t, w) => `${t} agora termina ${w}.`,
    lastsUntil: (t, d) => `${t} agora vai até ${d}.`,
    updated: (t) => `${t} atualizado.`,
    created: (t, w) => `${t} criado para ${w}.`,
    deleted: (t) => `${t} excluído.`,
    updateFailed: (t) => `Não foi possível atualizar ${t}. Alteração desfeita.`,
    createFailed: (t) => `Não foi possível criar ${t}.`,
    deleteFailed: (t) => `Não foi possível excluir ${t}. O evento foi restaurado.`,
    rejected: (t, r) => `${t} não foi alterado${r ? `: ${r}` : '.'}`,
    blocked: 'Esse horário está indisponível.',
    returned: (t) => `${t} voltou ao horário original.`,
    dropCancelled: 'Soltura cancelada.',
    dragCancelled: 'Arraste cancelado. O evento voltou ao horário original.',
    selecting: (r) => `Selecionando ${r}.`,
  },
  dragInstructions:
    'Pressione Enter para ver detalhes. Espaço para pegar, setas para mover, Espaço para soltar, Esc para cancelar. Alt mais setas move um intervalo ou um dia; Shift mais seta para cima ou para baixo muda a duração; Delete exclui o evento.',
};

/** Shallow-merge user overrides (nested groups merged one level deep). */
export function resolveMessages(overrides?: DeepPartial<CalendarMessages>): CalendarMessages {
  if (!overrides) return enMessages;
  const out: Record<string, unknown> = { ...enMessages };
  for (const [key, value] of Object.entries(overrides)) {
    const base = (enMessages as unknown as Record<string, unknown>)[key];
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value) && base && typeof base === 'object'
        ? { ...(base as object), ...(value as object) }
        : value;
  }
  return out as unknown as CalendarMessages;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : T[K] extends object ? Partial<T[K]> : T[K];
};
