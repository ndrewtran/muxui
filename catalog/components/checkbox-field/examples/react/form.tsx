import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, CheckboxField } from '@muxui/react';

export function CheckboxFieldFormExample() {
  const [accepted, setAccepted] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    // Only checked, enabled fields add an entry. Read-only fields still do.
    const entries = [...new FormData(event.currentTarget)].map(([name, value]) => `${name}=${String(value)}`);
    setSubmitted(entries.join(', '));
  }

  return (
    // noValidate keeps the browser's own check from running first, so the application decides when the error shows.
    <form noValidate onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <CheckboxField.Root
          checked={accepted}
          onChange={setAccepted}
          name="terms"
          value="accepted"
          required
          invalid={attempted && !accepted}
        >
          <CheckboxField.Button>
            <CheckboxField.Indicator />
            Accept terms
          </CheckboxField.Button>
          <CheckboxField.Description>Submitted as terms=accepted while checked.</CheckboxField.Description>
          <CheckboxField.Error>Accept the terms to continue.</CheckboxField.Error>
        </CheckboxField.Root>
        <CheckboxField.Root defaultChecked readOnly name="newsletter" value="yes">
          <CheckboxField.Button>
            <CheckboxField.Indicator />
            Newsletter (read-only)
          </CheckboxField.Button>
        </CheckboxField.Root>
        <CheckboxField.Root defaultChecked disabled name="beta" value="yes">
          <CheckboxField.Button>
            <CheckboxField.Indicator />
            Beta access (disabled)
          </CheckboxField.Button>
        </CheckboxField.Root>
        <div>
          <Button type="submit">Submit</Button>
        </div>
        {submitted ? <p>Submitted: {submitted}</p> : null}
      </div>
    </form>
  );
}
