import { useEffect, useId, useState } from 'react';
import { Button, CommandPalette } from '@muxui/react';

const commands = [
  { id: 'docs', title: 'Open docs', tag: 'Help' },
  { id: 'settings', title: 'Open settings', tag: 'Workspace' },
  { id: 'billing', title: 'Open billing', tag: 'Workspace' },
  { id: 'shortcuts', title: 'Show shortcuts', tag: 'Help' },
  { id: 'status', title: 'Open status page', tag: 'Help' },
];

export function CommandPalettePartsExample() {
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
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
  const matches = commands.filter((command) => tags.includes(command.tag));
  const visible = matches.slice(0, limit);

  return (
    <CommandPalette.Root open={open} onOpenChange={setOpen}>
      <CommandPalette.Trigger>
        Commands <CommandPalette.Shortcut keys={['Ctrl', 'K']} />
      </CommandPalette.Trigger>
      <CommandPalette.Backdrop>
        {/* Description is a plain paragraph, so the Popup refers to it by id. */}
        <CommandPalette.Popup aria-label="Commands" aria-describedby={descriptionId}>
          <CommandPalette.Description id={descriptionId}>Filter by tag, then open a command.</CommandPalette.Description>
          <CommandPalette.Content>
            <CommandPalette.Input aria-label="Search commands" />
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
            <CommandPalette.ListBox>
              {visible.map((command) => (
                <CommandPalette.Item key={command.id} id={command.id} title={command.title} />
              ))}
            </CommandPalette.ListBox>
            {matches.length > visible.length && (
              <CommandPalette.LoadMoreItem>
                <Button onActivate={() => setLimit(limit + 2)}>Load more</Button>
              </CommandPalette.LoadMoreItem>
            )}
          </CommandPalette.Content>
        </CommandPalette.Popup>
      </CommandPalette.Backdrop>
    </CommandPalette.Root>
  );
}
