import { useState } from 'react';
import { SelectNative } from '@muxui/react';

export function SelectNativeControlledExample() {
  const [panel, setPanel] = useState('inbox');
  const [labels, setLabels] = useState<string[]>(['bug']);

  return (
    <>
      <SelectNative
        label="Panel"
        value={panel}
        // The change event is a native one. Read the value from the select and store that, not the event.
        onChange={(event) => setPanel(event.currentTarget.value)}
      >
        <option value="inbox">Inbox</option>
        <option value="research">Research</option>
      </SelectNative>
      <SelectNative
        label="Labels"
        multiple
        size={3}
        value={labels}
        onChange={(event) => setLabels(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
      >
        <option value="bug">Bug</option>
        <option value="docs">Docs</option>
        <option value="design">Design</option>
      </SelectNative>
      <p>Panel {panel}, labels {labels.join(', ') || 'none'}</p>
    </>
  );
}
