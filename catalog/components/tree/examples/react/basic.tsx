import { Tree } from '@muxui/react';
export function BasicTreeExample() {
  return <Tree aria-label="Project files" defaultExpandedIds={['project']} items={[{
    id: 'project',
    label: 'Mux UI project',
    children: [
      { id: 'components', label: 'Components', children: [{ id: 'button', label: 'Button.tsx' }, { id: 'table', label: 'Table.tsx' }] },
      { id: 'readme', label: 'README.md' },
    ],
  }]} />;
}
