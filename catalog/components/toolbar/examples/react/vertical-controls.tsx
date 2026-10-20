import { Button, ToggleButton, Toolbar } from '@muxui/react';

export function VerticalControlsExample() {
  return (
    // The wrapper owns the width. The Toolbar fills it, and the controls stretch to the Toolbar's width.
    <div style={{ inlineSize: '12rem' }}>
      <Toolbar aria-label="Canvas tools" orientation="vertical">
        <Button>Undo</Button>
        <Button>Redo</Button>
        <ToggleButton>Grid</ToggleButton>
        <ToggleButton>Snap to grid</ToggleButton>
      </Toolbar>
    </div>
  );
}
