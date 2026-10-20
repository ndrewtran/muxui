import { useState } from 'react';
import { Button, FileTrigger } from '@muxui/react';

export function FileTriggerStagedExample() {
  const [files, setFiles] = useState<File[]>([]);
  const [sent, setSent] = useState<string[]>([]);

  // Selection only stages the files. Nothing is sent until the user confirms.
  function handleUpload() {
    // Stand-in for your own request. Starting, tracking, and retrying the transfer is the application's job.
    setSent(files.map((file) => file.name));
    setFiles([]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'flex-start' }}>
      <FileTrigger acceptedFileTypes={['text/csv']} allowsMultiple onSelect={setFiles}>
        Choose CSV files
      </FileTrigger>
      {files.length > 0 ? (
        <>
          <p>Ready to upload: {files.map((file) => file.name).join(', ')}</p>
          <Button onActivate={handleUpload}>Upload {files.length === 1 ? '1 file' : `${files.length} files`}</Button>
        </>
      ) : null}
      {sent.length > 0 ? <p>Uploaded: {sent.join(', ')}</p> : null}
    </div>
  );
}
