import { Button, ToggleButton, Toolbar } from '@muxui/react';
export function BasicToolbarExample() {
  return <Toolbar aria-label="Document actions">
    <Button variant="secondary">Save</Button>
    <ToggleButton>Preview</ToggleButton>
    <Button variant="ghost">Share</Button>
  </Toolbar>;
}
