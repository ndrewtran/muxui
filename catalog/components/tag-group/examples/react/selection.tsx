import { useState } from 'react';
import { TagGroup, type TagGroupItem } from '@muxui/react';

const topics = [
  { id: 'design', label: 'Design', color: 'violet' },
  { id: 'engineering', label: 'Engineering', color: 'sky' },
  { id: 'research', label: 'Research', color: 'amber' },
] satisfies TagGroupItem[];

const articles = [
  { id: 'tokens', title: 'Naming design tokens', topic: 'design' },
  { id: 'rendering', title: 'Server rendering without flashes', topic: 'engineering' },
  { id: 'interviews', title: 'Running customer interviews', topic: 'research' },
  { id: 'motion', title: 'Motion that respects reduced motion', topic: 'design' },
];

export function SelectableTagGroupExample() {
  const [selected, setSelected] = useState(() => new Set<string>());
  // TagGroup reports the selected ids as a Set; with none selected, every article shows.
  const shown = selected.size === 0 ? articles : articles.filter((article) => selected.has(article.topic));
  return (
    <div>
      <TagGroup label="Topics" items={topics} selectionMode="multiple" selectedKeys={selected} onSelectionChange={setSelected} />
      <ul>
        {shown.map((article) => (
          <li key={article.id}>{article.title}</li>
        ))}
      </ul>
    </div>
  );
}
