import { CheckboxField } from "@muxui/react";

export function BasicCheckboxFieldExample() {
  return <CheckboxField.Root defaultChecked><CheckboxField.Button><CheckboxField.Indicator />Email updates</CheckboxField.Button><CheckboxField.Description>Receive product news.</CheckboxField.Description></CheckboxField.Root>;
}
