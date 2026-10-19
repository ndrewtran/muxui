import { useState } from 'react';
import type { FormEvent, Key } from 'react';
import { Button, Form, MultiSelect } from '@muxui/react';

const options = [
  { id: 'react', label: 'React' },
  { id: 'css', label: 'CSS' },
  { id: 'html', label: 'HTML' },
];

export function MultiSelectFormExample() {
  const [selected, setSelected] = useState<Set<Key> | 'all'>(new Set(['react']));
  const [tried, setTried] = useState(false);
  const [submitted, setSubmitted] = useState<string[] | null>(null);
  // The selection can be the string 'all', so expand it before serializing.
  const ids = selected === 'all' ? options.map((option) => option.id) : [...selected].map(String);
  const missing = tried && ids.length === 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    // Required marks the field but does not check it, so the application does.
    if (ids.length > 0) setSubmitted(ids);
  }

  return (
    <Form onSubmit={handleSubmit}>
      <MultiSelect.Root
        label="Technologies"
        required
        items={options}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        invalid={missing}
        errorMessage="Choose at least one technology."
      >
        {(item) => <MultiSelect.Item id={item.id} textValue={item.label}>{item.label}</MultiSelect.Item>}
      </MultiSelect.Root>
      <Button type="submit">Save</Button>
      {submitted === null ? null : <p>Submitted {submitted.join(', ')}</p>}
    </Form>
  );
}
