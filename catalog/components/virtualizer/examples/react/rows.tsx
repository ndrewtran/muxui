import { Virtualizer } from '@muxui/react';

// Rows are placed 56px apart, and each label is two lines that fit inside that height.
const items = Array.from({ length: 200 }, (_, index) => {
  const number = String(index + 1).padStart(3, '0');
  return {
    id: number,
    label: (
      <span style={{ display: 'grid' }}>
        <strong>Document {number}</strong>
        <span>Updated {index + 1} days ago</span>
      </span>
    ),
  };
});

export function TwoLineRowsVirtualizerExample() {
  return <Virtualizer aria-label="Project documents" items={items} height={320} itemHeight={56} overscan={3} />;
}
