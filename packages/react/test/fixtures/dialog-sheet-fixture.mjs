import React from 'react';
import { Button } from '../../src/button.ts';
import { Dialog, Popover } from '../../src/overlays.ts';

const h = React.createElement;
const ROWS = Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`);
const WORDY = 'Choose what the list shows. The rows can be narrowed by name, owner, status and the date they last changed, and the '
  + 'choice applies to every list in this workspace until someone changes it again. Saved views keep their own choices, '
  + 'and a choice made here never changes them.';

/**
 * A sheet for the browser proof. `mode` picks the sheet: `long` scrolls its content and holds a field and a nested
 * Popover, `short` holds one line, `rejected` is long with an owner that keeps it open, and `locked` is long and not
 * dismissable. `wordy` gives it a description that wraps over many lines, and `presentation` and `dismissable`
 * override the sheet's own. Each open change is reported through `onOpenChange`.
 */
export function DialogSheetFixture({ mode = 'long', open, onOpenChange, defaultOpen, wordy = false, presentation = 'sheet', dismissable = mode !== 'locked' }) {
  const short = mode === 'short';
  return h('div', { id: 'sheet-scope', 'data-muxui-motion': 'full' },
    h('p', { id: 'page-text' }, 'Page content behind the sheet.'),
    h(Dialog, {
      title: 'Filters',
      description: short ? undefined : wordy ? WORDY : 'Choose what the list shows.',
      presentation,
      trigger: h('button', { type: 'button', id: 'trigger' }, 'Open sheet'),
      open,
      defaultOpen,
      onOpenChange,
      dismissable,
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
