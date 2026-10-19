import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Form, SelectNative } from '@muxui/react';

export function SelectNativeFormExample() {
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const labels = new FormData(event.currentTarget).getAll('labels').map(String);
    setError(labels.length === 0 ? 'Choose at least one label.' : '');
    setSubmitted(labels);
  }

  return (
    <Form onSubmit={handleSubmit} onReset={() => { setError(''); setSubmitted(null); }}>
      <SelectNative label="Priority" name="priority" size="sm" defaultValue="normal">
        <option value="normal">Normal</option>
        <option value="high">High</option>
      </SelectNative>
      {/* A number is the native count of visible rows, and the select keeps the md visual size. */}
      <SelectNative label="Labels" name="labels" multiple size={4} defaultValue={['bug']} errorMessage={error}>
        <option value="bug">Bug</option>
        <option value="docs">Docs</option>
        <option value="design">Design</option>
        <option value="research">Research</option>
      </SelectNative>
      <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Button type="submit">Save</Button>
        <Button type="reset">Reset</Button>
      </div>
      {submitted === null ? null : <p>Submitted {submitted.join(', ') || 'no labels'}</p>}
    </Form>
  );
}
