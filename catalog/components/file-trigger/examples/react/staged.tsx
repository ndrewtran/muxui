import { useState } from 'react';
import { Button, Checkbox, FileTrigger } from '@muxui/react';

type Transfer = 'staged' | 'processing' | 'completed' | 'failed';

// The picker only narrows what it offers, so the application checks each file itself.
const isCsv = (file: File) => file.name.toLowerCase().endsWith('.csv');

// Stands in for the application's own upload code. FileTrigger does not send, track, or retry anything.
function sendFiles(_files: File[], shouldFail: boolean) {
  return new Promise<void>((resolve, reject) => {
    window.setTimeout(() => (shouldFail ? reject(new Error('The connection dropped.')) : resolve()), 1000);
  });
}

export function FileTriggerStagedExample() {
  const [accepted, setAccepted] = useState<File[]>([]);
  const [rejected, setRejected] = useState<File[]>([]);
  const [transfer, setTransfer] = useState<Transfer>('staged');
  const [simulateFailure, setSimulateFailure] = useState(false);

  // Selection only stages the files that pass the check. Nothing is sent until the user confirms.
  function handleSelect(files: File[]) {
    setAccepted(files.filter(isCsv));
    setRejected(files.filter((file) => !isCsv(file)));
    setTransfer('staged');
  }

  // The same handler starts the first attempt and every retry. A failed transfer keeps the accepted files.
  async function upload() {
    setTransfer('processing');
    try {
      await sendFiles(accepted, simulateFailure);
      setTransfer('completed');
    } catch {
      setTransfer('failed');
    }
  }

  const names = accepted.map((file) => file.name).join(', ');
  const count = accepted.length === 1 ? '1 file' : `${accepted.length} files`;
  const selected = accepted.length + rejected.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'flex-start' }}>
      <FileTrigger acceptedFileTypes={['.csv', 'text/csv']} allowsMultiple disabled={transfer === 'processing'} onSelect={handleSelect}>
        Choose CSV files
      </FileTrigger>
      {/* Selected: what the picker returned. Rejected: what failed the check. Both stay beside the picker. */}
      {selected > 0 ? <p>Selected {selected === 1 ? '1 file' : `${selected} files`}: {accepted.length} accepted, {rejected.length} rejected.</p> : null}
      {rejected.length > 0 ? <p>Not CSV: {rejected.map((file) => file.name).join(', ')}</p> : null}
      {/* Accepted: ready for the user's confirmation. */}
      {accepted.length > 0 && transfer === 'staged' ? <p>Ready to upload: {names}</p> : null}
      {/* Processing, completed, and failed are the application's own states, shown where the user chose. */}
      {transfer === 'processing' ? <p role="status">Uploading {count}.</p> : null}
      {transfer === 'completed' ? <p role="status">Uploaded {count}: {names}</p> : null}
      {transfer === 'failed' ? <p role="status">Could not upload {names}. The files are still selected, so try again.</p> : null}
      {accepted.length > 0 && transfer !== 'completed' ? (
        <Button pending={transfer === 'processing'} onActivate={upload}>
          {transfer === 'failed' ? 'Try again' : `Upload ${count}`}
        </Button>
      ) : null}
      {/* A control for this demonstration only. It is not part of the pattern. */}
      <Checkbox checked={simulateFailure} onChange={setSimulateFailure}>
        Simulate a failed transfer
      </Checkbox>
    </div>
  );
}
