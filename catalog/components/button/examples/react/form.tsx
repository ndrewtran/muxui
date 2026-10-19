import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Form, TextField } from '@muxui/react';

export function ButtonFormExample() {
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name'));
    setPending(true);
    // Stand in for the application's request.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaved(name);
    setPending(false);
  }

  return (
    <Form onSubmit={handleSubmit} onReset={() => setSaved('')}>
      <TextField label="Name" name="name" defaultValue="Ada" />
      <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Button type="submit" pending={pending}>Save</Button>
        <Button type="reset" disabled={pending}>Reset</Button>
      </div>
      {saved ? <p>Saved {saved}</p> : null}
    </Form>
  );
}
