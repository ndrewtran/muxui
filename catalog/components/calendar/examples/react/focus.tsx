import { useState } from 'react';
import { Button, Calendar } from '@muxui/react';

const booked = ['2026-08-27', '2026-08-28'];

export function CalendarFocusExample() {
  const [value, setValue] = useState<string | null>('2026-08-26');
  const [focused, setFocused] = useState('2026-08-26');

  return (
    <>
      <Calendar
        label="Delivery date"
        value={value}
        onChange={(next) => setValue(next ?? null)}
        focusedValue={focused}
        onFocusChange={(next) => { if (next) setFocused(next); }}
        unavailableDateMatcher={(date) => booked.includes(date)}
      />
      <Button onActivate={() => setFocused('2026-09-15')}>Go to 15 September</Button>
      <p>Selected {value ?? 'none'}, focused {focused}</p>
    </>
  );
}
