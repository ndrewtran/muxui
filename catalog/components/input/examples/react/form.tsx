import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Input } from '@muxui/react';

export function InputFormExample() {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(String(new FormData(event.currentTarget).get('name')));
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        {/* The value and its change callback belong to Root and use a string. */}
        <Input.Root value={name} onChange={setName}>
          <Input.Label>Name</Input.Label>
          {/* Native attributes and the ref belong to the input itself. */}
          <Input.Input ref={inputRef} name="name" placeholder="Ada Lovelace" />
          <Input.Description>Shown on your profile.</Input.Description>
        </Input.Root>
        <div style={{ display: 'flex', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
          <Button type="submit">Save</Button>
          <Button
            onActivate={() => {
              setName('');
              inputRef.current?.focus();
            }}
          >
            Clear
          </Button>
        </div>
        {saved ? <p>Saved {saved}</p> : null}
      </div>
    </form>
  );
}
