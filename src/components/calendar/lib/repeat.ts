/** Repeat presets offered by the editor (RRULE bodies). Labels live in `messages.editor.repeatOptions`. */
export const REPEAT_PRESETS = {
  none: { label: 'Does not repeat', rule: undefined },
  daily: { label: 'Daily', rule: 'FREQ=DAILY' },
  weekdays: { label: 'Every weekday (Mon–Fri)', rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  weekly: { label: 'Weekly', rule: 'FREQ=WEEKLY' },
  monthly: { label: 'Monthly', rule: 'FREQ=MONTHLY' },
  yearly: { label: 'Yearly', rule: 'FREQ=YEARLY' },
} as const satisfies Record<string, { label: string; rule: string | undefined }>;

export type RepeatKey = keyof typeof REPEAT_PRESETS | 'custom';

export function repeatKeyFor(rrule: string | undefined): RepeatKey {
  if (!rrule) return 'none';
  const body = rrule.replace(/^RRULE:/i, '').trim().toUpperCase();
  const hit = (Object.keys(REPEAT_PRESETS) as (keyof typeof REPEAT_PRESETS)[]).find(
    (k) => REPEAT_PRESETS[k].rule === body,
  );
  return hit ?? 'custom';
}

