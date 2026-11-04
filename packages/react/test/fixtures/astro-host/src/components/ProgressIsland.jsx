import { ProgressCircle } from '@muxui/react';

export default function ProgressIsland() {
  return (
    <ProgressCircle.Root value={50}>
      <ProgressCircle.Track />
      <ProgressCircle.Label>Upload</ProgressCircle.Label>
      <ProgressCircle.Value />
    </ProgressCircle.Root>
  );
}
