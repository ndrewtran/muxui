import { Text } from '@muxui/react';

export function BasicTextExample() {
  return <div>
    {/* as sets the heading level in the page outline. variant and size set the look. */}
    <Text as="h1" variant="display" size="sm">Settings</Text>
    <Text as="h2" variant="heading" size="md">Account</Text>
    <Text as="p" color="muted">Manage your profile details.</Text>
    <Text as="div" variant="label" size="sm">Email</Text>
    <Text as="div" variant="mono" size="sm">user@example.com</Text>
  </div>;
}
