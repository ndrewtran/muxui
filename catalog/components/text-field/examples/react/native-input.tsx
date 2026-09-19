import { useRef } from 'react';
import { TextField } from '@muxui/react';

export function NativeInputTextFieldExample() {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <TextField
      label="Workspace name"
      defaultValue="Personal"
      inputRef={inputRef}
      inputProps={{ onFocus: () => inputRef.current?.select() }}
    />
  );
}
