import { useEffect, useRef, useState } from 'react';
import { Button, Tabs } from '@muxui/react';

const views = [
  { id: 'overview', label: 'Overview', content: 'Project overview' },
  { id: 'activity', label: 'Activity', content: 'Recent project activity' },
  { id: 'team', label: 'Team', content: 'Project team members' },
];

function ActivationTabs({ title, keyboardActivation }: { title: string; keyboardActivation: 'automatic' | 'manual' }) {
  const [value, setValue] = useState('overview');
  // The id of the tab whose content has arrived. The first tab starts out loaded.
  const [loaded, setLoaded] = useState('overview');
  const [started, setStarted] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Tabs loads nothing. The application starts the request when a tab is selected and shows its loading state.
  function select(id: string) {
    setValue(id);
    setStarted((count) => count + 1);
    window.clearTimeout(timer.current);
    // Stands in for the application's request.
    timer.current = window.setTimeout(() => setLoaded(id), 800);
  }

  function reset() {
    window.clearTimeout(timer.current);
    setValue('overview');
    setLoaded('overview');
    setStarted(0);
  }

  return (
    <div>
      <h3>{title}</h3>
      <Tabs
        aria-label={title}
        keyboardActivation={keyboardActivation}
        value={value}
        onChange={select}
        items={views.map((view) => ({
          id: view.id,
          label: view.label,
          panel: loaded === view.id ? <p>{view.content}</p> : <p>Loading {view.label.toLowerCase()}.</p>,
        }))}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <p>Requests started: {started}</p>
        <Button size="sm" variant="neutral" onActivate={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

// Focus a tab, then press the arrow keys to compare the two.
export function TabsActivationExample() {
  return (
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      <ActivationTabs title="Automatic: an arrow key selects the tab it reaches" keyboardActivation="automatic" />
      <ActivationTabs title="Manual: an arrow key moves focus, and Enter or Space selects" keyboardActivation="manual" />
    </div>
  );
}
