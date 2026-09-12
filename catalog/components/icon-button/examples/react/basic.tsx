import { IconButton } from '@muxui/react';

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

export function BasicIconButtonExample() {
  return <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
    <IconButton aria-label="Search" size="sm"><SearchIcon /></IconButton>
    <IconButton aria-label="Search" variant="neutral"><SearchIcon /></IconButton>
    <IconButton aria-label="Search" size="lg" variant="primary"><SearchIcon /></IconButton>
    <IconButton aria-label="Search" disabled><SearchIcon /></IconButton>
    <IconButton aria-label="Searching" pending><SearchIcon /></IconButton>
  </div>;
}
