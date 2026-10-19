import { IconButton, Tooltip } from '@muxui/react';

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" />
    </svg>
  );
}

// The IconButton's own label names it. The Tooltip adds a description to that name.
export function IconButtonTooltipExample() {
  return (
    <Tooltip
      trigger={<IconButton aria-label="Help"><HelpIcon /></IconButton>}
      content="Shortcuts and tips for this page."
    />
  );
}
