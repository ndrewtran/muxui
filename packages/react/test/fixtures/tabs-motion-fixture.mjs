import React from 'react';
import { Tabs } from '../../src/collections.mjs';

const items = [
  { id: 'short', label: 'A', panel: 'Short panel' },
  { id: 'long', label: 'A considerably longer label', panel: 'Long panel' },
  { id: 'disabled', label: 'Unavailable', panel: 'Disabled panel', disabled: true },
];

export function TabsMotionFixture() {
  const [selected, setSelected] = React.useState('short');
  const [verticalSelected, setVerticalSelected] = React.useState('short');
  const [mounted, setMounted] = React.useState(true);
  const [changes, setChanges] = React.useState(0);
  const tabsRef = React.useRef(null);

  React.useEffect(() => {
    document.documentElement.dataset.muxuiTabsHydrated = 'true';
    document.documentElement.dataset.muxuiTabsRef = tabsRef.current?.className ?? '';
    window.__muxuiTabsSetSelected = setSelected;
    window.__muxuiTabsSetVerticalSelected = setVerticalSelected;
    window.__muxuiTabsUnmount = () => setMounted(false);
    return () => {
      delete window.__muxuiTabsSetSelected;
      delete window.__muxuiTabsSetVerticalSelected;
      delete window.__muxuiTabsUnmount;
    };
  }, []);

  if (!mounted) return React.createElement('div', { id: 'tabs-unmounted' });

  return React.createElement('main', null,
    React.createElement('output', { id: 'tabs-changes' }, String(changes)),
    React.createElement(Tabs, {
      ref: tabsRef,
      id: 'primary-tabs',
      className: 'tabs-primary',
      items,
      value: selected,
      onChange: (next) => {
        setSelected(next);
        setChanges((count) => count + 1);
      },
      'aria-label': 'Primary sections',
    }),
    React.createElement('div', { id: 'rtl-vertical-host', dir: 'rtl' },
      React.createElement(Tabs, {
        id: 'vertical-tabs',
        className: 'tabs-vertical',
        items,
        orientation: 'vertical',
        value: verticalSelected,
        onChange: setVerticalSelected,
        'aria-label': 'Vertical sections',
      })),
  );
}
