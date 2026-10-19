import { useState } from 'react';
import { DateRangePicker } from '@muxui/react';
import type { MuxUIDateRange } from '@muxui/react';

const dayMs = 24 * 60 * 60 * 1000;

// The anchor is the start date chosen so far, or null before the first choice.
// Once a start is chosen, dates more than six days from it are unavailable.
function isBeyondSevenDays(date: string, anchor: string | null) {
  return anchor !== null && Math.abs(Date.parse(date) - Date.parse(anchor)) > 6 * dayMs;
}

export function DateRangePickerRangeExample() {
  const [range, setRange] = useState<MuxUIDateRange | null>({ start: '2026-08-26', end: '2026-08-26' });

  return (
    <>
      <DateRangePicker
        label="Trip dates"
        value={range}
        onChange={setRange}
        unavailableDateMatcher={isBeyondSevenDays}
      />
      <p>{range ? `${range.start} to ${range.end}` : 'No range'}</p>
    </>
  );
}
