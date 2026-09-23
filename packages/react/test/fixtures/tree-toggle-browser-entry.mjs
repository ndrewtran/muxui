import React from 'react';
import { createPortal } from 'react-dom';
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

function PortalLabel() {
  const [portalMounted, setPortalMounted] = React.useState(false);
  React.useEffect(() => setPortalMounted(true), []);
  return React.createElement(React.Fragment, null,
    React.createElement('span', null, 'Portal row'),
    portalMounted ? createPortal(React.createElement('span', { className: 'portal-surface' }, 'Portal surface'), document.body) : null);
}

const rowItems = [
  {
    id: 'row-parent',
    label: 'Row parent',
    children: [{ id: 'row-child', label: 'Row child' }],
  },
  {
    id: 'row-controls',
    label: React.createElement(React.Fragment, null,
      React.createElement('button', { type: 'button', className: 'nested-button' }, 'Nested button'),
      React.createElement('a', { href: '#nested-link', className: 'nested-link' }, 'Nested link')),
    children: [{ id: 'row-controls-child', label: 'Controls child' }],
  },
  {
    id: 'row-portal-parent',
    label: React.createElement(PortalLabel),
    children: [{ id: 'row-portal-child', label: 'Portal child' }],
  },
  { id: 'row-leaf', label: 'Row leaf' },
  {
    id: 'row-disabled-parent',
    label: 'Disabled row parent',
    disabled: true,
    children: [{ id: 'row-disabled-child', label: 'Disabled row child' }],
  },
];

function RowFixture({ controlled = false, selectionMode = 'single', disabled = false }) {
  const [expandedIds, setExpandedIds] = React.useState([]);
  const [expandedChangeCount, setExpandedChangeCount] = React.useState(0);
  const [selectionChangeCount, setSelectionChangeCount] = React.useState(0);
  const [actionCount, setActionCount] = React.useState(0);
  const treeProps = {
    'aria-label': 'Tree row expansion proof',
    items: rowItems,
    selectionMode,
    disabled,
    ...(controlled ? { expandedIds } : { defaultExpandedIds: [] }),
    ...(selectionMode === 'multiple' ? { defaultSelectedIds: ['row-leaf'] } : {}),
    onExpandedChange: (next) => {
      setExpandedChangeCount((count) => count + 1);
      if (controlled) setExpandedIds(next);
    },
    onSelectionChange: () => setSelectionChangeCount((count) => count + 1),
    onAction: () => setActionCount((count) => count + 1),
  };
  return React.createElement('div', {
    id: 'row-fixture',
    'data-expanded-change-count': expandedChangeCount,
    'data-selection-change-count': selectionChangeCount,
    'data-action-count': actionCount,
  }, React.createElement(Tree, treeProps));
}

function Fixture({ mode = 'chevron' }) {
  if (mode === 'row') return React.createElement(RowFixture);
  if (mode === 'row-controlled') return React.createElement(RowFixture, { controlled: true });
  if (mode === 'row-multiple') return React.createElement(RowFixture, { selectionMode: 'multiple' });
  if (mode === 'row-none') return React.createElement(RowFixture, { selectionMode: 'none' });
  if (mode === 'row-disabled-tree') return React.createElement(RowFixture, { disabled: true });
  return React.createElement(Tree, {
    'aria-label': 'Tree toggle proof',
    items,
    expansionTrigger: 'chevron',
  });
}

const mode = new URLSearchParams(window.location.search).get('mode') ?? 'chevron';
hydrateRoot(document.getElementById('root'), React.createElement(Fixture, { mode }));
