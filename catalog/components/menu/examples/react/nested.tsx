import { useState } from 'react';
import { Menu } from '@muxui/react';

export function NestedMenuExample() {
  const [open, setOpen] = useState(false);
  const [lastAction, setLastAction] = useState('');
  return <>
    <Menu.Root open={open} onOpenChange={setOpen} onAction={(item) => setLastAction(item?.id ?? '')}>
      <Menu.Trigger>Document actions</Menu.Trigger>
      <Menu.Popup>
        <Menu.List aria-label="Document actions">
          <Menu.Section>
            <Menu.Header>Edit</Menu.Header>
            <Menu.Item id="copy" textValue="Copy"><strong>Copy</strong></Menu.Item>
            <Menu.Item id="paste" disabled>Paste</Menu.Item>
          </Menu.Section>
          <Menu.Separator />
          <Menu.Submenu>
            <Menu.Item id="share">Share</Menu.Item>
            <Menu.Popup>
              <Menu.List aria-label="Share document">
                <Menu.Item id="email">Email</Menu.Item>
                <Menu.Item id="copy-link">Copy link</Menu.Item>
              </Menu.List>
            </Menu.Popup>
          </Menu.Submenu>
        </Menu.List>
      </Menu.Popup>
    </Menu.Root>
    <output>{lastAction}</output>
  </>;
}
