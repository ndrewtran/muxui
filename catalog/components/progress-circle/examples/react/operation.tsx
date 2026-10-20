import { useEffect, useState } from 'react';
import { Button, ProgressCircle } from '@muxui/react';

type Phase = 'idle' | 'running' | 'done';

const status: Record<Phase, string> = {
  idle: 'Ready to sync.',
  running: 'Syncing.',
  done: 'Synced 12 files.',
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
      {/* The circle shows only while the work runs. When it ends, the result replaces it. */}
      {phase === 'running' ? (
        <ProgressCircle.Root value={null} size="sm" label="Sync progress">
          <ProgressCircle.Track />
        </ProgressCircle.Root>
      ) : null}
      {/* The application's own status text, a separate status region, carries the phase and the result. */}
      <p role="status" style={{ margin: 0 }}>{status[phase]}</p>
    </div>
  );
}
