import { useState } from 'react';
import { Button, Checkbox, ToastProvider, useToast } from '@muxui/react';

// Stands in for the application's request. The first argument is what a real call would send.
function saveProject(_version: number, shouldFail: boolean) {
  return new Promise<void>((resolve, reject) => {
    window.setTimeout(() => (shouldFail ? reject(new Error('The connection dropped.')) : resolve()), 800);
  });
}

function SaveControls() {
  const { add } = useToast();
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      await saveProject(version + 1, simulateFailure);
      setVersion((current) => current + 1);
      // A finished save is a discrete result the user can miss without harm, so it is a toast.
      // Success says the action completed. Each save adds its own toast, and each leaves on its own.
      add(`Saved as version ${version + 1}`, { title: 'Project', variant: 'success' });
    } catch {
      // A failure the user must act on stays beside the Button, with the error and the retry. No toast is added,
      // so repeating the failure changes this one message instead of stacking notices that expire.
      setFailure('Could not save the project. The connection dropped.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'flex-start' }}>
      {/* Work in progress stays on the Button too. */}
      <Button pending={saving} onActivate={save}>
        {failure ? 'Try again' : 'Save'}
      </Button>
      {failure ? <p role="alert">{failure}</p> : null}
      {/* A control for this demonstration only. It is not part of the pattern. */}
      <Checkbox checked={simulateFailure} onChange={setSimulateFailure}>
        Simulate a failed save
      </Checkbox>
    </div>
  );
}

export function ToastResultAndFailureExample() {
  return (
    <ToastProvider placement="bottom-end">
      <SaveControls />
    </ToastProvider>
  );
}
