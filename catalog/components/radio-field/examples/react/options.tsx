import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, RadioField, RadioGroup } from '@muxui/react';

export function RadioFieldOptionsExample() {
  // The group owns the selected value and the change callback. A RadioField has neither.
  const [plan, setPlan] = useState('');
  const [attempted, setAttempted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <RadioGroup label="Plan" name="plan" value={plan} onChange={setPlan} invalid={attempted && plan === ''}>
          <RadioField.Root value="monthly">
            <RadioField.Button>
              <RadioField.Indicator>
                <RadioField.Dot />
              </RadioField.Indicator>
              Monthly
            </RadioField.Button>
            <RadioField.Description>Billed every month.</RadioField.Description>
            <RadioField.Error>Choose a plan to continue.</RadioField.Error>
          </RadioField.Root>
          <RadioField.Root value="yearly">
            <RadioField.Button>
              <RadioField.Indicator>
                <RadioField.Dot />
              </RadioField.Indicator>
              Yearly
            </RadioField.Button>
            <RadioField.Description>Billed once a year.</RadioField.Description>
            <RadioField.Error>Choose a plan to continue.</RadioField.Error>
          </RadioField.Root>
          <RadioField.Root value="invoice" disabled>
            <RadioField.Button>
              <RadioField.Indicator>
                <RadioField.Dot />
              </RadioField.Indicator>
              Invoice
            </RadioField.Button>
            <RadioField.Description>Unavailable on this account.</RadioField.Description>
          </RadioField.Root>
        </RadioGroup>
        <div>
          <Button type="submit">Continue</Button>
        </div>
      </div>
    </form>
  );
}
