import { Switch } from '@muxui/react';

export function ChildrenSwitchExample() {
  // Children set the visible label, but they do not name the Switch, so aria-label does.
  return (
    <Switch aria-label="Email alerts" defaultSelected>
      <strong>Email</strong> alerts
    </Switch>
  );
}
