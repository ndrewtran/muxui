import React from 'react';
import { useState } from 'react';
import { Tree } from '../../src/collections.mjs';

const items = [
  {
    id: 'parent',
    label: 'Parent',
    children: [
      { id: 'child-a', label: 'Child A', children: [{ id: 'grandchild', label: 'Grandchild' }] },
      {
        id: 'child-b',
        textValue: 'Child B',
        label: React.createElement(React.Fragment, null,
          React.createElement('span', null, 'Child B'),
          React.createElement('input', { name: 'branch-field', defaultValue: 'Value', 'aria-label': 'Branch field' })),
      },
      { id: 'disabled-child', label: 'Disabled child', disabled: true },
    ],
  },
  { id: 'tail', label: 'Tail' },
];

export function TreeMotionFixture() {
  const [firstExpanded, setFirstExpanded] = useState([]);
  const [secondExpanded, setSecondExpanded] = useState([]);

  React.useEffect(() => {
    window.setFirstTreeExpanded = setFirstExpanded;
  }, []);

  return React.createElement('main', { className: 'tree-motion-fixture' },
    React.createElement('section', null,
      React.createElement('h2', null, 'Primary Tree'),
      React.createElement(Tree, {
        'aria-label': 'Primary tree',
        items,
        selectedIds: ['parent'],
        expandedIds: firstExpanded,
        onExpandedChange: setFirstExpanded,
        expansionTrigger: 'chevron',
      })),
    React.createElement('section', null,
      React.createElement('h2', null, 'Independent Tree'),
      React.createElement(Tree, {
        'aria-label': 'Independent tree',
        items,
        expandedIds: secondExpanded,
        onExpandedChange: setSecondExpanded,
        expansionTrigger: 'chevron',
      })));
}
