import { useState } from 'react';
import { Menu, type MuxUISelection } from '@muxui/react';

export function CheckableMenuExample() {
  const [style, setStyle] = useState<MuxUISelection>(['paragraph']);
  return (
    <Menu.Root shouldCloseOnSelect={false}>
      <Menu.Trigger>Text style</Menu.Trigger>
      <Menu.Popup>
        {/* Radio items, one checked at a time; the checked item is the one in use, not a link to the current page. */}
        <Menu.List aria-label="Text style" selectionMode="single" selectedIds={style} onSelectionChange={setStyle}>
          <Menu.Item id="paragraph">Normal text</Menu.Item>
          {/* The key caps are decoration; aria-keyshortcuts states the shortcut the application handles. */}
          <Menu.Item id="heading-1" textValue="Heading 1" aria-keyshortcuts="Control+Alt+1">
            Heading 1 <Menu.Shortcut keys={['Ctrl', 'Alt', '1']} />
          </Menu.Item>
          <Menu.Item id="heading-2" textValue="Heading 2" aria-keyshortcuts="Control+Alt+2">
            Heading 2 <Menu.Shortcut keys={['Ctrl', 'Alt', '2']} />
          </Menu.Item>
        </Menu.List>
      </Menu.Popup>
    </Menu.Root>
  );
}
