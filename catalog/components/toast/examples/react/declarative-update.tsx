import { useState } from 'react';
import { Button, Toast, ToastProvider } from '@muxui/react';

function SaveControls() {
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [shown, setShown] = useState(false);

  async function save() {
    setSaving(true);
    // Stand in for the application's request.
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSaving(false);
    setVersion((current) => current + 1);
    setShown(true);
  }

  return (
    <>
      {/* Work in progress stays beside the control that started it. */}
      <Button pending={saving} onActivate={save}>
        Save
      </Button>
      {/* The toast reports a result that has already happened. Saving again while it is visible updates it in place. */}
      {shown ? (
        <Toast
          title="Project"
          variant="success"
          message={`Saved as version ${version}`}
          onDismiss={() => setShown(false)}
        />
      ) : null}
    </>
  );
}

export function ToastDeclarativeUpdateExample() {
  return (
    <ToastProvider>
      <SaveControls />
    </ToastProvider>
  );
}
