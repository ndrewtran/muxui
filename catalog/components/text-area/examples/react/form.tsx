import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, TextArea } from '@muxui/react';

// The profile card shows at most this many characters.
const limit = 160;

export function TextAreaFormExample() {
  const [bio, setBio] = useState('');
  const [saved, setSaved] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(String(new FormData(event.currentTarget).get('bio')));
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
        {/* The value and its change callback belong to Root and use a string. */}
        <TextArea.Root value={bio} onChange={setBio}>
          <TextArea.Label>Bio</TextArea.Label>
          {/* Native attributes belong to the textarea. The browser stops input at maxLength, and TextArea has no counter. */}
          <TextArea.TextArea name="bio" rows={4} maxLength={limit} placeholder="What you work on" />
          <TextArea.Description>{`Shown on your profile card, which fits ${limit} characters. ${limit - bio.length} left.`}</TextArea.Description>
        </TextArea.Root>
        <div>
          <Button type="submit">Save</Button>
        </div>
        {saved ? <p>Saved: {saved}</p> : null}
      </div>
    </form>
  );
}
