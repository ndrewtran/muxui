import { useState } from 'react';
import { Button, ToastProvider, useToast } from '@muxui/react';

const DRAFTS = ['Quarterly report', 'Team offsite', 'Release notes'];

function Drafts() {
  const { add } = useToast();
  const [drafts, setDrafts] = useState(DRAFTS);

  function archive(draft: string) {
    // The archive happens now, in the application's state, and does not wait for the toast to leave.
    setDrafts((current) => current.filter((item) => item !== draft));
    // The toast only offers Undo, which reverses it. The action closes the toast, which stays at least 10 seconds.
    add(`${draft} archived.`, {
      action: { label: 'Undo', onAction: () => setDrafts((current) => DRAFTS.filter((item) => item === draft || current.includes(item))) },
    });
  }

  return (
    <ul style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-xs)', margin: 0, padding: 0, listStyle: 'none' }}>
      {drafts.map((draft) => (
        <li key={draft} style={{ display: 'flex', alignItems: 'center', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
          <span style={{ flex: 1 }}>{draft}</span>
          <Button size="sm" variant="neutral" onActivate={() => archive(draft)}>Archive</Button>
        </li>
      ))}
    </ul>
  );
}

export function ToastUndoExample() {
  return (
    <ToastProvider>
      <Drafts />
    </ToastProvider>
  );
}
