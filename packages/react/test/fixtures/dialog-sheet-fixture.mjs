import React from 'react';
import { Button } from '../../src/button.ts';
import { Dialog, Popover } from '../../src/overlays.ts';

const h = React.createElement;
const ROWS = Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`);

/**
 * A sheet for the browser proof. `mode` picks the sheet: `long` scrolls its content and holds a field and a nested
 * Popover, `short` holds one line, `rejected` is long with an owner that keeps it open, and `locked` is long and not
 * dismissable. Each open change is reported through `onChange`.
 */
export function DialogSheetFixture({ mode = 'long', open, onOpenChange, defaultOpen }) {
  const short = mode === 'short';
  return h('div', { id: 'sheet-scope', 'data-muxui-motion': 'full' },
    h('p', { id: 'page-text' }, 'Page content behind the sheet.'),
    h(Dialog, {
      title: 'Filters',
      description: short ? undefined : 'Choose what the list shows.',
      presentation: 'sheet',
      trigger: h('button', { type: 'button', id: 'trigger' }, 'Open sheet'),
      open,
      defaultOpen,
      onOpenChange,
      dismissable: mode !== 'locked',
      actions: mode === 'locked' ? h(Button, { slot: 'close', id: 'done' }, 'Done') : undefined,
    }, short
      ? h('p', { id: 'short-body' }, 'One line of content.')
      : h(React.Fragment, null,
        h('label', { htmlFor: 'sheet-field' }, 'Name'),
        h('input', { id: 'sheet-field', defaultValue: 'Quarterly report draft' }),
        h(Popover, { 'aria-label': 'More filters', trigger: h('button', { type: 'button', id: 'nested-trigger' }, 'More filters') },
          h('button', { type: 'button', id: 'nested-action' }, 'Nested action')),
        h('ul', { id: 'rows' }, ROWS.map((row) => h('li', { key: row }, row))))));
}
