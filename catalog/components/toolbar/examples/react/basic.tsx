import { Button, ToggleButton, Toolbar } from '@muxui/react';
export function BasicToolbarExample() {
  return <Toolbar aria-label="Document actions">
    <Button>Save</Button>
    <ToggleButton>Preview</ToggleButton>
    <Button>Share</Button>
  </Toolbar>;
}
