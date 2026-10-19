import { useState } from 'react';
import { Button, Popover } from '@muxui/react';

export function NonDismissablePopoverExample() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      {/* Uncontrolled and modal: the Button in the close slot closes the Popover by itself. */}
      <Popover
        aria-label="Uncontrolled details"
        dismissable={false}
        trigger={<Button>Open uncontrolled Popover</Button>}
      >
        <p>Escape, an outside press, and the trigger do not close this Popover.</p>
        <Button slot="close">Close</Button>
      </Popover>
      {/* Controlled and non-modal: the Button in the close slot calls onOpenChange(false), and the owner closes the Popover. */}
      <Popover
        aria-label="Controlled details"
        dismissable={false}
        modal={false}
        open={open}
        onOpenChange={setOpen}
        trigger={<Button>Open controlled Popover</Button>}
      >
        <p>An outside press and Escape on the trigger do not close this Popover either.</p>
        <Button slot="close">Close</Button>
      </Popover>
    </div>
  );
}
