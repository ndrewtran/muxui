import { Input } from "@muxui/react";

export function BasicInputExample() {
  return <Input.Root><Input.Label>Name</Input.Label><Input.Input placeholder="Ada Lovelace" /><Input.Description>Use your preferred display name.</Input.Description></Input.Root>;
}
