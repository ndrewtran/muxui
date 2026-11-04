import { Button } from '@muxui/react';

export default function PendingIsland() {
  return (
    <form action="/submitted/" id="pending-island-form">
      <Button type="submit" pending>Save</Button>
    </form>
  );
}
