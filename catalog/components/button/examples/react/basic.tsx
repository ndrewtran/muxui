import { Button } from '@muxui/react';

export function BasicButtonExample() {
  return (
    <Button
      variant="danger"
      size="sm"
      onActivate={() => undefined}
    >
      Delete
    </Button>
  );
}
