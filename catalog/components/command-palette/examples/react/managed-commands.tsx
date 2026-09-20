import { useState } from 'react';
import { CommandPalette, useCommandPalette, type CommandPaletteCommand } from '@muxui/react';

const commands: readonly CommandPaletteCommand[] = [
  { id: 'docs', title: 'Open docs', group: 'Help', keywords: ['documentation'] },
  { id: 'settings', title: 'Open settings', subtitle: 'Workspace preferences', group: 'Workspace' },
];

export function ManagedCommandsExample() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const palette = useCommandPalette({
    commands,
    close: () => setOpen(false),
    onAction: (command) => setSelected(command.title),
  });
  return (
    <CommandPalette.Root open={open} onOpenChange={setOpen}>
      <CommandPalette.Trigger>Commands</CommandPalette.Trigger>
      <CommandPalette.Backdrop>
        <CommandPalette.Popup aria-label="Commands">
          <CommandPalette.Content>
            <CommandPalette.Input aria-label="Search commands" value={palette.query} onChange={(event) => palette.setQuery(event.currentTarget.value)} />
            <CommandPalette.ListBox>
              {palette.groupedCommands.map((group) => (
                <CommandPalette.Section key={group.id}>
                  <CommandPalette.SectionHeader>{group.title}</CommandPalette.SectionHeader>
                  {group.commands.map((command) => <CommandPalette.Item key={command.id} {...palette.getItemProps(command)} />)}
                </CommandPalette.Section>
              ))}
            </CommandPalette.ListBox>
            {palette.filteredCommands.length === 0 && <CommandPalette.Empty>No matching commands</CommandPalette.Empty>}
          </CommandPalette.Content>
        </CommandPalette.Popup>
      </CommandPalette.Backdrop>
      <output aria-live="polite">{selected}</output>
    </CommandPalette.Root>
  );
}
