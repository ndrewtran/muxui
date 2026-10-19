import { Input, Text } from '@muxui/react';

export function TextInFieldExample() {
  return (
    <div style={{ display: 'grid', gap: '1.5rem', inlineSize: '20rem' }}>
      <div style={{ display: 'grid', gap: '0.25rem' }}>
        <Text as="label" variant="label" htmlFor="display-name">Display name</Text>
        <input id="display-name" />
      </div>
      <Input.Root>
        <Input.Label>Email</Input.Label>
        <Input.Input />
        <Text slot="description" color="muted">We only use this to send receipts.</Text>
      </Input.Root>
    </div>
  );
}
