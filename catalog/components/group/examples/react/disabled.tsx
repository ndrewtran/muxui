import { Button, Group } from '@muxui/react';

export function DisabledGroupExample() {
  return (
    <Group aria-label="Document actions" disabled>
      <Button disabled>Save</Button>
      <Button disabled>Duplicate</Button>
      <Button disabled>Archive</Button>
    </Group>
  );
}
