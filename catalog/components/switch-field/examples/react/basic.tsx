import { SwitchField } from '@muxui/react';

export function BasicSwitchFieldExample() {
  return (
    <SwitchField.Root defaultChecked>
      <SwitchField.Button>
        <SwitchField.Thumb />
        Notifications
      </SwitchField.Button>
      <SwitchField.Description>Send product updates by email.</SwitchField.Description>
    </SwitchField.Root>
  );
}
