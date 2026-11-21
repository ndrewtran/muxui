import { Skeleton } from '@muxui/react';

export function BasicSkeletonExample() {
  return <Skeleton.Root label="Loading post" style={{ display: 'grid', gap: '0.75rem', maxInlineSize: '24rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <Skeleton.Circle size="sm" />
      <Skeleton.Line width="40%" />
    </div>
    <div>
      <Skeleton.Line />
      <Skeleton.Line width="72%" />
    </div>
    <Skeleton.Block aspectRatio="16 / 9" />
  </Skeleton.Root>;
}
