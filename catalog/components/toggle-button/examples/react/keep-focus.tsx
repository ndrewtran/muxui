import { ToggleButton, Toolbar } from '@muxui/react';

export function KeepFocusToggleButtonExample() {
  return (
    <div style={{ display: 'grid', gap: '0.5rem', maxWidth: '24rem' }}>
      <Toolbar aria-label="Formatting">
        <ToggleButton size="sm" preventFocusOnPress>Bold</ToggleButton>
        <ToggleButton size="sm" preventFocusOnPress>Italic</ToggleButton>
      </Toolbar>
      <textarea aria-label="Note" rows={3} defaultValue="Select some text, then press Bold: the selection stays in the note." />
    </div>
  );
}
