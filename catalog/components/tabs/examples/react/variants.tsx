import { Tabs } from '@muxui/react';

const sections = [
  { id: 'overview', label: 'Overview', panel: 'Project overview' },
  { id: 'activity', label: 'Activity', panel: 'Recent project activity' },
  { id: 'team', label: 'Team', panel: 'Project team members' },
];

const filters = [
  { id: 'all', label: 'All', panel: 'Every task' },
  { id: 'open', label: 'Open', panel: 'Tasks still in progress' },
  { id: 'closed', label: 'Closed', panel: 'Finished tasks' },
];

const ranges = [
  { id: 'day', label: 'Day', panel: 'Activity today' },
  { id: 'week', label: 'Week', panel: 'Activity this week' },
  { id: 'month', label: 'Month', panel: 'Activity this month' },
];

const views = [
  { id: 'overview', label: 'Overview', panel: 'Project overview' },
  { id: 'activity', label: 'Activity', panel: 'Recent project activity' },
  { id: 'team', label: 'Team', panel: 'Project team members' },
  { id: 'billing', label: 'Billing', panel: 'Plan and invoices' },
  { id: 'settings', label: 'Settings', panel: 'Project settings' },
];

// Each variant sits in a context where it reads well. None carries a meaning of its own.
export function TabsVariantsExample() {
  return (
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      <div>
        <h3>Underline: the sections of a page</h3>
        <Tabs aria-label="Project sections" variant="underline" items={sections} />
      </div>
      <div>
        <h3>Pill: filters above a list</h3>
        <Tabs aria-label="Task filters" variant="pill" items={filters} />
      </div>
      <div>
        <h3>Segment: a few peer views in a panel</h3>
        <Tabs aria-label="Activity range" variant="segment" items={ranges} />
      </div>
      <div style={{ maxWidth: '20rem' }}>
        <h3>Overflow: more tabs than fit</h3>
        <Tabs aria-label="Project views" variant="overflow" items={views} />
      </div>
    </div>
  );
}
