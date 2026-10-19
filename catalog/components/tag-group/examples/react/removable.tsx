import { useState } from 'react';
import { TagGroup } from '@muxui/react';

type Tag = { id: string; label: string };

const initialTags: Tag[] = [
  { id: 'design', label: 'Design' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'research', label: 'Research' },
];

export function RemovableTagGroupExample() {
  const [tags, setTags] = useState(initialTags);
  return (
    <div>
      <TagGroup
        label="Tags"
        items={tags}
        onRemove={(removed) => {
          // TagGroup reports the removed items; the application removes them from its own list.
          const removedIds = new Set(removed.map((item) => item.id));
          setTags((current) => current.filter((tag) => !removedIds.has(tag.id)));
        }}
      />
      {tags.length === 0 ? <p>No tags</p> : null}
    </div>
  );
}
