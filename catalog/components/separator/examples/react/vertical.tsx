import { Separator } from '@muxui/react';

export function VerticalSeparatorExample() {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.75rem' }}>
      <span>Overview</span>
      <Separator orientation="vertical" />
      <span>Activity</span>
    </div>
  );
}
