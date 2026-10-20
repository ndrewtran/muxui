import { useRef, useState } from 'react';
import { SearchField } from '@muxui/react';

const projects = ['Roadmap', 'Roadshow', 'Billing', 'Billing export', 'Onboarding'];

// Stand in for a request to a search service.
async function searchProjects(text: string): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return projects.filter((project) => project.toLowerCase().includes(text.toLowerCase()));
}

export function RemoteSearchFieldExample() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  // null means no search has finished yet. The application keeps this state: SearchField has none.
  const [results, setResults] = useState<string[] | null>(null);
  const latest = useRef(0);

  // Resetting also drops any pending request, so a late response cannot reappear.
  function reset() {
    latest.current += 1;
    setSearching(false);
    setResults(null);
  }

  // Enter starts the request, so typing sends nothing.
  async function handleSubmit(text: string) {
    if (text.trim() === '') {
      reset();
      return;
    }
    const id = ++latest.current;
    setSearching(true);
    const found = await searchProjects(text.trim());
    // Ignore a response that a newer search or a reset has replaced.
    if (id !== latest.current) return;
    setResults(found);
    setSearching(false);
  }

  // Emptying the field by hand reports only a change, and Escape or the clear button report an empty change first,
  // so an empty change is the one signal that covers all three.
  function handleChange(text: string) {
    setQuery(text);
    if (text === '') reset();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <SearchField
        label="Search projects"
        description="Press Enter to search."
        value={query}
        onChange={handleChange}
        onSubmit={handleSubmit}
      />
      {searching ? <p>Searching projects</p> : null}
      {!searching && results !== null ? (
        results.length > 0 ? (
          <ul>
            {results.map((project) => (
              <li key={project}>{project}</li>
            ))}
          </ul>
        ) : (
          <p>No projects found.</p>
        )
      ) : null}
    </div>
  );
}
