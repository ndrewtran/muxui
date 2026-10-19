import { useState } from "react";
import { Card } from "@muxui/react";

export function SelectableCardExample() {
  const [selected, setSelected] = useState(false);
  return (
    <Card.Button selected={selected} onActivate={() => setSelected((current) => !current)}>
      <Card.Header>Team plan</Card.Header>
      <Card.Body>Up to 10 members</Card.Body>
    </Card.Button>
  );
}
