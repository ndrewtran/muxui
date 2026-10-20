import { useState } from 'react';
import { SearchField } from '@muxui/react';

const fruits = ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Grape', 'Lemon', 'Mango'];

export function FilterListSearchFieldExample() {
  const [query, setQuery] = useState('');
  // The list is already in memory, so filtering on every change is cheap.
  const matches = fruits.filter((fruit) => fruit.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <SearchField label="Search fruit" value={query} onChange={setQuery} />
      {matches.length > 0 ? (
        <ul>
          {matches.map((fruit) => (
            <li key={fruit}>{fruit}</li>
          ))}
        </ul>
      ) : (
        <p>No fruit matches {query}.</p>
      )}
    </div>
  );
}
