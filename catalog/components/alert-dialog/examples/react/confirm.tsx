import { useRef, useState } from 'react';
import { AlertDialog, Button } from '@muxui/react';

// Stands in for the application's request. The first request fails so both outcomes can be tried.
function deleteItem(attempt: number) {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => (attempt === 1 ? reject(new Error('The server did not respond.')) : resolve()), 800);
  });
}

export function ConfirmAlertDialogExample() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');
  const attempts = useRef(0);

  // Escape and Cancel both arrive here. Ignoring them while the request runs keeps the dialog open.
  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    setError(null);
    setOutcome(next ? '' : 'Cancelled.');
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      attempts.current += 1;
      await deleteItem(attempts.current);
      setOutcome('The item was deleted.');
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The item was not deleted.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
        <AlertDialog.Trigger>Delete item</AlertDialog.Trigger>
        <AlertDialog.Backdrop>
          <AlertDialog.Popup>
            <AlertDialog.Content>
              <AlertDialog.Title>Delete item?</AlertDialog.Title>
              <AlertDialog.Description>This action cannot be undone.</AlertDialog.Description>
              {error === null ? null : <p>{error}</p>}
              <AlertDialog.Actions>
                <AlertDialog.Close disabled={pending}>Cancel</AlertDialog.Close>
                <Button pending={pending} onActivate={confirm}>Delete</Button>
              </AlertDialog.Actions>
            </AlertDialog.Content>
          </AlertDialog.Popup>
        </AlertDialog.Backdrop>
      </AlertDialog.Root>
      <p>{outcome}</p>
    </>
  );
}
