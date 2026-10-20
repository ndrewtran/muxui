import { useState } from 'react';
import { DropZone, FileTrigger } from '@muxui/react';
import type { MuxUIDropEvent } from '@muxui/react';

export function DropZoneWithPickerExample() {
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Both entry points end here with File objects, so the rest of the pipeline is written once.
  function addFiles(files: File[]) {
    setNames((current) => [...current, ...files.map((file) => file.name)]);
  }

  // Dropped items are not Files yet. Read each file item first; this example skips folders and text.
  async function handleDrop(event: MuxUIDropEvent) {
    setError('');
    try {
      addFiles(await Promise.all(event.items.flatMap((item) => (item.kind === 'file' ? [item.getFile()] : []))));
    } catch {
      // DropZone does not catch a failed read, so the handler does.
      setError('Could not read the dropped files.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      {/* onActivate is not used: it does not open the picker, so the FileTrigger inside the area does. */}
      <DropZone aria-label="Upload images" onDrop={handleDrop}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
          <span>Drop PNG or JPEG images here, or</span>
          <FileTrigger acceptedFileTypes={['image/png', 'image/jpeg']} allowsMultiple onSelect={addFiles}>
            Choose images
          </FileTrigger>
        </div>
      </DropZone>
      {error ? <p>{error}</p> : null}
      <ul>
        {names.map((name, index) => (
          <li key={`${index}:${name}`}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
