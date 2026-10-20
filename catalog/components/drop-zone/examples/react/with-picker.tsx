import { useState } from 'react';
import { DropZone, FileTrigger } from '@muxui/react';
import type { MuxUIDropEvent } from '@muxui/react';

// DropZone and the picker both pass files through, so the application checks the type itself.
const accepted = ['image/png', 'image/jpeg'];

export function DropZoneWithPickerExample() {
  const [names, setNames] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Both entry points end here with File objects, so the check and the list are written once.
  function addFiles(files: File[], notFiles = 0) {
    setNames((current) => [...current, ...files.filter((file) => accepted.includes(file.type)).map((file) => file.name)]);
    setRejected([
      ...files.filter((file) => !accepted.includes(file.type)).map((file) => file.name),
      ...(notFiles > 0 ? [`${notFiles} folder or text item${notFiles === 1 ? '' : 's'}`] : []),
    ]);
  }

  // Dropped items are not Files yet. Read each file item first; this example turns folders and text away.
  async function handleDrop(event: MuxUIDropEvent) {
    setError('');
    try {
      const files = await Promise.all(event.items.flatMap((item) => (item.kind === 'file' ? [item.getFile()] : [])));
      addFiles(files, event.items.length - files.length);
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
          <FileTrigger acceptedFileTypes={accepted} allowsMultiple onSelect={(files) => addFiles(files)}>
            Choose images
          </FileTrigger>
        </div>
      </DropZone>
      {rejected.length > 0 ? <p>Not PNG or JPEG: {rejected.join(', ')}</p> : null}
      {error ? <p>{error}</p> : null}
      <ul>
        {names.map((name, index) => (
          <li key={`${index}:${name}`}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
