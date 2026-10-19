import { useState } from 'react';
import { Button, Tree } from '@muxui/react';
import type { MuxUISelection, MuxUITreeItem } from '@muxui/react';

const initialItems: MuxUITreeItem[] = [
  {
    id: 'project',
    label: 'Mux UI project',
    children: [
      { id: 'components', label: 'Components', children: [{ id: 'button', label: 'Button.tsx' }, { id: 'table', label: 'Table.tsx' }] },
      { id: 'readme', label: 'README.md' },
    ],
  },
];

function reverse(items: MuxUITreeItem[]): MuxUITreeItem[] {
  return items.map((item) => (item.children ? { ...item, children: reverse(item.children) } : item)).reverse();
}

export function ControlledTreeExample() {
  const [items, setItems] = useState(initialItems);
  const [selectedIds, setSelectedIds] = useState<MuxUISelection>(['table']);
  const [expandedIds, setExpandedIds] = useState<MuxUISelection>(['project', 'components']);
  return (
    <div>
      <Tree
        aria-label="Project files"
        items={items}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        expandedIds={expandedIds}
        onExpandedChange={setExpandedIds}
      />
      <Button onActivate={() => setItems(reverse)}>Reverse order</Button>
    </div>
  );
}
