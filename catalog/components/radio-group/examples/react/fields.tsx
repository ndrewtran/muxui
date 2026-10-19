import { useState } from 'react';
import { RadioField, RadioGroup } from '@muxui/react';

export function RadioGroupFieldsExample() {
  const [density, setDensity] = useState('comfortable');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      {/* RadioField options are children, so this group has no options list. Its size reaches every option. */}
      <RadioGroup label="Density" value={density} onChange={setDensity} size="sm">
        <RadioField.Root value="compact">
          <RadioField.Button>
            <RadioField.Indicator>
              <RadioField.Dot />
            </RadioField.Indicator>
            Compact
          </RadioField.Button>
          <RadioField.Description>Fits more rows on screen.</RadioField.Description>
        </RadioField.Root>
        <RadioField.Root value="comfortable">
          <RadioField.Button>
            <RadioField.Indicator>
              <RadioField.Dot />
            </RadioField.Indicator>
            Comfortable
          </RadioField.Button>
          <RadioField.Description>Leaves room around each row.</RadioField.Description>
        </RadioField.Root>
      </RadioGroup>
      <p>Selected: {density}</p>
    </div>
  );
}
