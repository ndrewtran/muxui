import { useState } from 'react';
import { ToggleButton } from '@muxui/react';

function PinIcon({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M9 3h6l-1 6 4 4H6l4-4-1-6Z" /><path d="M12 13v8" /></svg>;
}

const projects = ['Design review', 'Release notes', 'Onboarding'];

export function QuietToggleButtonExample() {
  const [pinned, setPinned] = useState<readonly string[]>(['Release notes']);
  return (
    <ul style={{ display: 'grid', gap: '0.25rem', margin: 0, padding: 0, listStyle: 'none' }}>
      {projects.map((name) => {
        const selected = pinned.includes(name);
        return (
          <li key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            {name}
            <ToggleButton
              variant="quiet"
              size="sm"
              aria-label={`Pin ${name}`}
              selected={selected}
              onChange={(next) => setPinned((current) => (next ? [...current, name] : current.filter((item) => item !== name)))}
            >
              <PinIcon filled={selected} />
            </ToggleButton>
          </li>
        );
      })}
    </ul>
  );
}
