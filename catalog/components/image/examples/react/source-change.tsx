import { useState } from 'react';
import { Button, Image } from '@muxui/react';

// Data URLs keep the example self-contained: the missing source never decodes.
const missingSource = 'data:image/png;base64,';
const workingSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90'%3E%3Crect width='160' height='90' fill='%232563eb'/%3E%3C/svg%3E";
const fallbackSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90'%3E%3Crect width='160' height='90' fill='%236b7280'/%3E%3C/svg%3E";

export function ImageSourceChangeExample() {
  const [src, setSrc] = useState(missingSource);
  return (
    <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'start' }}>
      <Image src={src} fallbackSrc={fallbackSource} alt="Workspace overview" width={160} height={90} radius="md" />
      <Button onActivate={() => setSrc((current) => (current === missingSource ? workingSource : missingSource))}>
        {src === missingSource ? 'Use a working source' : 'Use a missing source'}
      </Button>
    </div>
  );
}
