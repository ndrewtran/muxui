import { ProgressBar } from '@muxui/react';

// Each bar keeps the name of its task. The phase sits in text beside it, which the application owns.
const uploads = [
  { label: 'Report.pdf', phase: 'Waiting for the server', value: undefined },
  { label: 'Budget.xlsx', phase: 'Not started', value: 0 },
  { label: 'Photos.zip', phase: 'Uploading', value: 45 },
  { label: 'Notes.txt', phase: 'Uploaded', value: 100 },
];

export function ProgressBarStatesExample() {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {uploads.map((upload) => (
        <div key={upload.label}>
          <ProgressBar label={upload.label} value={upload.value} />
          <p style={{ margin: 0 }}>{upload.phase}</p>
        </div>
      ))}
    </div>
  );
}
