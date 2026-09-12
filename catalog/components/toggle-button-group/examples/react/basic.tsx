import { ToggleButton, ToggleButtonGroup } from '@muxui/react';
export function BasicToggleButtonGroupExample() {
  return <ToggleButtonGroup aria-label="Text alignment" defaultSelectedIds={['left']}>
    <ToggleButton id="left">Left</ToggleButton>
    <ToggleButton id="center">Center</ToggleButton>
    <ToggleButton id="right">Right</ToggleButton>
  </ToggleButtonGroup>;
}
