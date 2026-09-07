import { Button } from '@muxui/react';

export function ButtonVariantsExample() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'center' }}>
      <Button variant="primary" size="sm" onActivate={() => undefined}>Primary</Button>
      <Button variant="secondary" size="md" onActivate={() => undefined}>Secondary</Button>
      <Button variant="ghost" size="lg" onActivate={() => undefined}>Ghost</Button>
      <Button variant="danger" tone="destructive" size="md" onActivate={() => undefined}>Delete</Button>
    </div>
  );
}
