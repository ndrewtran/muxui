import { useEffect, useId, useState } from 'react';
import { Button, CommandPalette } from '@muxui/react';

const commands = [
  { id: 'docs', title: 'Open docs', description: 'Documentation and guides', tag: 'Help' },
  { id: 'settings', title: 'Open settings', description: 'Workspace preferences', tag: 'Workspace' },
  { id: 'billing', title: 'Open billing', description: 'Invoices and payment details', tag: 'Workspace' },
  { id: 'shortcuts', title: 'Show shortcuts', description: 'Keyboard reference', tag: 'Help' },
  { id: 'status', title: 'Open status page', description: 'Service availability', tag: 'Help' },
];

export function CommandPalettePartsExample() {
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState(['Help', 'Workspace']);
  const [limit, setLimit] = useState(2);

  // Shortcut only displays keys. The application registers the key that opens the palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // The application owns the chip data, so removing a chip filters its own list.
  const matches = commands.filter((command) => tags.includes(command.tag) && command.title.toLowerCase().includes(query.trim().toLowerCase()));
  const visible = matches.slice(0, limit);

  return (
    <CommandPalette.Root open={open} onOpenChange={setOpen}>
      <CommandPalette.Trigger>
        Commands <CommandPalette.Shortcut keys={['Ctrl', 'K']} />
      </CommandPalette.Trigger>
      <CommandPalette.Backdrop>
        {/* Description is a plain paragraph, so the Popup refers to it by id. */}
        <CommandPalette.Popup aria-label="Commands" aria-describedby={descriptionId}>
          <CommandPalette.Title>Commands</CommandPalette.Title>
          <CommandPalette.Close aria-label="Close commands" />
          <CommandPalette.Description id={descriptionId}>Filter by tag, then open a command.</CommandPalette.Description>
          <CommandPalette.Content>
            <CommandPalette.SearchField aria-label="Search commands">
              <CommandPalette.Input aria-label="Search commands" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
              {/* The application clears the same query it uses to filter the commands. */}
              <CommandPalette.ClearButton aria-label="Clear command search" onClick={() => setQuery('')} />
            </CommandPalette.SearchField>
            <CommandPalette.Chips>
              {tags.map((tag) => (
                <CommandPalette.Chip key={tag}>
                  {tag}
                  <CommandPalette.ChipRemove
                    aria-label={`Remove ${tag}`}
                    onClick={() => setTags(tags.filter((current) => current !== tag))}
                  />
                </CommandPalette.Chip>
              ))}
            </CommandPalette.Chips>
            <CommandPalette.Separator />
            <CommandPalette.ListBox aria-label="Command results">
              <CommandPalette.Collection items={visible}>
                {(command) => (
                  <CommandPalette.Item id={command.id} textValue={command.title}>
                    <CommandPalette.ItemIcon aria-hidden="true">↗</CommandPalette.ItemIcon>
                    <CommandPalette.ItemContent>
                      <CommandPalette.ItemTitle>{command.title}</CommandPalette.ItemTitle>
                      <CommandPalette.ItemDescription>{command.description}</CommandPalette.ItemDescription>
                    </CommandPalette.ItemContent>
                    <CommandPalette.ItemMeta>{command.tag}</CommandPalette.ItemMeta>
                  </CommandPalette.Item>
                )}
              </CommandPalette.Collection>
            </CommandPalette.ListBox>
            {matches.length > visible.length && (
              <CommandPalette.LoadMoreItem>
                <Button onActivate={() => setLimit(limit + 2)}>Load more</Button>
              </CommandPalette.LoadMoreItem>
            )}
          </CommandPalette.Content>
          <CommandPalette.Footer>Use the arrow keys to choose a command and Enter to select it.</CommandPalette.Footer>
        </CommandPalette.Popup>
      </CommandPalette.Backdrop>
    </CommandPalette.Root>
  );
}
