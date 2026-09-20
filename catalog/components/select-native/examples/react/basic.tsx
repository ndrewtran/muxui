import { SelectNative } from '@muxui/react';

export function BasicSelectNativeExample() {
  return <SelectNative
    label="Saved panel"
    name="savedPanel"
    defaultValue=""
    description="Choose a saved panel to open."
  >
    <option value="">More saved panels</option>
    <optgroup label="Workspaces">
      <option value="inbox">Inbox</option>
      <option value="research">Research</option>
    </optgroup>
  </SelectNative>;
}
