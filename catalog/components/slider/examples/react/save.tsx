import { useState } from 'react';
import { Slider } from '@muxui/react';

export function SliderSaveExample() {
  const [value, setValue] = useState(50);
  const [saved, setSaved] = useState(50);
  const [saves, setSaves] = useState(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <Slider
        label="Volume"
        value={value}
        onChange={setValue}
        onChangeEnd={(next) => {
          // The end callback can repeat a value, so save only when it differs from the last one saved.
          if (next === saved) return;
          setSaved(next);
          setSaves((count) => count + 1);
        }}
      />
      <p>
        Following: {value}. Saved: {saved} ({saves} saves).
      </p>
    </div>
  );
}
