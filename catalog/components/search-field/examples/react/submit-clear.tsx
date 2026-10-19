import { useState } from 'react';
import { SearchField } from '@muxui/react';

export function SubmitClearSearchFieldExample() {
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const record = (event: string) => setEvents((previous) => [...previous.slice(-4), event]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      {/* Enter submits the text, and Escape or the clear button empties a non-empty field. */}
      <SearchField
        label="Search"
        value={query}
        onChange={setQuery}
        onSubmit={(text) => record(`Submitted "${text}"`)}
        onClear={() => record('Cleared')}
      />
      <ul>
        {events.map((event, index) => (
          <li key={`${index}:${event}`}>{event}</li>
        ))}
      </ul>
    </div>
  );
}
