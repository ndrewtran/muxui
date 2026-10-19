import { useEffect, useState } from 'react';
import { Button, Toast, ToastProvider } from '@muxui/react';

function SaveStatus() {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Stand in for the application's request.
  useEffect(() => {
    if (status !== 'saving') return;
    const timer = setTimeout(() => setStatus('saved'), 1500);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <>
      <Button disabled={status !== 'idle'} onActivate={() => setStatus('saving')}>
        Save
      </Button>
      {status === 'idle' ? null : (
        <Toast
          title="Project"
          message={status === 'saving' ? 'Saving' : 'Saved'}
          onDismiss={() => setStatus('idle')}
        />
      )}
    </>
  );
}

export function ToastDeclarativeUpdateExample() {
  return (
    <ToastProvider>
      <SaveStatus />
    </ToastProvider>
  );
}
