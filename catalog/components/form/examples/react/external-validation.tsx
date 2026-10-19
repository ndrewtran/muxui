import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Form, TextField } from '@muxui/react';

type Errors = Record<string, string | string[]>;

// Stand in for a server that validates by field name.
function validate(values: FormData): Errors {
  const errors: Errors = {};
  if (values.get('username') === 'ada') errors.username = 'Username is taken.';
  if (!String(values.get('email')).includes('@')) {
    errors.email = ['Enter an email address.', 'It needs an @ sign.'];
  }
  return errors;
}

export function FormExternalValidationExample() {
  const [errors, setErrors] = useState<Errors>({});
  const [created, setCreated] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    // Each response is a new object, so Form shows it even when its content repeats.
    const next = validate(values);
    setErrors(next);
    setCreated(Object.keys(next).length === 0);
    setPending(false);
  }

  return (
    <Form
      validationErrors={errors}
      onSubmit={handleSubmit}
      onReset={() => {
        setErrors({});
        setCreated(false);
      }}
    >
      <TextField label="Username" name="username" defaultValue="ada" />
      <TextField label="Email" name="email" />
      <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        <Button type="submit" pending={pending}>Create account</Button>
        <Button type="reset" disabled={pending}>Reset</Button>
      </div>
      {created ? <p>Account created</p> : null}
    </Form>
  );
}
