import { RadioField, RadioGroup } from "@muxui/react";

export function BasicRadioFieldExample() {
  return <RadioGroup label="Plan"><RadioField.Root value="monthly"><RadioField.Button><RadioField.Indicator><RadioField.Dot /></RadioField.Indicator>Monthly</RadioField.Button></RadioField.Root></RadioGroup>;
}
