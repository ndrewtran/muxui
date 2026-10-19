import { Meter } from '@muxui/react';

export function CustomRangeMeterExample() {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <Meter label="Temperature as a percent of the range" value={60} minValue={20} maxValue={100} />
      <Meter label="Temperature as a raw value" value={60} minValue={20} maxValue={100} formatOptions={{ style: 'unit', unit: 'celsius' }} />
    </div>
  );
}
