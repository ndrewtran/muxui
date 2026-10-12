import { useState } from 'react';
import { CommandPalette, Text, useCommandPalette, type CommandPaletteCommand } from '@muxui/react';

// One stroke path per icon.
const SearchX = () => (
  <svg viewBox="0 0 24 24" width="1.5rem" height="1.5rem" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m13.5 8.5-5 5m0-5 5 5M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3" />
  </svg>
);

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

        .find-empty-icon {
          display: inline-flex;
          color: var(--muxui-semantic-content-muted);
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
                  <div className="find-empty"><span className="find-empty-icon"><SearchX /></span><Text variant="label">Nothing matches</Text><Text size="sm" color="muted">Try a different word</Text></div>
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
