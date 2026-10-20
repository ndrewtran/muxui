import { IconButton, TextField } from '@muxui/react';

const row = { display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'center' } as const;

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
}

export function IconButtonProminenceExample() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      {/* Supporting actions stay ghost, the default. */}
      <div style={row}>
        <IconButton aria-label="Search" onActivate={() => undefined}><SearchIcon /></IconButton>
        <IconButton aria-label="Settings" onActivate={() => undefined}><SettingsIcon /></IconButton>
      </div>
      {/* One clear local primary action beside its field takes primary. */}
      <div style={{ ...row, flexWrap: 'nowrap', maxInlineSize: '24rem' }}>
        <div style={{ flex: '1 1 auto', minInlineSize: 0 }}>
          <TextField aria-label="Message" placeholder="Write a message" />
        </div>
        <IconButton aria-label="Send message" variant="primary" onActivate={() => undefined}><SendIcon /></IconButton>
      </div>
      {/* A destructive action takes danger-ghost beside the item it removes, and the label names that item. */}
      <div style={row}>
        <span>Quarterly report</span>
        <IconButton aria-label="Remove Quarterly report" variant="danger-ghost" size="sm" onActivate={() => undefined}><TrashIcon /></IconButton>
      </div>
    </div>
  );
}
