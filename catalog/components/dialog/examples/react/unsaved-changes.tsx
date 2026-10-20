import { useState } from 'react';
import { Button, Dialog, TextField } from '@muxui/react';

// Stands in for the application's request.
const saveName = () => new Promise<void>((resolve) => setTimeout(resolve, 800));

export function DialogUnsavedChangesExample() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Quarterly report');
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== name;

  async function save() {
    setSaving(true);
    await saveName();
    setName(draft);
    setSaving(false);
    setOpen(false);
  }

  return (
    <>
      <Button
        onActivate={() => {
          setDraft(name);
          setOpen(true);
        }}
      >
        Rename report
      </Button>
      <p>Report: {name}</p>
      <Dialog
        title="Rename report"
        open={open}
        onOpenChange={setOpen}
        // Closing is harmless while nothing has changed. Once the name has changed, or while the save runs,
        // Escape and an outside press would lose the edit or interrupt the save, so only the named exits close it.
        dismissable={!dirty && !saving}
        actions={
          <>
            <Button slot="close" variant="neutral" disabled={saving}>
              {dirty ? 'Discard changes' : 'Cancel'}
            </Button>
            <Button disabled={!dirty} pending={saving} onActivate={save}>
              Save
            </Button>
          </>
        }
      >
        {/* Read-only while saving, so an edit made during the request is not lost. */}
        <TextField label="Report name" value={draft} onChange={setDraft} readOnly={saving} />
      </Dialog>
    </>
  );
}
