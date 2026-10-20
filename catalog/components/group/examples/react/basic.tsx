import { Button, Group } from '@muxui/react';

export function BasicGroupExample() {
  return <Group aria-label="Document actions"><Button>Save</Button><Button variant="neutral">Duplicate</Button><Button variant="neutral">Archive</Button></Group>;
}
