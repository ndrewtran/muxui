import { Checkbox, CheckboxGroup } from '@muxui/react';

export function CheckboxGroupOrientationExample() {
  const gap = 'var(--muxui-reference-dimension-space-xs)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {/* A narrow container shows how each layout copes. A group never wraps its options. */}
      <div style={{ boxSizing: 'border-box', width: '12rem', padding: gap, display: 'flex', flexDirection: 'column', gap, border: '1px dashed currentColor' }}>
        <CheckboxGroup label="Notify me by" name="notify-vertical">
          <Checkbox value="email">Email</Checkbox>
          <Checkbox value="sms">SMS</Checkbox>
          <Checkbox value="push">Push</Checkbox>
        </CheckboxGroup>
        <CheckboxGroup label="Remind me by" name="remind-horizontal" orientation="horizontal">
          <Checkbox value="email">Email</Checkbox>
          <Checkbox value="sms">SMS</Checkbox>
          <Checkbox value="push">Push</Checkbox>
        </CheckboxGroup>
      </div>
      <p>The horizontal group runs past the dashed edge of its container.</p>
    </div>
  );
}
