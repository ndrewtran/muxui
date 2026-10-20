import { useState } from 'react';
import { Switch } from '@muxui/react';

export function SwitchImmediateExample() {
  const [notifications, setNotifications] = useState(true);

  // A standalone setting is saved in the change handler. There is no Save Button.
  function handleChange(selected: boolean) {
    setNotifications(selected);
    // Stand in for the application's request to save the setting.
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <Switch
        label="Notifications"
        description="Send product updates by email."
        selected={notifications}
        onChange={handleChange}
      />
      <p>Saved: notifications {notifications ? 'on' : 'off'}</p>
    </div>
  );
}
