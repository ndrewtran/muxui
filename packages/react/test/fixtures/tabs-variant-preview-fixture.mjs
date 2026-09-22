import React from 'react';
import { Tabs } from '../../src/collections.mjs';

const primaryItems = [
  { id: 'overview', label: 'Overview', panel: 'Overview' },
  { id: 'activity', label: 'Activity', panel: 'Activity' },
  { id: 'settings', label: 'Settings', panel: 'Settings' },
  { id: 'unavailable', label: 'Unavailable', panel: 'Unavailable', disabled: true },
];
const overflowItems = [
  primaryItems[0],
  primaryItems[1],
  { id: 'team', label: 'Team', panel: 'Team' },
  ...primaryItems.slice(2),
  { id: 'analytics', label: 'Analytics', panel: 'Analytics' },
  { id: 'members', label: 'Members', panel: 'Members' },
  { id: 'billing', label: 'Billing', panel: 'Billing' },
];
const segmentItems = [
  { id: 'day', label: 'Day', panel: 'Day' },
  { id: 'week', label: 'Two weeks', panel: 'Two weeks' },
  { id: 'month', label: 'Month', panel: 'Month' },
];

function Canvas({ scheme }) {
  const [selected, setSelected] = React.useState('overview');
  const [overflowSelected, setOverflowSelected] = React.useState('overview');
  const [segmentSelected, setSegmentSelected] = React.useState('week');
  return React.createElement('section', {
    className: 'tabs-preview-canvas',
    id: `tabs-preview-${scheme}`,
    'data-muxui-theme': 'standard-harbour',
    'data-muxui-color-scheme': scheme,
  },
  React.createElement('header', { className: 'tabs-preview-header' },
    React.createElement('p', { className: 'tabs-preview-kicker' }, scheme),
    React.createElement('h2', null, 'A · Contrast')),
  React.createElement('div', { className: 'tabs-preview-grid' },
    React.createElement('article', { className: 'tabs-preview-example' },
      React.createElement('h3', null, 'Underline'),
      React.createElement(Tabs, {
        id: `${scheme}-underline-tabs`,
        items: primaryItems,
        value: selected,
        onChange: setSelected,
        'aria-label': `${scheme} underline tabs`,
      })),
    React.createElement('article', { className: 'tabs-preview-example' },
      React.createElement('h3', null, 'Pill'),
      React.createElement(Tabs, {
        id: `${scheme}-pill-tabs`,
        items: primaryItems,
        variant: 'pill',
        keyboardActivation: 'manual',
        defaultValue: 'activity',
        'aria-label': `${scheme} pill tabs`,
      })),
    React.createElement('article', { className: 'tabs-preview-example' },
      React.createElement('h3', null, 'Overflow'),
      React.createElement(Tabs, {
        id: `${scheme}-overflow-tabs`,
        items: overflowItems,
        variant: 'overflow',
        value: overflowSelected,
        onChange: setOverflowSelected,
        'aria-label': `${scheme} overflow tabs`,
      })),
    React.createElement('article', { className: 'tabs-preview-example' },
      React.createElement('h3', null, 'Segment'),
      React.createElement(Tabs, {
        id: `${scheme}-segment-tabs`,
        items: segmentItems,
        variant: 'segment',
        value: segmentSelected,
        onChange: setSegmentSelected,
        'aria-label': `${scheme} segment tabs`,
      }))),
  React.createElement('div', { className: 'tabs-preview-vertical' },
    React.createElement('h3', null, 'Vertical overflow'),
    React.createElement(Tabs, {
      id: `${scheme}-vertical-overflow-tabs`,
      items: overflowItems,
      variant: 'overflow',
      orientation: 'vertical',
      disabled: scheme === 'dark',
      defaultValue: 'members',
      'aria-label': `${scheme} vertical overflow tabs`,
    })));
}

export function TabsVariantPreviewFixture() {
  React.useEffect(() => {
    document.documentElement.dataset.muxuiTabsHydrated = 'true';
  }, []);
  return React.createElement('main', { className: 'tabs-preview-page' },
    React.createElement('header', { className: 'tabs-preview-title' },
      React.createElement('h1', null, 'Tabs variants'),
      React.createElement('p', null, 'A · Contrast. Select a tab to inspect the shape.')),
    React.createElement('div', { className: 'tabs-preview-canvases' },
      React.createElement(Canvas, { scheme: 'light' }),
      React.createElement(Canvas, { scheme: 'dark' })),
    React.createElement('p', { className: 'tabs-preview-note' }, 'Static component preview. Motion follows selection.'));
}
