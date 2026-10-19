import { ListBox, Text } from '@muxui/react';

export function TextInCollectionExample() {
  return (
    <ListBox aria-label="Workspaces">
      <ListBox.Item id="design" textValue="Design">
        <Text slot="label">Design</Text>
        <Text slot="description" color="muted">12 members</Text>
      </ListBox.Item>
      <ListBox.Item id="research" textValue="Research">
        <Text>Research</Text>
        <Text slot="description" color="muted">4 members</Text>
      </ListBox.Item>
    </ListBox>
  );
}
