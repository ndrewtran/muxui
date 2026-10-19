import { useState } from 'react';
import type { FormEvent } from 'react';
import { Autocomplete, Button, Form } from '@muxui/react';

const cities = [
  { label: 'Melbourne', value: 'MEL' },
  { label: 'Sydney', value: 'SYD' },
];

export function AutocompleteFormExample() {
  const [selected, setSelected] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(String(new FormData(event.currentTarget).get('city')));
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Autocomplete
        label="City"
        name="city"
        items={cities}
        onSelect={(item) => setSelected(item ? String(item.label) : '')}
      />
      <Button type="submit">Search</Button>
      {selected ? <p>Selected {selected}</p> : null}
      {submitted === null ? null : <p>Submitted {submitted}</p>}
    </Form>
  );
}
