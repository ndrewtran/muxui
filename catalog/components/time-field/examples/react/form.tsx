import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Form, TimeField } from '@muxui/react';

// A time with seconds, as a database column returns it.
const stored = '09:30:45';

export function TimeFieldFormExample() {
  const [time, setTime] = useState<string | null>(stored);
  const [submitted, setSubmitted] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(String(new FormData(event.currentTarget).get('opensAt')));
  }

  return (
    // A controlled field keeps its value on reset, so the application restores it.
    <Form onSubmit={handleSubmit} onReset={() => { setTime(stored); setSubmitted(null); }}>
      <TimeField label="Opens at" name="opensAt" value={time} onChange={setTime} />
      <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Button type="submit">Save</Button>
        <Button onActivate={() => setTime(null)}>Clear</Button>
        <Button type="reset">Reset</Button>
      </div>
      <p>Value {time ?? 'null'}</p>
      {submitted === null ? null : <p>Submitted "{submitted}"</p>}
    </Form>
  );
}
