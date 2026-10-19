import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, DateRangePicker, Form } from '@muxui/react';
import type { MuxUIDateRange } from '@muxui/react';

const initial: MuxUIDateRange = { start: '2026-09-01', end: '2026-09-05' };

export function DateRangePickerFormExample() {
  const [range, setRange] = useState<MuxUIDateRange | null>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Stand in for a server that answers with errors keyed by the endpoint names.
    // Each response is a new object, so Form shows it even when its content repeats.
    setErrors(data.get('checkOut') === initial.end ? { checkOut: 'No rooms are free on this date.' } : {});
  }

  return (
    <Form
      validationErrors={errors}
      onSubmit={handleSubmit}
      // A controlled picker keeps its value on reset, so the application restores it.
      onReset={() => {
        setRange(initial);
        setErrors({});
      }}
    >
      <DateRangePicker
        label="Stay"
        startName="checkIn"
        endName="checkOut"
        value={range}
        onChange={setRange}
      />
      <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Button type="submit">Check availability</Button>
        <Button type="reset">Reset</Button>
      </div>
    </Form>
  );
}
