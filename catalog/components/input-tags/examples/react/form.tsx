import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Form, InputTags } from '@muxui/react';

export function InputTagsFormExample() {
  const [tags, setTags] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [submitted, setSubmitted] = useState<string[] | null>(null);
  const missing = tried && tags.length === 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    // Required marks the field but does not check it, so the application does.
    if (tags.length > 0) setSubmitted(tags);
  }

  return (
    <Form onSubmit={handleSubmit}>
      <InputTags.Root
        label="Topics"
        required
        value={tags}
        onChange={setTags}
        invalid={missing}
        errorMessage="Add at least one topic."
      />
      <Button type="submit">Save</Button>
      {submitted === null ? null : <p>Submitted {submitted.join(', ')}</p>}
    </Form>
  );
}
