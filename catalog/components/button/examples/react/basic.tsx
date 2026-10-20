import { Button } from '@muxui/react';

export function BasicButtonExample() {
  return (
    <Button
      variant="danger"
      size="md"
      onActivate={() => undefined}
    >
      Delete
    </Button>
  );
}
