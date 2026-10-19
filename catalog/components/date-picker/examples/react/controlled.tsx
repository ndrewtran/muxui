import { useState } from 'react';
import { Button, DatePicker } from '@muxui/react';

// Weekends are unavailable. The matcher receives the serialized YYYY-MM-DD string.
function isWeekend(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function DatePickerControlledExample() {
  const [date, setDate] = useState<string | null>('2026-08-26');
  const [open, setOpen] = useState(false);

  return (
    <>
      <DatePicker
        label="Due date"
        value={date}
        onChange={setDate}
        open={open}
        onOpenChange={setOpen}
        unavailableDateMatcher={isWeekend}
      />
      <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Button onActivate={() => setOpen(true)}>Show calendar</Button>
        <Button onActivate={() => setDate(null)}>Clear date</Button>
      </div>
      <p>Date {date ?? 'null'}, calendar {open ? 'open' : 'closed'}</p>
    </>
  );
}
