import { useRef } from 'react';
import { Button, Popover, TextField } from '@muxui/react';

export function PopoverInitialFocusExample() {
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Popover aria-label="Rename report" initialFocusRef={nameRef} trigger={<Button variant="neutral">Rename</Button>}>
      {/* The name field takes focus as the Popover opens, in place of the Popover's own surface. */}
      <TextField label="Report name" defaultValue="Quarterly report" inputRef={nameRef} />
      <Button slot="close">Done</Button>
    </Popover>
  );
}
