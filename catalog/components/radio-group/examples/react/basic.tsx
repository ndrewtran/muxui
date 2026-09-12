import { RadioGroup } from '@muxui/react';
export function BasicRadioGroupExample() {
  return <RadioGroup label="Density" options={[
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' },
  ]} />;
}
