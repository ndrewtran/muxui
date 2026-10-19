import { useState } from 'react';
import { ToggleButton, ToggleButtonGroup } from '@muxui/react';

export function MultipleToggleButtonGroupExample() {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(['bold']);
  return (
    <div>
      <ToggleButtonGroup
        aria-label="Text style"
        selectionMode="multiple"
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      >
        <ToggleButton id="bold">Bold</ToggleButton>
        <ToggleButton id="italic">Italic</ToggleButton>
        <ToggleButton id="underline">Underline</ToggleButton>
      </ToggleButtonGroup>
      <p>Selected: {selectedIds.length > 0 ? selectedIds.join(', ') : 'none'}</p>
    </div>
  );
}
