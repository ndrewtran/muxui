import { SearchField } from '@muxui/react';

export function CancelShortcutSearchFieldExample() {
  return (
    <SearchField
      label="Search"
      defaultValue="Quarterly report"
      inputProps={{
        // Calling preventDefault in a native keydown handler stops the field's own shortcut.
        onKeyDown: (event) => {
          if (event.key === 'Escape') event.preventDefault();
        },
      }}
    />
  );
}
