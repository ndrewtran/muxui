import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, SwitchField } from '@muxui/react';

export function SwitchFieldFormExample() {
  const [enabled, setEnabled] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    // An off switch adds no entry, so only an on switch appears here.
    const entries = [...new FormData(event.currentTarget)].map(([name, value]) => `${name}=${String(value)}`);
    setSubmitted(entries.join(', ') || 'Nothing submitted');
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        {/* Root owns the boolean and its change callback. Button is a label, and Thumb draws the knob. */}
        <SwitchField.Root
          checked={enabled}
          onChange={setEnabled}
          name="notifications"
          value="on"
          required
          invalid={attempted && !enabled}
        >
          <SwitchField.Button>
            <SwitchField.Thumb />
            Notifications
          </SwitchField.Button>
          <SwitchField.Description>Submitted as notifications=on while the switch is on.</SwitchField.Description>
          <SwitchField.Error>Notifications must be on.</SwitchField.Error>
        </SwitchField.Root>
        <div>
          <Button type="submit">Submit</Button>
        </div>
        {submitted ? <p>Submitted: {submitted}</p> : null}
      </div>
    </form>
  );
}
