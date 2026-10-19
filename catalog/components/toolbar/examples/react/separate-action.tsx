import { Button, ToggleButton, Toolbar } from '@muxui/react';

export function SeparateActionToolbarExample() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--muxui-semantic-layout-control-gap)' }}>
      <Toolbar aria-label="Document actions">
        <Button variant="neutral">Save</Button>
        <ToggleButton>Preview</ToggleButton>
      </Toolbar>
      <Button>Publish</Button>
    </div>
  );
}
