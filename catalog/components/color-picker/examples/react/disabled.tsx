import { ColorField, ColorPicker, ColorSlider } from '@muxui/react';

export function DisabledColorPickerExample() {
  return (
    <ColorPicker aria-label="Brand color" defaultValue="#336699" disabled>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <ColorSlider label="Red" channel="red" />
        <ColorField label="Color" />
      </div>
    </ColorPicker>
  );
}
