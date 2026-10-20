import { ColorArea, ColorField, ColorPicker, ColorSlider } from '@muxui/react';

export function BasicColorPickerExample() {
  return (
    <ColorPicker aria-label="Brand color" defaultValue="#336699">
      <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        {/* Exact entry leads, and the visual controls edit the same color. */}
        <ColorField label="Color" />
        <ColorArea aria-label="Saturation and brightness" />
        {/* Hue is not a hex or RGB channel, so a hue slider in this picker names the HSB space. */}
        <ColorSlider label="Hue" channel="hue" colorSpace="hsb" />
      </div>
    </ColorPicker>
  );
}
