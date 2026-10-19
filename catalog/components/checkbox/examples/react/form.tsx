import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Checkbox } from '@muxui/react';

export function CheckboxFormExample() {
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // An unchecked Checkbox adds no entry, so a missing name means it was not accepted.
    if (!data.has('terms')) {
      setError('Accept the terms to continue.');
      setResult('');
      return;
    }
    setError('');
    setResult(`Submitted terms=${String(data.get('terms'))}`);
  }

  return (
    // noValidate lets the application show its own message instead of the browser's.
    <form noValidate onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Checkbox
          name="terms"
          value="accepted"
          required
          invalid={error !== ''}
          aria-describedby={error ? 'terms-error' : undefined}
          onChange={() => setError('')}
        >
          Accept terms
        </Checkbox>
        {error ? <p id="terms-error">{error}</p> : null}
        <div>
          <Button type="submit">Continue</Button>
        </div>
        {result ? <p>{result}</p> : null}
      </div>
    </form>
  );
}
