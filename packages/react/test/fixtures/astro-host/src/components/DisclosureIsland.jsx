import { Button, Disclosure } from '@muxui/react';

export default function DisclosureIsland() {
  return (
    <Disclosure title="Details">
      <Button onActivate={() => undefined}>Inside panel</Button>
    </Disclosure>
  );
}
