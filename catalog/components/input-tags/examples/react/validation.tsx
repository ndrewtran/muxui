import { useState } from 'react';
import { InputTags } from '@muxui/react';

const maxTags = 4;

export function InputTagsValidationExample() {
  const [tags, setTags] = useState<string[]>(['design']);
  const [error, setError] = useState('');

  return (
    <InputTags.Root
      label="Topics"
      placeholder="Add a topic"
      value={tags}
      onChange={setTags}
      onTagAdded={() => setError('')}
      maxTags={maxTags}
      // Duplicates and a full list are rejected before validate runs, with no message.
      validate={(tag) => {
        const valid = /^[a-z0-9-]+$/.test(tag);
        setError(valid ? '' : 'Use lowercase letters, numbers, and hyphens.');
        return valid;
      }}
      invalid={error !== ''}
      errorMessage={error}
      description={`${tags.length} of ${maxTags} topics`}
    />
  );
}
