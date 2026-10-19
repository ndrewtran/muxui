import { useId } from 'react';
import { Meter } from '@muxui/react';

export function ExternalLabelMeterExample() {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} style={{ margin: 0 }}>Disk usage</p>
      <Meter label="Disk usage" aria-labelledby={labelId} value={72} />
    </div>
  );
}
