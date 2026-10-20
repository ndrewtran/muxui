import { useState } from 'react';
import { Autocomplete } from '@muxui/react';

const cities = ['Melbourne', 'Sydney', 'Perth'];

export function AutocompleteNoMatchExample() {
  const [text, setText] = useState('');
  // Autocomplete shows nothing when no suggestion matches, so the application says so.
  const matchesNothing = text !== '' && !cities.some((city) => city.toLowerCase().includes(text.toLowerCase()));

  return (
    <Autocomplete
      label="City"
      items={cities}
      value={text}
      onChange={setText}
      invalid={matchesNothing}
      errorMessage="No listed city matches. Choose one from the suggestions."
    />
  );
}
