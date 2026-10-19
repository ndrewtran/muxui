import { useState } from 'react';
import { FileTrigger } from '@muxui/react';

// An application limit. FileTrigger has no size option.
const maxBytes = 1_000_000;

export function FileTriggerSelectionExample() {
  const [accepted, setAccepted] = useState<File[]>([]);
  const [rejected, setRejected] = useState<File[]>([]);

  // The picker only narrows what it offers, so check the files before using them.
  function handleSelect(files: File[]) {
    setAccepted(files.filter((file) => file.size <= maxBytes));
    setRejected(files.filter((file) => file.size > maxBytes));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <div>
        <FileTrigger acceptedFileTypes={['image/png', 'image/jpeg']} allowsMultiple onSelect={handleSelect}>
          Choose images
        </FileTrigger>
      </div>
      {accepted.length > 0 ? <p>Ready: {accepted.map((file) => file.name).join(', ')}</p> : null}
      {rejected.length > 0 ? <p>Over 1 MB: {rejected.map((file) => file.name).join(', ')}</p> : null}
    </div>
  );
}
