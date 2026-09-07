import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Tree } from '../../src/collections.mjs';
import '../../generated/styles.css';

const items = [
  {
    id: 'parent',
    label: 'Parent',
    children: [{ id: 'child', label: 'Child' }],
  },
  {
    id: 'disabled-parent',
    label: 'Disabled parent',
    disabled: true,
    children: [{ id: 'disabled-child', label: 'Disabled child' }],
  },
];

function Fixture() {
  return React.createElement(Tree, {
    'aria-label': 'Tree toggle proof',
    items,
  });
}

hydrateRoot(document.getElementById('root'), React.createElement(Fixture));
