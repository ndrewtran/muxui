import { useEffect, useState } from 'react';
import { Button, Checkbox, ProgressCircle } from '@muxui/react';

type Phase = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

const status: Record<Phase, string> = {
  idle: 'Ready to sync.',
  running: 'Syncing.',
  done: 'Synced 12 files.',
  failed: 'Sync failed. Check the connection and try again.',
  cancelled: 'Sync cancelled. No files changed.',
};

export function ProgressCircleOperationExample() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const running = phase === 'running';

  useEffect(() => {
    if (!running) return undefined;
    // Stands in for work whose length is unknown. Cancelling leaves the running phase, which clears the timer.
    const timer = window.setTimeout(() => setPhase(simulateFailure ? 'failed' : 'done'), 2000);
    return () => window.clearTimeout(timer);
  }, [running, simulateFailure]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* One Button starts the work and then cancels it, so it keeps focus while the circle shows. */}
        <Button onActivate={() => setPhase(running ? 'cancelled' : 'running')}>{running ? 'Cancel' : 'Sync'}</Button>
        {/* The circle shows only while the work runs. However it ends, the result replaces it. */}
        {running ? (
          <ProgressCircle.Root value={null} size="sm" label="Sync progress">
            <ProgressCircle.Track />
          </ProgressCircle.Root>
        ) : null}
        {/* The application's own status text, a separate status region, carries the phase and the result. */}
        <p role="status" style={{ margin: 0 }}>{status[phase]}</p>
      </div>
      {/* A control for this demonstration only. It is not part of the pattern. */}
      <Checkbox checked={simulateFailure} disabled={running} onChange={setSimulateFailure}>
        Simulate a failed sync
      </Checkbox>
    </div>
  );
}
