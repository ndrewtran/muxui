import { InputTags } from '@muxui/react';

const tags = ['Design systems', 'Product research', 'Accessibility reviews', 'Release notes'];

export function InputTagsPlacementExample() {
  return (
    // A narrow container with long tags: inline wraps the whole field, and below keeps the input on one row.
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-m)', inlineSize: '16rem' }}>
      <InputTags.Root label="Inline tags" tagPlacement="inline" defaultValue={tags} placeholder="Add a tag" />
      <InputTags.Root label="Tags below" tagPlacement="below" defaultValue={tags} placeholder="Add a tag" />
    </div>
  );
}
