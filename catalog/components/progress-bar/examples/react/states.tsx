import { ProgressBar } from '@muxui/react';

// Each bar keeps the name of its task. The phase and the outcome sit in text beside it, which the application owns.
// A bar at 100% only says the transfer reached its end, so the application decides whether the task succeeded.
type Upload = { label: string; status: string; value?: number };

const running: Upload[] = [
  { label: 'Report.pdf', status: 'Waiting for the server' },
  { label: 'Budget.xlsx', status: 'Not started', value: 0 },
  { label: 'Photos.zip', status: 'Uploading', value: 45 },
];

const finished: Upload[] = [
  { label: 'Notes.txt', status: 'Uploaded', value: 100 },
  { label: 'Invoice.pdf', status: 'Sent in full, but the server rejected the file. Check it and upload again.', value: 100 },
  { label: 'Archive.zip', status: 'Failed at 72%. The connection dropped, so upload it again.', value: 72 },
  { label: 'Draft.docx', status: 'Cancelled at 30%. Nothing was uploaded.', value: 30 },
];

function Bars({ uploads }: { uploads: Upload[] }) {
  return (
    <>
      {uploads.map((upload) => (
        <div key={upload.label}>
          <ProgressBar label={upload.label} value={upload.value} />
          <p style={{ margin: 0 }}>{upload.status}</p>
        </div>
      ))}
    </>
  );
}

export function ProgressBarStatesExample() {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <h3>While the work runs</h3>
      <Bars uploads={running} />
      <h3>After it ends</h3>
      <Bars uploads={finished} />
    </div>
  );
}
