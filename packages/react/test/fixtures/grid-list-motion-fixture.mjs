import React from 'react';
import { GridList } from '../../src/collections.mjs';

const h = React.createElement;
const primaryItems = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
  { id: 'selected', label: 'Selected' },
  { id: 'disabled', label: 'Disabled', disabled: true },
  { id: 'five', label: 'Five' },
  { id: 'six', label: 'Six' },
  { id: 'seven', label: 'Seven' },
];

export function GridListMotionFixture() {
  const [items, setItems] = React.useState(primaryItems);
  const [showPrimary, setShowPrimary] = React.useState(true);
  const primaryRef = React.useCallback((node) => {
    if (typeof window === 'undefined') return undefined;
    window.gridListRefEvents ??= [];
    if (node) {
      window.gridListRefEvents.push('attached');
      return () => window.gridListRefEvents.push('cleanup');
    }
    window.gridListRefEvents.push('detached');
    return undefined;
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.gridListMotionHydrated = 'true';
    window.gridListMotionFixture = {
      clearPrimary: () => setItems([]),
      removePrimary: () => setShowPrimary(false),
    };
    return () => {
      delete document.documentElement.dataset.gridListMotionHydrated;
      delete window.gridListMotionFixture;
    };
  }, []);

  return h('main', { style: { display: 'flex', gap: '24px' } },
    showPrimary && h(GridList, {
      id: 'primary-list',
      'aria-label': 'Primary files',
      items,
      selectionMode: 'multiple',
      selectedIds: ['selected'],
      style: { width: '280px', height: '150px', overflow: 'auto' },
      ref: primaryRef,
    }),
    h(GridList, {
      id: 'secondary-list',
      'aria-label': 'Secondary files',
      items: [{ id: 'secondary-one', label: 'Secondary One' }, { id: 'secondary-two', label: 'Secondary Two' }],
      style: { width: '280px' },
    }));
}
