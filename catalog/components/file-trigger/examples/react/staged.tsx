import { useState } from 'react';
import { Button, FileTrigger } from '@muxui/react';

// The picker only narrows what it offers, so the application checks each file itself.
const isCsv = (file: File) => file.name.toLowerCase().endsWith('.csv');

export function FileTriggerStagedExample() {
  const [staged, setStaged] = useState<File[]>([]);
  const [rejected, setRejected] = useState<File[]>([]);
  const [requested, setRequested] = useState<string[]>([]);

  // Selection only stages the files that pass the check. Nothing is sent until the user confirms.
  function handleSelect(files: File[]) {
    setStaged(files.filter(isCsv));
    setRejected(files.filter((file) => !isCsv(file)));
    setRequested([]);
  }

  function handleUpload() {
    // Hand the staged files to the application's own upload code here. Starting, tracking, and retrying the
    // transfer is the application's job, so this example reports only that an upload was requested.
    setRequested(staged.map((file) => file.name));
    setStaged([]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'flex-start' }}>
      <FileTrigger acceptedFileTypes={['.csv', 'text/csv']} allowsMultiple onSelect={handleSelect}>
        Choose CSV files
      </FileTrigger>
      {rejected.length > 0 ? <p>Not CSV: {rejected.map((file) => file.name).join(', ')}</p> : null}
      {staged.length > 0 ? (
        <>
          <p>Ready to upload: {staged.map((file) => file.name).join(', ')}</p>
          <Button onActivate={handleUpload}>Upload {staged.length === 1 ? '1 file' : `${staged.length} files`}</Button>
        </>
      ) : null}
      {requested.length > 0 ? <p>Upload requested: {requested.join(', ')}</p> : null}
    </div>
  );
}
