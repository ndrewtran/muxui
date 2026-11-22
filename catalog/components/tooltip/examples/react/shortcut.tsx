import { IconButton, Tooltip } from '@muxui/react';

function BoldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

// The key caps are decoration hidden from assistive technology. aria-keyshortcuts on the trigger states the shortcut,
// which the application registers.
export function ShortcutTooltipExample() {
  return (
    <Tooltip
      trigger={<IconButton aria-label="Bold" aria-keyshortcuts="Control+B"><BoldIcon /></IconButton>}
      content={<>Make the selection bold<Tooltip.Shortcut keys={['Ctrl', 'B']} /></>}
    />
  );
}
