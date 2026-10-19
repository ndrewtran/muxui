import { Button, ButtonGroup } from "@muxui/react";

export function AttachedButtonGroupExample() {
  return (
    <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
      <ButtonGroup attached aria-label="Document actions">
        <Button>Save</Button>
        <Button>Share</Button>
        <Button disabled>Export</Button>
      </ButtonGroup>
      <ButtonGroup attached orientation="vertical" aria-label="Page order">
        <Button>Move up</Button>
        <Button>Move down</Button>
      </ButtonGroup>
    </div>
  );
}
