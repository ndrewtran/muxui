import { useState } from 'react';
import { ComboBox } from '@muxui/react';

const cities = [
  { id: 'mel', label: 'Melbourne' },
  { id: 'syd', label: 'Sydney' },
  { id: 'per', label: 'Perth' },
];

export function ComboBoxControlledExample() {
  const [text, setText] = useState('');
  // An empty string selects no option.
  const [selectedId, setSelectedId] = useState('');

  return (
    <>
      <ComboBox
        label="City"
        items={cities}
        value={text}
        onChange={(next) => {
          setText(next);
          // Emptying the input clears the selection without calling onSelect.
          if (next === '') setSelectedId('');
        }}
        selectedId={selectedId}
        onSelect={(item) => {
          // With both controlled, the application sets the text to the chosen option.
          const city = cities.find((candidate) => candidate.id === item?.id);
          setSelectedId(city?.id ?? '');
          setText(city?.label ?? '');
        }}
      />
      <p>Text {text || 'empty'}, selected ID {selectedId || 'none'}</p>
    </>
  );
}
