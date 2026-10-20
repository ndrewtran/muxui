import { useRef, useState } from 'react';
import { CommandPalette, useCommandPalette, type CommandPaletteCommand } from '@muxui/react';

const commands: readonly CommandPaletteCommand[] = [
  { id: 'export', title: 'Export report', subtitle: 'Download as PDF', group: 'Reports' },
  { id: 'sync', title: 'Sync workspace', subtitle: 'Upload local changes', group: 'Workspace' },
];

// The hook keeps no progress, so the application records it for each command.
type RowState = { status: 'running' } | { status: 'failed'; message: string };

export function AsyncCommandsExample() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Partial<Record<string, RowState>>>({});
  const [finished, setFinished] = useState('');
  const attempts = useRef(0);

  function setRow(id: string, state?: RowState) {
    setRows((current) => ({ ...current, [id]: state }));
  }

  // Stands in for the application's requests. The first export fails so both outcomes can be tried.
  async function perform(id: string) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (id !== 'export') return;
    attempts.current += 1;
    if (attempts.current === 1) throw new Error('The server did not respond.');
  }

  const palette = useCommandPalette({
    commands,
    close: () => setOpen(false),
    // Runs when a command is activated. The hook closes the palette only after it succeeds.
    onAction: async (command) => {
      setRow(command.id, { status: 'running' });
      await perform(command.id);
      setRow(command.id);
      setFinished(`${command.title} finished.`);
    },
    // A failure keeps the palette open, so the row says what went wrong.
    onError: (error, command) => {
      setRow(command.id, { status: 'failed', message: error instanceof Error ? error.message : 'The command failed.' });
    },
  });

  function describe(command: CommandPaletteCommand) {
    const row = rows[command.id];
    if (row?.status === 'running') return 'Running.';
    if (row?.status === 'failed') return `${row.message} Activate to try again.`;
    return command.subtitle;
  }

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
                  {group.commands.map((command) => (
                    <CommandPalette.Item
                      key={command.id}
                      {...palette.getItemProps(command)}
                      description={describe(command)}
                      disabled={rows[command.id]?.status === 'running'}
                    />
                  ))}
                </CommandPalette.Section>
              ))}
            </CommandPalette.ListBox>
            {palette.filteredCommands.length === 0 && <CommandPalette.Empty>No matching commands</CommandPalette.Empty>}
          </CommandPalette.Content>
        </CommandPalette.Popup>
      </CommandPalette.Backdrop>
      <output>{finished}</output>
    </CommandPalette.Root>
  );
}
