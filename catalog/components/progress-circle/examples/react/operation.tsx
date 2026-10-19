import { useEffect, useState } from 'react';
import { Button, ProgressCircle } from '@muxui/react';

type Phase = 'idle' | 'running' | 'done';

const status: Record<Phase, string> = {
  idle: 'Ready to sync.',
  running: 'Syncing.',
  done: 'Sync complete.',
};

export function ProgressCircleOperationExample() {
  const [phase, setPhase] = useState<Phase>('idle');
  useEffect(() => {
    if (phase !== 'running') return undefined;
    // Stands in for work whose length is unknown.
    const timer = window.setTimeout(() => setPhase('done'), 2000);
    return () => window.clearTimeout(timer);
  }, [phase]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <Button onActivate={() => setPhase('running')} disabled={phase === 'running'}>Sync</Button>
      {phase === 'idle' ? null : (
        <ProgressCircle.Root value={phase === 'done' ? 100 : null} size="sm" label="Sync progress">
          <ProgressCircle.Track />
        </ProgressCircle.Root>
      )}
      {/* The progress circle does not announce the change; the application's own status text does. */}
      <p role="status" style={{ margin: 0 }}>{status[phase]}</p>
    </div>
  );
}
