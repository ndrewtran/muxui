import { useState } from 'react';
import { Button, ToastProvider, useToast } from '@muxui/react';

function ExportControls() {
  const { add, remove } = useToast();
  const [exporting, setExporting] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  async function startExport() {
    setExporting(true);
    // Stands in for the application's request. Work in progress stays on the Button that started it.
    await new Promise((resolve) => setTimeout(resolve, 800));
    setExporting(false);
    // Only the finished result is a toast. A duration of zero sets no expiry timer, so it stays until it is dismissed or removed.
    setKey(add('The export is ready.', {
      title: 'Export',
      variant: 'success',
      duration: 0,
      onDismiss: () => setKey(null),
    }));
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <Button pending={exporting} disabled={key !== null} onActivate={startExport}>
        Start export
      </Button>
      {/* Once the file is collected the notice is out of date, so the application removes it by its key. */}
      <Button disabled={key === null} onActivate={() => {
          if (key !== null) remove(key);
        }}>
        Download
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
