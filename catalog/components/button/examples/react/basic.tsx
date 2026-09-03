import { Button } from '@muxui/react';

export function BasicButtonExample() {
  return (
    <Button
      variant="secondary"
      tone="destructive"
      size="sm"
      onActivate={() => undefined}
    >
      Delete
    </Button>
  );
}
