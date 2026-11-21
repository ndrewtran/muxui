import { useState } from 'react';
import { Button, Dialog, RadioGroup } from '@muxui/react';

const languages = ['English', 'Deutsch', 'Español', 'Français', 'Italiano', 'Nederlands', 'Polski', 'Português', 'Suomi', 'Svenska', 'Türkçe', 'Ελληνικά'];

export function DialogSheetExample() {
  const [language, setLanguage] = useState('English');

  return (
    <Dialog
      presentation="sheet"
      title="Language"
      description="Drag the sheet down, press Escape, or choose Close to put it away."
      trigger={<Button>Language: {language}</Button>}
      actions={<Button slot="close">Done</Button>}
    >
      {/* A long list scrolls the sheet, while the grip and close button stay at its top and Done at its bottom. */}
      <RadioGroup label="Display language" options={languages.map((name) => ({ value: name, label: name }))} value={language} onChange={setLanguage} />
    </Dialog>
  );
}
