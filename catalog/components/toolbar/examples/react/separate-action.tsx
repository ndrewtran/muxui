import { Button, ToggleButton, Toolbar } from '@muxui/react';

export function SeparateActionToolbarExample() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      {/* Horizontal: in a flex row the Toolbar takes the width of its controls, and the main action sits beside it. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--muxui-semantic-layout-control-gap)' }}>
        <Toolbar aria-label="Document actions">
          <Button>Save</Button>
          <ToggleButton>Preview</ToggleButton>
          <Button>Share</Button>
        </Toolbar>
        <Button>Publish</Button>
      </div>
      {/* Vertical: the wrapper owns the width, and the controls stretch to the Toolbar's width. */}
      <div style={{ inlineSize: '12rem' }}>
        <Toolbar aria-label="Document actions, vertical" orientation="vertical">
          <Button>Save</Button>
          <ToggleButton>Preview</ToggleButton>
          <Button>Share</Button>
        </Toolbar>
      </div>
    </div>
  );
}
