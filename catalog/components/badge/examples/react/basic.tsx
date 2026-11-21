import { Badge } from '@muxui/react';

function CheckIcon() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" /></svg>;
}

export function BasicBadgeExample() {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
    <Badge>Author</Badge>
    <Badge tone="brand">Moderator</Badge>
    <Badge tone="success" icon={<CheckIcon />}>Solved</Badge>
    <Badge tone="warning">Locked</Badge>
    <Badge tone="error">Removed</Badge>
    <Badge tone="brand" variant="solid">New</Badge>
  </div>;
}
