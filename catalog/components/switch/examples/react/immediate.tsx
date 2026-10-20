import { useState } from 'react';
import { Checkbox, Switch } from '@muxui/react';

type Request = 'idle' | 'saving' | 'saved' | 'failed';

// Stands in for the application's request to save the setting. Switch saves nothing itself.
function saveSetting(_selected: boolean, shouldFail: boolean) {
  return new Promise<void>((resolve, reject) => {
    window.setTimeout(() => (shouldFail ? reject(new Error('The connection dropped.')) : resolve()), 800);
  });
}

export function SwitchImmediateExample() {
  const [notifications, setNotifications] = useState(true);
  const [request, setRequest] = useState<Request>('idle');
  const [simulateFailure, setSimulateFailure] = useState(false);

  // A standalone setting is saved in the change handler. There is no Save Button.
  async function handleChange(selected: boolean) {
    // Switch has no pending state, so the application ignores changes until the request settles.
    if (request === 'saving') return;
    const previous = notifications;
    // Move the Switch at once, then confirm it or put it back.
    setNotifications(selected);
    setRequest('saving');
    try {
      await saveSetting(selected, simulateFailure);
      setRequest('saved');
    } catch {
      setNotifications(previous);
      setRequest('failed');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      {/* The error sits beside the Switch while the request has failed, and the next change clears it. */}
      <Switch
        label="Notifications"
        description="Send product updates by email."
        selected={notifications}
        onChange={handleChange}
        invalid={request === 'failed'}
        errorMessage={`Could not save the change, so notifications are still ${notifications ? 'on' : 'off'}.`}
      />
      <p role="status">
        {request === 'saving' ? 'Saving.' : null}
        {request === 'saved' ? `Saved: notifications ${notifications ? 'on' : 'off'}` : null}
      </p>
      {/* A control for this demonstration only. It is not part of the pattern. */}
      <Checkbox checked={simulateFailure} onChange={setSimulateFailure}>
        Simulate a failed request
      </Checkbox>
    </div>
  );
}
