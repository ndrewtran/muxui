import { MultiSelect, TagSelect } from '@muxui/react';

const technologies = [
  { id: 'react', label: 'React' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'css', label: 'CSS' },
  { id: 'html', label: 'HTML' },
  { id: 'node', label: 'Node.js' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'docker', label: 'Docker' },
  { id: 'redis', label: 'Redis' },
];
const selectedIds = technologies.slice(0, 8).map((technology) => technology.id);

export function TagSelectManyExample() {
  return (
    // The same eight values in a narrow container: tags wrap into rows, and the summary stays one line.
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-m)', inlineSize: '20rem' }}>
      <TagSelect.Root label="Tags" items={technologies} defaultSelectedKeys={new Set(selectedIds)}>
        {(item) => <TagSelect.Item id={item.id} textValue={item.label}>{item.label}</TagSelect.Item>}
      </TagSelect.Root>
      <MultiSelect.Root label="Summary" items={technologies} defaultSelectedKeys={new Set(selectedIds)}>
        {(item) => <MultiSelect.Item id={item.id} textValue={item.label}>{item.label}</MultiSelect.Item>}
      </MultiSelect.Root>
    </div>
  );
}
