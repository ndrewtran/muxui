import { useRef } from 'react';
import { Button, Popover } from '@muxui/react';

export function PopoverBoundaryExample() {
  const regionRef = useRef<HTMLDivElement>(null);

  return (
    // A narrow region, such as an embedded app: the Popover flips and shifts to stay inside it rather than the viewport.
    <div
      ref={regionRef}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        inlineSize: 280,
        blockSize: 200,
        padding: 'var(--muxui-reference-dimension-space-xs)',
        border: '1px solid var(--muxui-semantic-border-default)',
      }}
    >
      <Popover aria-label="Share options" boundaryRef={regionRef} placement="bottom-start" trigger={<Button variant="neutral">Share</Button>}>
        Copy the link, or invite people by name.
      </Popover>
    </div>
  );
}
