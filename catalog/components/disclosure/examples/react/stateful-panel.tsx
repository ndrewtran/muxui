import { useState } from 'react';
import { Button, Disclosure, TextField } from '@muxui/react';

export function StatefulPanelDisclosureExample() {
  const [expanded, setExpanded] = useState(true);
  return (
    <div style={{ width: '100%', maxWidth: '24rem' }}>
      <Disclosure title="Release note" expanded={expanded} onExpandedChange={setExpanded}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-semantic-layout-control-gap)' }}>
          <TextField label="Note" defaultValue="Draft" />
          <div>
            <Button onActivate={() => setExpanded(false)}>Done</Button>
          </div>
        </div>
      </Disclosure>
    </div>
  );
}
