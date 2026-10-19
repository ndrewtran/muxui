import { useState } from 'react';
import { Image } from '@muxui/react';

// Data URLs keep the example self-contained: the first two never decode, so the browser reports an error for each.
const missingPrimary = 'data:image/png;base64,';
const missingFallback = 'data:image/png;base64,AAAA';
const workingFallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90'%3E%3Crect width='160' height='90' fill='%232563eb'/%3E%3C/svg%3E";

function Attempt({ title, fallbackSrc }: { title: string; fallbackSrc: string }) {
  const [errors, setErrors] = useState(0);
  return (
    <figure style={{ margin: 0 }}>
      <Image src={missingPrimary} fallbackSrc={fallbackSrc} alt={title} width={160} height={90} radius="md" onError={() => setErrors((count) => count + 1)} />
      <figcaption>{title}: {errors} error events</figcaption>
    </figure>
  );
}

export function ImageRecoveryExample() {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <Attempt title="Fallback loads" fallbackSrc={workingFallback} />
      <Attempt title="Fallback fails" fallbackSrc={missingFallback} />
    </div>
  );
}
