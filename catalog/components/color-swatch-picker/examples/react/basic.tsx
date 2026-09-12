import { ColorSwatchPicker } from '@muxui/react';
export function BasicColorSwatchPickerExample() {
  return <ColorSwatchPicker aria-label="Theme" items={[
    { id: 'blue', color: '#2563eb' },
    { id: 'violet', color: '#7c3aed' },
    { id: 'green', color: '#16a34a' },
    { id: 'orange', color: '#f97316' },
  ]} defaultValue="#2563eb" />;
}
