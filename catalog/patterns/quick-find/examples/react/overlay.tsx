import { useState } from 'react';
import { CommandPalette, Text, useCommandPalette, type CommandPaletteCommand } from '@muxui/react';

const commands: readonly CommandPaletteCommand[] = [
  { id: 'plan', title: 'Open launch plan', subtitle: 'Plans', group: 'Jump to', keywords: ['roadmap'] },
  { id: 'issues', title: 'Review open issues', subtitle: 'Support', group: 'Jump to' },
  { id: 'options', title: 'Compare rollout options', group: 'Ask the assistant' },
  { id: 'notes', title: 'Draft release notes', group: 'Ask the assistant' },
  { id: 'export', title: 'Check export status', group: 'Ask the assistant' },
];

export function QuickFindOverlayExample() {
  // Local presentation state only: the palette filters placeholder commands and an action only reports its title.
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState('');
  const palette = useCommandPalette({ commands, close: () => setOpen(false), onAction: (command) => setChosen(command.title) });
  return (
    <section className="find" aria-label="Quick find">
      <style>{`
        .find {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--muxui-semantic-layout-action-gap);
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        /* The trigger rests as plain text, so this block gives it an outline. */
        .find .find-trigger {
          border: 1px solid var(--muxui-semantic-border-default);
          color: var(--muxui-semantic-content-default);
        }

        .find .find-trigger:hover {
          background-color: var(--muxui-semantic-surface-hover);
        }

        .find-empty {
          display: grid;
          justify-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
          padding: var(--muxui-semantic-layout-inset-xlarge);
          text-align: center;
        }
      `}</style>
      <CommandPalette.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) palette.setQuery(''); }}>
        <CommandPalette.Trigger className="find-trigger">Quick find</CommandPalette.Trigger>
        <CommandPalette.Backdrop>
          <CommandPalette.Popup aria-label="Quick find">
            <CommandPalette.Content>
              <CommandPalette.Input aria-label="Find" placeholder="Find a plan, issue, or action" value={palette.query} onChange={(event) => palette.setQuery(event.currentTarget.value)} />
              <CommandPalette.ListBox>
                {palette.groupedCommands.map((group) => (
                  <CommandPalette.Section key={group.id}>
                    <CommandPalette.SectionHeader>{group.title}</CommandPalette.SectionHeader>
                    {group.commands.map((command) => <CommandPalette.Item key={command.id} {...palette.getItemProps(command)} />)}
                  </CommandPalette.Section>
                ))}
              </CommandPalette.ListBox>
              {palette.filteredCommands.length === 0 && (
                <CommandPalette.Empty>
                  <div className="find-empty"><Text variant="label">No results found</Text><Text size="sm" color="muted">Adjust your search to try again</Text></div>
                </CommandPalette.Empty>
              )}
            </CommandPalette.Content>
          </CommandPalette.Popup>
        </CommandPalette.Backdrop>
      </CommandPalette.Root>
      <Text size="sm" color="muted" role="status">{chosen && `Chose ${chosen}`}</Text>
    </section>
  );
}
