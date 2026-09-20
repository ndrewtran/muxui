import { CommandPalette, useCommandPalette, type CommandPaletteCommand } from '@muxui/react';

const commands = [{ id: 'settings', title: 'Settings', subtitle: 'Preferences', group: 'Workspace', keywords: ['options'], meta: 42 }] satisfies readonly (CommandPaletteCommand & { meta: number })[];
function Consumer() {
  const palette = useCommandPalette({
    commands, query: '', onQueryChange: (query) => { const value: string = query; void value; },
    sort: () => 0, closeOnSelect: false,
    onAction(command) { const meta: number = command.meta; void meta; },
    onError(error, command) { const failure: unknown = error; const meta: number = command.meta; void [failure, meta]; },
    groupBy: (command) => command.group, getGroupTitle: (group) => group,
  });
  const meta: number = palette.filteredCommands[0].meta;
  const result: Promise<void> = palette.runCommand('settings');
  const external = useCommandPalette({ commands, filter: false, sort: false });
  void [meta, result, external];
  return <CommandPalette.Item {...palette.getItemProps(commands[0])} />;
}
// @ts-expect-error Mux uses string command IDs like CommandPalette.Item.
useCommandPalette({ commands: [{ id: 1, title: 'Numeric ID' }] });
// @ts-expect-error Command metadata is inferred and preserved without upstream types.
useCommandPalette({ commands, onAction: (command) => { const wrong: string = command.meta; void wrong; } });
void Consumer;
