import { useState } from 'react';
import { ListBox, type MuxUISelection } from '@muxui/react';

export function GridListBoxExample() {
  const [selectedIds, setSelectedIds] = useState<MuxUISelection>(['blue']);
  return <ListBox.Root aria-label="Color" layout="grid" selectedIds={selectedIds} onSelectionChange={setSelectedIds}
    style={{ gridTemplateColumns: 'repeat(3, minmax(4rem, 1fr))' }}>
    <ListBox.Section>
      <ListBox.Header>Colors</ListBox.Header>
      <ListBox.Item id="blue" textValue="Blue"><strong>Blue</strong></ListBox.Item>
      <ListBox.Item id="green" textValue="Green"><strong>Green</strong></ListBox.Item>
      <ListBox.Item id="red" textValue="Red"><strong>Red</strong></ListBox.Item>
      <ListBox.Item id="amber" textValue="Amber"><strong>Amber</strong></ListBox.Item>
      <ListBox.Item id="violet" textValue="Violet"><strong>Violet</strong></ListBox.Item>
      <ListBox.Item id="gray" disabled>Gray</ListBox.Item>
    </ListBox.Section>
  </ListBox.Root>;
}
