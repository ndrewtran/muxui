import React from 'react';
import { Button } from '../../src/button.ts';
import { Dialog, Popover } from '../../src/overlays.ts';

const h = React.createElement;
const LINES = Array.from({ length: 24 }, (_, index) => `Line ${index + 1}`);

/**
 * A Popover opened from code, for the browser proof. It has no trigger: the Link tool calls `onOpenChange(true)`, and
 * the Popover is placed against the element `anchor` names. In the `frame` layout a narrow frame that scrolls sits in a
 * wide page, with the toolbar at its top or bottom (`toolbarAt`), so the page has room the frame does not; in the
 * `sheet` layout the toolbar and the Popover are inside a Dialog presented as a sheet, whose panel can be the boundary.
 *
 * - `open` and `onOpenChange` control the Popover; `uncontrolled` gives it `defaultOpen` instead.
 * - `anchor`: the Link tool (`link`), the toolbar (`row`), an element further down (`second`), or none (`none`).
 * - `boundary`: the frame (`frame`), the whole page (`page`), the sheet's panel (`sheet`), or none (`none`).
 * - `opener`: the Link tool is shown, `hidden`, `disabled`, or `removed`.
 * - `initialFocus` and `returnFocus` pass the address field and the editor; `autoFocusField` sets the field's autoFocus,
 *   and `fieldDisabled` disables it.
 * - `mounted: false` removes the Popover; `sheetOpen` and `onSheetOpenChange` control the sheet.
 * Every other prop (`modal`, `placement`, `colorScheme`, `dismissable`) passes to the Popover.
 */
export function PopoverAnchorFixture({
  layout = 'frame',
  open,
  onOpenChange,
  uncontrolled = false,
  defaultOpen = false,
  anchor = 'link',
  boundary = 'none',
  opener = 'shown',
  toolbarAt = 'top',
  initialFocus = false,
  returnFocus = false,
  autoFocusField = false,
  fieldDisabled = false,
  mounted = true,
  sheetOpen = false,
  onSheetOpenChange,
  frameScope,
  ...popoverProps
}) {
  const anchorRef = React.useRef(null);
  const frameRef = React.useRef(null);
  const pageRef = React.useRef(null);
  const sheetRef = React.useRef(null);
  const fieldRef = React.useRef(null);
  const editorRef = React.useRef(null);
  const boundaryRef = { frame: frameRef, page: pageRef, sheet: sheetRef }[boundary];
  const sheet = layout === 'sheet';
  const prefix = sheet ? 'sheet-' : '';
  const anchored = (name) => (anchor === name ? anchorRef : undefined);

  const toolbar = h('div', { id: `${prefix}toolbar`, ref: anchored('row'), role: 'toolbar', 'aria-label': 'Formatting', style: { display: 'flex', justifyContent: 'flex-end', gap: 4, padding: 4, marginBlockStart: toolbarAt === 'bottom' ? 440 : 0 } },
    h('button', { type: 'button', id: `${prefix}bold` }, 'Bold'),
    opener === 'removed' ? null : h('button', {
      type: 'button',
      id: `${prefix}link`,
      ref: anchored('link'),
      hidden: opener === 'hidden',
      disabled: opener === 'disabled',
      onClick: () => onOpenChange?.(true),
    }, 'Link'));
  const editor = h('textarea', { id: `${prefix}editor`, ref: editorRef, 'aria-label': 'Body', rows: 3 });
  const second = h('p', null, h('span', { id: `${prefix}second`, ref: anchored('second') }, 'Second anchor'));
  const lines = h('ul', { id: `${prefix}lines` }, LINES.map((line) => h('li', { key: line }, line)));
  const popover = mounted ? h(Popover, {
    'aria-label': 'Add link',
    anchorRef,
    boundaryRef,
    initialFocusRef: initialFocus ? fieldRef : undefined,
    returnFocusRef: returnFocus ? editorRef : undefined,
    placement: 'bottom-start',
    ...(uncontrolled ? { defaultOpen } : { open }),
    onOpenChange,
    ...popoverProps,
  }, h('div', { style: { width: 240 } },
    h('label', { htmlFor: 'address', style: { display: 'block' } }, 'Address'),
    h('input', { id: 'address', ref: fieldRef, autoFocus: autoFocusField || undefined, disabled: fieldDisabled || undefined }),
    h(Button, { slot: 'close', id: 'done' }, 'Done'))) : null;

  if (sheet) {
    return h('div', { id: 'page', ref: pageRef, 'data-muxui-motion': 'full' },
      h(Dialog, {
        ref: sheetRef,
        title: 'Reply',
        presentation: 'sheet',
        trigger: h('button', { type: 'button', id: 'sheet-trigger' }, 'Reply'),
        open: sheetOpen,
        onOpenChange: onSheetOpenChange,
      }, toolbar, editor, popover, second, lines));
  }
  return h('div', { id: 'page', ref: pageRef, style: { position: 'relative', width: 900, height: 700 } },
    h('div', {
      id: 'frame',
      ref: frameRef,
      tabIndex: -1,
      style: { position: 'absolute', insetInlineStart: 40, insetBlockStart: 40, width: 300, height: 520, overflow: 'auto', boxSizing: 'border-box', border: '1px solid' },
      ...frameScope,
    }, toolbar, editor, second, lines),
    h('button', { type: 'button', id: 'outside', style: { position: 'absolute', insetInlineStart: 600, insetBlockStart: 40 } }, 'Outside'),
    popover);
}
