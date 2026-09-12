import { GridList } from '@muxui/react';

const views = [
  { id: 'overview', label: 'Project overview' },
  { id: 'activity', label: 'Recent activity' },
  { id: 'team', label: 'Team members' },
];

export function BasicGridListExample() {
  return <GridList aria-label="Project views" items={views} />;
}
