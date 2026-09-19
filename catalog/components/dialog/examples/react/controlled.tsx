import { useState } from 'react';
import { Button, Dialog } from '@muxui/react';

export function ControlledDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onActivate={() => setOpen(true)}>Open controlled dialog</Button>
      <Dialog
        title="Review changes"
        description="Check the changes before continuing."
        open={open}
        onOpenChange={setOpen}
        actions={<Button onActivate={() => setOpen(false)}>Done</Button>}
      >
        The updated settings will apply to this workspace.
      </Dialog>
    </>
  );
}
