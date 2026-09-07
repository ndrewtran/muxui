import { useState } from 'react';
import { Button, Dialog } from '@muxui/react';

export function ControlledDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onActivate={() => setOpen(true)}>Open controlled dialog</Button>
      <Dialog title="Review changes" open={open} onOpenChange={setOpen}>
        Check the changes before continuing.
      </Dialog>
    </>
  );
}
