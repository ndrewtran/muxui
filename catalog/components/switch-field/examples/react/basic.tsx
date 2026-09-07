import { SwitchField } from "@muxui/react";

export function BasicSwitchFieldExample() {
  return <SwitchField.Root defaultChecked><SwitchField.Button><SwitchField.Thumb />Notifications</SwitchField.Button><SwitchField.Description>Enable product updates.</SwitchField.Description></SwitchField.Root>;
}
