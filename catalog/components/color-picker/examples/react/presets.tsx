import { ColorField, ColorPicker, ColorSwatchPicker } from '@muxui/react';

const presets = [
  { id: 'blue', color: '#2563eb' },
  { id: 'violet', color: '#7c3aed' },
  { id: 'green', color: '#16a34a' },
  { id: 'orange', color: '#f97316' },
];

export function ColorPickerPresetsExample() {
  return (
    <ColorPicker aria-label="Theme color" defaultValue="#2563eb">
      <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        {/* Choosing a swatch edits the picker's color. A typed color outside the presets leaves no swatch selected. */}
        <ColorSwatchPicker aria-label="Presets" items={presets} />
        <ColorField label="Color" />
      </div>
    </ColorPicker>
  );
}
