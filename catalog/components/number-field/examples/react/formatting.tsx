import { useState } from 'react';
import { NumberField } from '@muxui/react';

export function FormattingNumberFieldExample() {
  // The state holds a number. Clearing the field reports NaN, and keeping NaN keeps the field empty.
  const [amount, setAmount] = useState(2.5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <NumberField
        label="Donation"
        name="donation"
        value={amount}
        onChange={setAmount}
        minValue={0}
        maxValue={10}
        step={0.25}
        formatOptions={{ style: 'currency', currency: 'USD' }}
      />
      <p>{Number.isNaN(amount) ? 'Empty' : `The callback received ${amount}`}</p>
    </div>
  );
}
