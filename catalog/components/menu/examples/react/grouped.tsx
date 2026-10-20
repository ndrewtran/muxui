import { useState } from 'react';
import { Button, Menu } from '@muxui/react';

export function GroupedMenuExample() {
  const [lastAction, setLastAction] = useState('');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--muxui-semantic-layout-control-gap)' }}>
      {/* The action people use most stays outside the menu. */}
      <Button>Publish</Button>
      {/* The secondary commands sit in a flat menu, grouped in named sections. */}
      <Menu.Root onAction={(item) => setLastAction(item?.id ?? '')}>
        <Menu.Trigger>More actions</Menu.Trigger>
        <Menu.Popup>
          <Menu.List aria-label="More actions">
            <Menu.Section>
              <Menu.Header>Edit</Menu.Header>
              <Menu.Item id="duplicate">Duplicate page</Menu.Item>
              <Menu.Item id="rename">Rename page</Menu.Item>
            </Menu.Section>
            <Menu.Section>
              <Menu.Header>Export</Menu.Header>
              <Menu.Item id="pdf">Export as PDF</Menu.Item>
              <Menu.Item id="markdown">Export as Markdown</Menu.Item>
            </Menu.Section>
          </Menu.List>
        </Menu.Popup>
      </Menu.Root>
      <output>{lastAction}</output>
    </div>
  );
}
