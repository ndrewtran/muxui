import { Tabs } from '@muxui/react';
export function BasicTabsExample() {
  return <Tabs aria-label="Sections" items={[
    { id: 'overview', label: 'Overview', panel: 'Project overview' },
    { id: 'activity', label: 'Activity', panel: 'Recent project activity' },
  ]} />;
}
