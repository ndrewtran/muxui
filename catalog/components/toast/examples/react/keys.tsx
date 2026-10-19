import { useState } from 'react';
import { Button, ToastProvider, useToast } from '@muxui/react';

function ExportControls() {
  const { add, remove } = useToast();
  const [key, setKey] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <Button
        disabled={key !== null}
        onActivate={() => {
          // A duration of zero sets no expiry timer, so this toast stays until it is dismissed or removed.
          setKey(add('Preparing the export.', {
            title: 'Export',
            duration: 0,
            onDismiss: () => setKey(null),
          }));
        }}
      >
        Start export
      </Button>
      <Button
        disabled={key === null}
        onActivate={() => {
          if (key === null) return;
          remove(key);
          add('The export is ready.', { title: 'Export' });
        }}
      >
        Finish export
      </Button>
    </div>
  );
}

export function ToastKeysExample() {
  return (
    <ToastProvider maxVisible={3} placement="bottom-end">
      <ExportControls />
    </ToastProvider>
  );
}
