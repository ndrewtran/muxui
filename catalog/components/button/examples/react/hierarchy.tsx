import { Button } from '@muxui/react';

const row = { display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'center' } as const;

export function ButtonHierarchyExample() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      {/* One main action, with lower emphasis for the rest of the group. */}
      <div style={row}>
        <Button onActivate={() => undefined}>Save changes</Button>
        <Button variant="neutral" onActivate={() => undefined}>Cancel</Button>
        <Button variant="ghost" onActivate={() => undefined}>Reset</Button>
      </div>
      {/* A destructive action that is the main action of its group takes danger. */}
      <div style={row}>
        <Button variant="danger" onActivate={() => undefined}>Delete project</Button>
        <Button variant="neutral" onActivate={() => undefined}>Cancel</Button>
      </div>
      {/* A destructive action among repeated items takes the quieter danger-ghost. */}
      <div style={row}>
        <span>Quarterly report</span>
        <Button variant="danger-ghost" size="sm" onActivate={() => undefined}>Remove</Button>
      </div>
    </div>
  );
}
