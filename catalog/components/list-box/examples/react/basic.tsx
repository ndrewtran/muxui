import { ListBox } from '@muxui/react';

const sections = [
  { id: 'design-system', label: 'Design system' },
  { id: 'product-research', label: 'Product research' },
  { id: 'release-notes', label: 'Release notes' },
];

export function BasicListBoxExample() {
  return <ListBox aria-label="Workspace sections" items={sections} />;
}
