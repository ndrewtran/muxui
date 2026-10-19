import { useState } from 'react';
import { Button, Dialog } from '@muxui/react';

export function NonDismissableDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      {/* Uncontrolled: the Button in the close slot closes the Dialog by itself. */}
      <Dialog
        title="Uncontrolled notice"
        dismissable={false}
        trigger={<Button>Open uncontrolled Dialog</Button>}
        actions={<Button slot="close">Close</Button>}
      >
        Escape, an outside press, and the trigger do not close this Dialog.
      </Dialog>
      {/* Controlled: the Button in the close slot calls onOpenChange(false), and the owner closes the Dialog. */}
      <Button onActivate={() => setOpen(true)}>Open controlled Dialog</Button>
      <Dialog
        title="Controlled notice"
        dismissable={false}
        open={open}
        onOpenChange={setOpen}
        actions={<Button slot="close">Close</Button>}
      >
        Escape and an outside press do not close this Dialog either.
      </Dialog>
    </div>
  );
}
