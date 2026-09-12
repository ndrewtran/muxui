import { Menu } from '@muxui/react';

const actions = [
  { id: 'new-document', label: 'New document' },
  { id: 'duplicate-page', label: 'Duplicate page' },
  { id: 'export-pdf', label: 'Export as PDF' },
];

export function BasicMenuExample() {
  return <Menu aria-label="Document actions" items={actions} />;
}
