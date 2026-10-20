import { Button, Group } from '@muxui/react';

export function DisabledGroupExample() {
  return (
    <Group aria-label="Document actions" disabled>
      <Button disabled>Save</Button>
      <Button variant="neutral" disabled>Duplicate</Button>
      <Button variant="neutral" disabled>Archive</Button>
    </Group>
  );
}
