import { useState } from 'react';
import type { FormEvent } from 'react';
import { Autocomplete, Button, ComboBox, Form } from '@muxui/react';

// Each record's label, ID, and value all differ.
const cities = [
  { id: 'mel', label: 'Melbourne', value: 'MEL' },
  { id: 'syd', label: 'Sydney', value: 'SYD' },
  { id: 'per', label: 'Perth', value: 'PER' },
];

export function ComboBoxSubmittedExample() {
  // null means no option is selected.
  const [depotId, setDepotId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitted(`depot=${String(data.get('depot'))}, destination=${String(data.get('destination'))}`);
  }

  return (
    <Form onSubmit={handleSubmit}>
      {/* A known record is required, so the form gets its ID, or an empty value, never unmatched text. */}
      <ComboBox
        label="Depot"
        name="depot"
        items={cities}
        selectedId={depotId}
        // onSelect receives no item when the selection clears.
        onSelect={(item) => setDepotId(item?.id ?? null)}
      />
      {/* Typed text is a valid value, so the form gets the suggestion's value, or the text as typed. */}
      <Autocomplete label="Destination" name="destination" items={cities} />
      <Button type="submit">Save</Button>
      <p>Selected depot ID {depotId ?? 'none'}</p>
      {submitted === null ? null : <p>Submitted {submitted}</p>}
    </Form>
  );
}
