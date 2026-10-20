import { useState } from 'react';
import { Button, GridList } from '@muxui/react';
import type { MuxUISelection } from '@muxui/react';

const files = [
  { id: 'brief', label: 'Release brief' },
  { id: 'notes', label: 'Campaign notes' },
  { id: 'calendar', label: 'Rollout calendar' },
];

export function OpenOrSelectGridListExample() {
  const [opened, setOpened] = useState('nothing');
  const [selectedIds, setSelectedIds] = useState<MuxUISelection>([]);
  const selectedCount = selectedIds === 'all' ? files.length : selectedIds.length;
  return (
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      <section>
        <h3>Open on click</h3>
        {/* With no selection, a click or Enter on an item runs onAction. */}
        <GridList
          aria-label="Recent files"
          items={files}
          selectionMode="none"
          onAction={(item) => setOpened(String(item?.label))}
        />
      </section>
      <section>
        <h3>Select for a bulk action</h3>
        {/* A click toggles the item. Open is a nested Button, which never changes the selection. */}
        <GridList
          aria-label="Files to archive"
          layout="grid"
          selectionMode="multiple"
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        >
          {files.map((file) => (
            <GridList.Item key={file.id} id={file.id} textValue={file.label}>
              <span>{file.label}</span>
              <Button size="sm" variant="neutral" onActivate={() => setOpened(file.label)}>Open</Button>
            </GridList.Item>
          ))}
        </GridList>
        <p>Selected: {selectedCount}</p>
      </section>
      <p>Opened: {opened}</p>
    </div>
  );
}
