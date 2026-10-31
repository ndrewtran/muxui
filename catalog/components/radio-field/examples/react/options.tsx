import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, RadioField, RadioGroup } from '@muxui/react';

export function RadioFieldOptionsExample() {
  // The group owns the selected value and the change callback. A RadioField has neither.
  const [plan, setPlan] = useState('');
  const [attempted, setAttempted] = useState(false);
  // This account needs monthly billing; the application validates the selected plan.
  const yearlyInvalid = attempted && plan === 'yearly';
  const missingPlan = attempted && plan === '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        {/* The group is invalid when no plan is selected or the selected plan fails validation. */}
        <RadioGroup label="Plan" name="plan" value={plan} onChange={setPlan} invalid={missingPlan || yearlyInvalid} errorMessage={missingPlan ? 'Choose a plan to continue.' : undefined}>
          <RadioField.Root value="monthly">
            <RadioField.Button>
              <RadioField.Indicator>
                <RadioField.Dot />
              </RadioField.Indicator>
              Monthly
            </RadioField.Button>
            <RadioField.Description>Billed every month.</RadioField.Description>
          </RadioField.Root>
          <RadioField.Root value="yearly" invalid={yearlyInvalid}>
            <RadioField.Button>
              <RadioField.Indicator>
                <RadioField.Dot />
              </RadioField.Indicator>
              Yearly
            </RadioField.Button>
            <RadioField.Description>Billed once a year.</RadioField.Description>
            {yearlyInvalid && <RadioField.Error>This account needs monthly billing. Choose Monthly.</RadioField.Error>}
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
