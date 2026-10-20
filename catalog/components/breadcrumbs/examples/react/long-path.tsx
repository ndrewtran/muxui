import { Breadcrumbs } from '@muxui/react';

// Every level stays in the list. In a container too narrow for one line, the list wraps.
const path = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'docs', label: 'Docs', href: '/docs' },
  { id: 'components', label: 'Components', href: '/docs/components' },
  { id: 'forms', label: 'Forms', href: '/docs/components/forms' },
  { id: 'fields', label: 'Fields', href: '/docs/components/forms/fields' },
  { id: 'text-field', label: 'Text field' },
];

export function LongPathBreadcrumbsExample() {
  return (
    <div style={{ maxWidth: '16rem' }}>
      <Breadcrumbs aria-label="Page location" items={path} />
    </div>
  );
}
