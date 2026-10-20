import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Form, TextField } from '@muxui/react';

export function FormInlineValidationExample() {
  const [email, setEmail] = useState('');
  const [left, setLeft] = useState(false);
  const [subscribed, setSubscribed] = useState('');
  // Aria validation shows no browser error and blocks no submit, so the application decides when the field is invalid.
  const valid = email.includes('@');
  const invalid = left && !valid;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeft(true);
    // The handler runs even while the field is invalid, so check the value again here.
    if (valid) setSubscribed(email);
  }

  return (
    <Form validationBehavior="aria" onSubmit={handleSubmit}>
      {/* The error appears once the user leaves the field, then follows each edit. */}
      <TextField
        label="Email"
        name="email"
        value={email}
        onChange={setEmail}
        invalid={invalid}
        errorMessage="Enter an email address with an @."
        inputProps={{ onBlur: () => setLeft(true) }}
      />
      <div>
        <Button type="submit">Subscribe</Button>
      </div>
      {subscribed ? <p>Subscribed {subscribed}</p> : null}
    </Form>
  );
}
