import { Button } from '@muxui/react';

export function BasicButtonExample() {
  return (
    <Button
      variant="primary"
      size="md"
      onActivate={() => undefined}
    >
      Delete
    </Button>
  );
}
