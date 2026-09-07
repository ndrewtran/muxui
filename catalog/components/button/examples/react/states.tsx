import { useState } from 'react';
import { Button } from '@muxui/react';

export function ButtonStatesExample() {
  const [pending, setPending] = useState(false);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'center' }}>
      <Button pending={pending} showTextWhileLoading onActivate={() => setPending(true)}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
      <Button disabled variant="secondary" onActivate={() => undefined}>Disabled</Button>
      {pending ? <Button variant="ghost" onActivate={() => setPending(false)}>Reset pending</Button> : null}
    </div>
  );
}
