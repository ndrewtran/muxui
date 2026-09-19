import { useRef } from 'react';
import { SearchField } from '@muxui/react';

export function NativeInputSearchFieldExample() {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <SearchField
      label="Search workspaces"
      defaultValue="Personal"
      inputRef={inputRef}
      inputProps={{ onFocus: () => inputRef.current?.select() }}
    />
  );
}
