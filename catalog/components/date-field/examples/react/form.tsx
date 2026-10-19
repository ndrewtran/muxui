import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, DateField, Form } from '@muxui/react';

export function DateFieldFormExample() {
  const [date, setDate] = useState<string | null>('2026-08-26');
  const [submitted, setSubmitted] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(String(new FormData(event.currentTarget).get('birthday')));
  }

  return (
    <Form onSubmit={handleSubmit}>
      <DateField label="Birthday" name="birthday" value={date} onChange={setDate} />
      <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Button type="submit">Save</Button>
        <Button onActivate={() => setDate(null)}>Clear</Button>
      </div>
      <p>Value {date ?? 'null'}</p>
      {submitted === null ? null : <p>Submitted "{submitted}"</p>}
    </Form>
  );
}
