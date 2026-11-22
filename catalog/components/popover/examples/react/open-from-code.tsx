import { useRef, useState } from 'react';
import { Button, Popover, TextField, Toolbar } from '@muxui/react';

export function PopoverOpenFromCodeExample() {
  const [open, setOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <Toolbar ref={toolbarRef} aria-label="Formatting">
        <Button variant="neutral">Bold</Button>
        <Button variant="neutral" onActivate={() => setOpen(true)}>Link</Button>
      </Toolbar>
      {/* No trigger: the Link tool opens the Popover from code, and anchorRef places it under the whole toolbar. */}
      <Popover aria-label="Add link" open={open} onOpenChange={setOpen} anchorRef={toolbarRef} placement="bottom-start">
        <TextField label="Address" />
        <Button slot="close">Done</Button>
      </Popover>
    </>
  );
}
