import { useState } from 'react';
import { DropZone } from '@muxui/react';
import type { MuxUIDropEvent, MuxUIDropItem } from '@muxui/react';

// Turn one dropped item into lines of text. Dropped items are not a File array: each one is a
// file, a directory, or text, and reading any of them is asynchronous.
async function describe(item: MuxUIDropItem): Promise<string[]> {
  if (item.kind === 'file') {
    const file = await item.getFile();
    return [`${file.name}, ${file.size} bytes`];
  }
  if (item.kind === 'directory') {
    const lines: string[] = [];
    for await (const entry of item.getEntries()) {
      lines.push(...(await describe(entry)).map((line) => `${item.name}/${line}`));
    }
    return lines;
  }
  // A text item can carry several formats, so ask for one that it lists.
  return item.types.has('text/plain') ? [`Text: ${await item.getText('text/plain')}`] : ['Text in a format this example skips'];
}

export function DropZoneReadItemsExample() {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function handleDrop(event: MuxUIDropEvent) {
    setError('');
    try {
      setLines((await Promise.all(event.items.map(describe))).flat());
    } catch {
      // DropZone does not catch a failed read, so the handler does.
      setError('Could not read the dropped items.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <DropZone aria-label="Drop files, folders, or text" onDrop={handleDrop}>
        Drop files, folders, or text here
      </DropZone>
      {error ? <p>{error}</p> : null}
      <ul>
        {lines.map((line, index) => (
          <li key={`${index}:${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
