import { ProgressBar } from '@muxui/react';

export function ProgressBarStatesExample() {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <ProgressBar label="Waiting for the server" />
      <ProgressBar label="Not started" value={0} />
      <ProgressBar label="Uploading" value={45} />
      <ProgressBar label="Uploaded" value={100} />
    </div>
  );
}
