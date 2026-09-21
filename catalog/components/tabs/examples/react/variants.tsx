import { Tabs } from '@muxui/react';

const items = [
  { id: 'overview', label: 'Overview', panel: 'Project overview' },
  { id: 'activity', label: 'Activity', panel: 'Recent project activity' },
  { id: 'team', label: 'Team', panel: 'Project team members' },
  { id: 'settings', label: 'Settings', panel: 'Project settings' },
];

export function TabsVariantsExample() {
  return (
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      <div>
        <h3>Underline</h3>
        <Tabs aria-label="Underline sections" variant="underline" items={items} />
      </div>
      <div>
        <h3>Pill</h3>
        <Tabs aria-label="Pill sections" variant="pill" items={items} />
      </div>
      <div>
        <h3>Segment</h3>
        <Tabs aria-label="Segment sections" variant="segment" items={items} />
      </div>
      <div style={{ maxWidth: '20rem' }}>
        <h3>Overflow</h3>
        <Tabs aria-label="Overflow sections" variant="overflow" items={items} />
      </div>
    </div>
  );
}
