import { useRef, useState } from 'react';
import { CommandPalette } from '@muxui/react';

const commands = [
  { id: 'docs', title: 'Open docs' },
  { id: 'settings', title: 'Open settings' },
];

export function ControlledQueryCommandPaletteExample() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // The application owns filtering and may supply asynchronous results here.
  const results = commands.filter((command) => command.title.toLowerCase().includes(query.toLowerCase()));
  return (
    <CommandPalette.Root>
      <CommandPalette.Trigger>Search commands</CommandPalette.Trigger>
      <CommandPalette.Backdrop>
        <CommandPalette.Popup aria-label="Commands">
          <CommandPalette.Content>
            <CommandPalette.Input
              aria-label="Search commands"
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onFocus={() => inputRef.current?.select()}
            />
            <CommandPalette.ListBox>
              {results.map((command) => (
                <CommandPalette.Item key={command.id} id={command.id} title={command.title} onActivate={() => setSelected(command.title)} />
              ))}
            </CommandPalette.ListBox>
            {results.length === 0 && <CommandPalette.Empty>No commands found</CommandPalette.Empty>}
          </CommandPalette.Content>
        </CommandPalette.Popup>
      </CommandPalette.Backdrop>
      <output aria-live="polite">{selected}</output>
    </CommandPalette.Root>
  );
}
