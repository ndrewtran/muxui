import { Text } from '@muxui/react';

export function BasicTextExample() {
  return <div>
    <Text as="h2" variant="heading" size="m">Account</Text>
    <Text color="muted">Manage your profile details.</Text>
    <Text variant="mono" size="s">user@example.com</Text>
    <Text truncate>Long text remains available to assistive technology when its container clips it.</Text>
  </div>;
}
