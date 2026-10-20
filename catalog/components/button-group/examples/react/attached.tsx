import { Button, ButtonGroup } from "@muxui/react";

export function AttachedButtonGroupExample() {
  return (
    <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
      <ButtonGroup attached aria-label="Document actions">
        <Button variant="neutral">Copy</Button>
        <Button variant="neutral">Share</Button>
        <Button variant="neutral" disabled>Export</Button>
      </ButtonGroup>
      <ButtonGroup attached orientation="vertical" aria-label="Page order">
        <Button variant="neutral">Move up</Button>
        <Button variant="neutral">Move down</Button>
      </ButtonGroup>
    </div>
  );
}
