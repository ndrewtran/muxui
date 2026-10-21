import { TagGroup } from '@muxui/react';

const variants = ['soft', 'outline', 'dot', 'strong'] as const;

// A colour never carries meaning alone: every tag names its status or category in its label.
export function ColouredTagGroupExample() {
  return (
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      <div>
        <h3>Status</h3>
        <TagGroup
          label="Task status"
          items={[
            { id: 'done', label: 'Done', color: 'success' },
            { id: 'review', label: 'In review', color: 'warning' },
            { id: 'blocked', label: 'Blocked', color: 'error' },
            { id: 'draft', label: 'Draft' },
          ]}
        />
      </div>
      <div>
        <h3>Categories</h3>
        <TagGroup
          label="Article topics"
          items={[
            { id: 'design', label: 'Design', color: 'violet' },
            { id: 'engineering', label: 'Engineering', color: 'sky' },
            { id: 'research', label: 'Research', color: 'amber' },
            { id: 'writing', label: 'Writing', color: 'rose' },
          ]}
        />
      </div>
      <div>
        <h3>Variants</h3>
        {variants.map((variant) => (
          <TagGroup key={variant} label={`The ${variant} variant`} variant={variant} color="brand" items={['Design', 'Engineering', 'Research']} />
        ))}
      </div>
    </div>
  );
}
