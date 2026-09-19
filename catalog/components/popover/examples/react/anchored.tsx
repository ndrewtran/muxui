import { useRef } from 'react';
import { Button, Popover } from '@muxui/react';

export function AnchoredPopoverExample() {
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={anchorRef}>Selected item</div>
      <Popover
        aria-label="Item details"
        anchorRef={anchorRef}
        placement="bottom-start"
        modal={false}
        offset={4}
        trigger={<Button>Show details</Button>}
      >
        Contextual information about the selected item.
      </Popover>
    </>
  );
}
