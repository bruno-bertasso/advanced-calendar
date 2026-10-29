import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Button } from '@/components/ui/button';
import { useCalendarConfig } from './calendar-context';
import type { RecurrenceScope } from './types';

export interface ScopePrompt {
  action: 'edit' | 'delete';
  title: string;
  /** Scopes available (e.g. "this"/"following" need onEventChange). */
  options: RecurrenceScope[];
  resolve: (scope: RecurrenceScope | null) => void;
}

/** "This event / This and following / All events" — Base UI AlertDialog. */
export function RecurrenceScopeDialog({ prompt }: { prompt: ScopePrompt | null }) {
  const { messages, direction } = useCalendarConfig();
  const m = messages.scope;
  return (
    <AlertDialog.Root open={Boolean(prompt)} onOpenChange={(open) => !open && prompt?.resolve(null)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[60] bg-black/40 transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <AlertDialog.Popup
          dir={direction}
          className="fixed left-1/2 top-1/2 z-[60] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl outline-none transition-[opacity,transform] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
        >
          {prompt && (
            <>
              <AlertDialog.Title className="text-base font-semibold">{m.title(prompt.action)}</AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{prompt.title}</span> — {m.description}
              </AlertDialog.Description>
              <div role="group" aria-label={m.description} className="mt-4 flex flex-col gap-2">
                {prompt.options.map((scope) => (
                  <Button
                    key={scope}
                    variant={scope === 'this' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => prompt.resolve(scope)}
                  >
                    {m[scope]}
                  </Button>
                ))}
                <AlertDialog.Close render={<Button variant="ghost" />}>{m.cancel}</AlertDialog.Close>
              </div>
            </>
          )}
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
