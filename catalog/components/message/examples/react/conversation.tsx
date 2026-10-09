import * as React from 'react';
import { Message, PromptComposer } from '@muxui/react';

/** A local conversation log; sending records text without contacting an AI service. */
export function Example() {
  const [draft, setDraft] = React.useState('');
  const [messages, setMessages] = React.useState<string[]>([]);
  const input = React.useRef<HTMLTextAreaElement>(null);
  return <section aria-label="Local conversation">
    <Message author="Workspace" followUps={[{ id: 'notes', label: 'Review workspace notes' }]}
      onFollowUp={(item) => { setDraft(item.label); input.current?.focus(); }}>
      <p>Write a note below. Your text is recorded in this local example.</p>
    </Message>
    {messages.map((message, index) => <Message key={index} sender="user" author="You"><p>{message}</p></Message>)}
    <PromptComposer value={draft} onValueChange={setDraft} inputRef={input} inputProps={{ name: 'message', required: true, placeholder: 'Write a local note…' }}
      onSend={(message) => { setMessages((previous) => [...previous, message]); setDraft(''); }} />
    <p role="status">{messages.length ? `${messages.length} notes saved locally.` : ''}</p>
  </section>;
}
