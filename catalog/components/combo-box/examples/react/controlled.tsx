import { useState } from 'react';
import { ComboBox } from '@muxui/react';

const cities = [
  { id: 'mel', label: 'Melbourne' },
  { id: 'syd', label: 'Sydney' },
  { id: 'per', label: 'Perth' },
];

export function ComboBoxControlledExample() {
  const [text, setText] = useState('');
  // null selects no option.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <ComboBox
        label="City"
        items={cities}
        value={text}
        onChange={setText}
        selectedId={selectedId}
        onSelect={(item) => {
          // onSelect receives no item when the selection clears, so one handler covers choosing and clearing.
          // With both controlled, the application sets the text to the chosen option.
          const city = cities.find((candidate) => candidate.id === item?.id);
          setSelectedId(city?.id ?? null);
          setText(city?.label ?? '');
        }}
      />
      <p>Text {text || 'empty'}, selected ID {selectedId ?? 'none'}</p>
    </>
  );
}
