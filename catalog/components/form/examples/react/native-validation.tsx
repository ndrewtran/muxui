import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Form, TextField } from '@muxui/react';

export function FormNativeValidationExample() {
  const [subscribed, setSubscribed] = useState('');

  // With native validation this handler runs only after every field passes the browser's checks.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubscribed(String(new FormData(event.currentTarget).get('email')));
  }

  return (
    <Form onSubmit={handleSubmit}>
      {/* The browser checks required and type when the form is submitted. errorMessage replaces its wording. */}
      <TextField label="Name" name="name" required errorMessage="Enter your name." />
      <TextField label="Email" name="email" type="email" required errorMessage="Enter an email address." />
      <div>
        <Button type="submit">Subscribe</Button>
      </div>
      {subscribed ? <p>Subscribed {subscribed}</p> : null}
    </Form>
  );
}
