import * as React from 'react';
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

// ListBox, Section, and Collection take items plus a render function that returns one element per item.
// The item type is inferred from items, and the list-of-sections form nests Section and Collection.
const groups = [{ id: 'workspace', title: 'Workspace', commands }];
const listRef = React.createRef<HTMLDivElement>();
const sectionRef = React.createRef<HTMLElement>();
const dynamicList = (
  <CommandPalette.ListBox ref={listRef} aria-label="Groups" className="results" items={groups} dependencies={[groups.length]}>
    {(group) => (
      <CommandPalette.Section ref={sectionRef} id={group.id}>
        <CommandPalette.SectionHeader>{group.title}</CommandPalette.SectionHeader>
        <CommandPalette.Collection items={group.commands} dependencies={[group.id]}>
          {(command) => { const meta: number = command.meta; return <CommandPalette.Item id={command.id} title={`${command.title} ${meta}`} />; }}
        </CommandPalette.Collection>
      </CommandPalette.Section>
    )}
  </CommandPalette.ListBox>
);
const flatList = <CommandPalette.ListBox aria-label="Commands" items={commands}>{(command) => <CommandPalette.Item id={command.id} title={command.title} />}</CommandPalette.ListBox>;
const flatSection = <CommandPalette.Section aria-label="Commands" items={commands}>{(command) => <CommandPalette.Item id={command.id} title={command.title} />}</CommandPalette.Section>;
const iterableCollection = <CommandPalette.Collection items={new Set(commands)}>{(command) => <CommandPalette.Item id={command.id} title={command.title} />}</CommandPalette.Collection>;
const staticList = (
  <CommandPalette.ListBox aria-label="Commands">
    <CommandPalette.Section><CommandPalette.Collection><CommandPalette.Item id="one" title="One" /></CommandPalette.Collection></CommandPalette.Section>
    {commands.map((command) => <CommandPalette.Item key={command.id} id={command.id} title={command.title} />)}
  </CommandPalette.ListBox>
);
// @ts-expect-error The item type comes from items, so an unknown field is rejected.
const wrongField = <CommandPalette.ListBox aria-label="Commands" items={commands}>{(command) => <CommandPalette.Item id={command.missing} />}</CommandPalette.ListBox>;
// @ts-expect-error The item type reaches Collection render functions.
const wrongCollectionField = <CommandPalette.Collection items={commands}>{(command) => <CommandPalette.Item id={command.missing} />}</CommandPalette.Collection>;
// @ts-expect-error The item type reaches Section render functions.
const wrongSectionField = <CommandPalette.Section aria-label="Commands" items={commands}>{(command) => <CommandPalette.Item id={command.missing} />}</CommandPalette.Section>;
// @ts-expect-error A render function without items renders nothing.
const functionWithoutItems = <CommandPalette.ListBox aria-label="Commands">{() => <CommandPalette.Item id="one" title="One" />}</CommandPalette.ListBox>;
// @ts-expect-error Items without a render function are ignored.
const itemsWithoutFunction = <CommandPalette.Collection items={commands}><CommandPalette.Item id="one" title="One" /></CommandPalette.Collection>;
// @ts-expect-error The render function must return an element; a string throws at runtime.
const stringResult = <CommandPalette.ListBox aria-label="Commands" items={commands}>{(command) => command.title}</CommandPalette.ListBox>;
// @ts-expect-error The render function must return an element; null throws at runtime.
const nullResult = <CommandPalette.Section aria-label="Commands" items={commands}>{() => null}</CommandPalette.Section>;
// @ts-expect-error items takes an iterable of items.
const nonIterableItems = <CommandPalette.Collection items={3}>{() => <CommandPalette.Item id="one" title="One" />}</CommandPalette.Collection>;
// @ts-expect-error dependencies only apply to the items form.
const orphanDependencies = <CommandPalette.Collection dependencies={[1]}><CommandPalette.Item id="one" title="One" /></CommandPalette.Collection>;
// @ts-expect-error Collection adds no element, so it takes no host props.
const hostProps = <CommandPalette.Collection className="results"><CommandPalette.Item id="one" title="One" /></CommandPalette.Collection>;
void [dynamicList, flatList, flatSection, iterableCollection, staticList, wrongField, wrongCollectionField, wrongSectionField, functionWithoutItems, itemsWithoutFunction, stringResult, nullResult, nonIterableItems, orphanDependencies, hostProps];
