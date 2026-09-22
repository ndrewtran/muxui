import React from 'react';
import { Autocomplete } from '../../src/fields.mjs';
import { ComboBox, Menu, Select } from '../../src/collections.mjs';

const items = [
  { id: 'one', label: 'One', textValue: 'One' },
  { id: 'two', label: 'Two', textValue: 'Two' },
];

export function PopoverMotionFixture() {
  const [mounted, setMounted] = React.useState(true);
  const menuRef = React.useRef(null);
  const selectRef = React.useRef(null);

  React.useEffect(() => {
    document.documentElement.dataset.muxuiPopoverMotionHydrated = 'true';
    document.documentElement.dataset.muxuiPopoverRefs = [menuRef.current?.tagName, selectRef.current?.tagName].join(',');
    window.__muxuiPopoverUnmount = () => setMounted(false);
    return () => { delete window.__muxuiPopoverUnmount; };
  }, []);

  if (!mounted) return React.createElement('div', { id: 'popover-unmounted' });

  return React.createElement('main', null,
    React.createElement(Menu.Root, null,
      React.createElement(Menu.Trigger, { id: 'motion-menu-trigger', ref: menuRef }, 'Open menu'),
      React.createElement(Menu.Popup, null,
        React.createElement(Menu.List, { 'aria-label': 'Motion menu' },
          React.createElement(Menu.Item, { id: 'one' }, 'One'),
          React.createElement(Menu.Item, { id: 'two' }, 'Two')))),
    React.createElement(Select, {
      ref: selectRef,
      label: 'Motion select',
      items,
      defaultValue: 'one',
    }),
    React.createElement(ComboBox, { label: 'Motion combo', items, defaultValue: '' }),
    React.createElement(Autocomplete, { label: 'Motion suggestions', items, defaultValue: '' }),
  );
}
