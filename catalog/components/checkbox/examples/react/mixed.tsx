import { useState } from 'react';
import { Checkbox } from '@muxui/react';

const options = ['Email', 'SMS', 'Push'];

export function CheckboxMixedExample() {
  const [selected, setSelected] = useState(['Email']);
  const all = selected.length === options.length;
  // The mixed state is its own input: derive it from the children, not from the parent's checked state.
  const some = selected.length > 0 && !all;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      <Checkbox checked={all} indeterminate={some} onChange={(checked) => setSelected(checked ? options : [])}>
        All notifications
      </Checkbox>
      {options.map((option) => (
        <Checkbox
          key={option}
          checked={selected.includes(option)}
          onChange={(checked) => setSelected(checked ? [...selected, option] : selected.filter((item) => item !== option))}
        >
          {option}
        </Checkbox>
      ))}
    </div>
  );
}
