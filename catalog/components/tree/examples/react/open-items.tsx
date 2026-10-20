import { useState } from 'react';
import { Tree } from '@muxui/react';
import type { MuxUITreeItem } from '@muxui/react';

// Each project is a page of its own, and it also holds pages.
const items: MuxUITreeItem[] = [
  { id: 'launch', label: 'Launch plan', children: [{ id: 'goals', label: 'Goals' }, { id: 'budget', label: 'Budget' }] },
  { id: 'research', label: 'Research', children: [{ id: 'interviews', label: 'Interviews' }, { id: 'survey', label: 'Survey' }] },
  { id: 'notes', label: 'Meeting notes' },
];

export function OpenItemsTreeExample() {
  const [opened, setOpened] = useState('nothing');
  return (
    <div>
      {/* A click on a row opens its page, so only the chevron expands. Row expansion would also expand the row on every click. */}
      <Tree
        aria-label="Project pages"
        items={items}
        selectionMode="none"
        expansionTrigger="chevron"
        defaultExpandedIds={['launch']}
        onAction={(item) => setOpened(String(item?.label))}
      />
      <p>Opened: {opened}</p>
    </div>
  );
}
