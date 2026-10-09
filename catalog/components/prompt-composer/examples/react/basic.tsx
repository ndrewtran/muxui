import * as React from 'react';
import { PromptComposer } from '@muxui/react';

export function Example() {
  const [sent, setSent] = React.useState('');
  return <div>
    <PromptComposer inputLabel="Your message" inputProps={{ placeholder: 'Write a message…', name: 'message', required: true, maxLength: 2000 }} onSend={setSent} />
    <p role="status">{sent && `Saved locally: ${sent}`}</p>
  </div>;
}
