import { Button, Link, Popover, TextField } from '@muxui/react';

export function PopoverModesExample() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      {/* Non-modal: the user keeps browsing the page while the details stay open. */}
      <Popover aria-label="Report details" modal={false} trigger={<Button variant="neutral">Details</Button>}>
        <p>Revenue by region, 4 pages.</p>
        <Link href="#quarterly-report">Open report</Link>
      </Popover>
      {/* Modal, the default: a small interaction the user finishes before going back to the page. */}
      <Popover aria-label="Rename report" trigger={<Button variant="neutral">Rename</Button>}>
        <TextField label="Report name" defaultValue="Quarterly report" />
        <Button slot="close">Done</Button>
      </Popover>
    </div>
  );
}
