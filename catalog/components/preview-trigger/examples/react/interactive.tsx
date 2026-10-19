import { useState } from 'react';
import { Button, PreviewTrigger } from '@muxui/react';

export function InteractivePreviewTriggerExample() {
  const [saved, setSaved] = useState(false);

  return (
    <PreviewTrigger
      aria-label="Report preview"
      trigger={<a href="#quarterly-report">Quarterly report</a>}
    >
      <p>Revenue by region, 4 pages.</p>
      <Button onActivate={() => setSaved(true)}>{saved ? 'Saved' : 'Save for later'}</Button>
    </PreviewTrigger>
  );
}
