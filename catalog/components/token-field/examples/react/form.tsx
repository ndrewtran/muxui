import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Form, TokenField } from '@muxui/react';

export function TokenFieldFormExample() {
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Each token is its own entry under the field name, so read them all with getAll.
    setSubmitted(new FormData(event.currentTarget).getAll('tags').map(String));
  }

  return (
    <Form onSubmit={handleSubmit} onReset={() => setSubmitted(null)}>
      <TokenField label="Tags" name="tags" defaultValue={['Design', 'Product research']} />
      <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Button type="submit">Save</Button>
        <Button type="reset">Reset</Button>
      </div>
      {submitted === null ? null : <p>Submitted {submitted.length === 0 ? 'no tags' : submitted.join(', ')}</p>}
    </Form>
  );
}
