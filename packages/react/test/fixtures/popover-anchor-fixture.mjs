import React from 'react';
import { Button } from '../../src/button.ts';
import { Menu } from '../../src/menu.ts';
import { Dialog, Popover } from '../../src/overlays.ts';

const h = React.createElement;
const LINES = Array.from({ length: 24 }, (_, index) => `Line ${index + 1}`);

// An anchor that unmounts through its own state, so the Popover placed against it does not render then.
function AnchorIsland({ anchorRef }) {
  const [shown, setShown] = React.useState(true);
  React.useEffect(() => {
    window.__popoverAnchor.removeIsland = () => setShown(false);
  }, []);
  return shown ? h('span', { id: 'island', ref: anchorRef, style: { display: 'inline-block', marginInlineStart: 120 } }, 'Island anchor') : null;
}

// A Popover with a trigger, open as it mounts, whose owner focuses the name field inside it and selects the name in its
// own effect, as a rename control does. `how` gives it `defaultOpen` (`default`) or controls it (`controlled`); the
// effect records whether it found the field in the page.
function RenameName({ how }) {
  const fieldRef = React.useRef(null);
  const [open, setOpen] = React.useState(true);
  React.useEffect(() => {
    const field = fieldRef.current;
    window.__popoverAnchor.renameFound = Boolean(field?.isConnected);
    field?.focus();
    field?.select();
  }, []);
  return h(Popover, {
    'aria-label': 'Rename',
    trigger: h('button', { type: 'button', id: 'rename' }, 'Rename'),
    ...(how === 'controlled' ? { open, onOpenChange: setOpen } : { defaultOpen: true }),
  }, h('input', { id: 'name', ref: fieldRef, 'aria-label': 'Name', defaultValue: 'Draft name' }));
}

/**
 * A Popover opened from code, for the browser proof. It has no trigger: the Link tool calls `onOpenChange(true)`, and
 * the Popover is placed against the element `anchor` names. In the `frame` layout a narrow frame that scrolls sits in a
 * wide page, with the toolbar at its top or bottom (`toolbarAt`), so the page has room the frame does not; in the
 * `sheet` layout the toolbar and the Popover are inside a Dialog presented as a sheet, whose panel can be the boundary,
 * in the `dialog` layout inside a centred Dialog, and in the `popover` layout inside another Popover, named Reply. In
 * those three the ids of the elements inside the container start with the layout's name and a dash.
 *
 * - `open` and `onOpenChange` control the Popover; `uncontrolled` gives it `defaultOpen` instead.
 * - `anchor`: the Link tool (`link`), the toolbar (`row`), an element further down (`second`), one that unmounts through
 *   its own state (`island`, see window.__popoverAnchor.removeIsland), or none (`none`).
 * - `boundary`: the frame (`frame`), the whole page (`page`), the container (`sheet`), or none (`none`).
 * - `opener`: the Link tool is shown, `hidden`, `disabled`, or `removed`.
 * - `initialFocus` and `returnFocus` pass the address field and the editor; `autoFocusField` sets the field's autoFocus,
 *   and `fieldDisabled` disables it; `tall` adds a notes field, so the Popover is taller than a short frame.
 * - `withTrigger` gives the Popover a trigger of its own, `#trigger`, beside its anchor.
 * - `frameHeight` sets the frame's height in pixels.
 * - `late`: the Popover is rendered before its anchor, `#late`, and both mount in one commit once it is true;
 *   `lateAnchor: false` leaves the anchor out.
 * - `mounted: false` removes the Popover, and `mountWhenOpen` renders it only while `open` is true, so it mounts open.
 * - `sheetOpen` and `onSheetOpenChange` control the container, and `#reply-with-link` on the page opens the container
 *   and the Popover in one press.
 * - `rename` adds a second Popover open as it mounts, whose owner selects the text of its name field (see RenameName).
 * - `menu` adds an Insert menu to the toolbar whose opening also opens the Popover, so one press of its trigger,
 *   `#insert`, opens both; with `menu: 'item'`, choosing one of its items opens the Popover instead.
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
  tall = false,
  withTrigger = false,
  frameHeight = 520,
  late = false,
  lateAnchor = true,
  mounted = true,
  sheetOpen = false,
  onSheetOpenChange,
  frameScope,
  rename,
  menu = false,
  mountWhenOpen = false,
  ...popoverProps
}) {
  const anchorRef = React.useRef(null);
  const lateRef = React.useRef(null);
  const frameRef = React.useRef(null);
  const pageRef = React.useRef(null);
  const sheetRef = React.useRef(null);
  const fieldRef = React.useRef(null);
  const editorRef = React.useRef(null);
  const boundaryRef = { frame: frameRef, page: pageRef, sheet: sheetRef }[boundary];
  const prefix = layout === 'frame' ? '' : `${layout}-`;
  const anchored = (name) => (anchor === name ? anchorRef : undefined);

  const toolbar = h('div', { id: `${prefix}toolbar`, ref: anchored('row'), role: 'toolbar', 'aria-label': 'Formatting', style: { display: 'flex', justifyContent: 'flex-end', gap: 4, padding: 4, marginBlockStart: toolbarAt === 'bottom' ? 440 : 0 } },
    h('button', { type: 'button', id: `${prefix}bold` }, 'Bold'),
    menu ? h(Menu.Root, menu === 'item' ? { onAction: () => onOpenChange?.(true) } : { onOpenChange: (next) => next && onOpenChange?.(true) },
      h(Menu.Trigger, { id: 'insert' }, 'Insert'),
      h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Insert', items: ['Image', 'Table'] }))) : null,
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
  const island = anchor === 'island' ? h(AnchorIsland, { anchorRef }) : null;
  const lines = h('ul', { id: `${prefix}lines` }, LINES.map((line) => h('li', { key: line }, line)));
  const popoverOf = (ref) => h(Popover, {
    'aria-label': 'Add link',
    anchorRef: ref,
    boundaryRef,
    initialFocusRef: initialFocus ? fieldRef : undefined,
    returnFocusRef: returnFocus ? editorRef : undefined,
    placement: 'bottom-start',
    ...(withTrigger && { trigger: h('button', { type: 'button', id: 'trigger' }, 'Open') }),
    ...(uncontrolled ? { defaultOpen } : { open }),
    onOpenChange,
    ...popoverProps,
  }, h('div', { style: { width: 240 } },
    h('label', { htmlFor: 'address', style: { display: 'block' } }, 'Address'),
    h('input', { id: 'address', ref: fieldRef, autoFocus: autoFocusField || undefined, disabled: fieldDisabled || undefined }),
    tall ? h('textarea', { id: 'notes', 'aria-label': 'Notes', rows: 8, style: { display: 'block' } }) : null,
    h(Button, { slot: 'close', id: 'done' }, 'Done')));
  const popover = mounted && !late && (!mountWhenOpen || open) ? popoverOf(anchorRef) : null;
  // The Popover first, so it renders and runs its effects before its anchor's ref is attached.
  const lateBlock = late ? h('div', { id: 'late-block' }, popoverOf(lateRef), lateAnchor ? h('span', { id: 'late', ref: lateRef }, 'Late anchor') : null) : null;

  if (layout !== 'frame') {
    const container = {
      ref: sheetRef,
      trigger: h('button', { type: 'button', id: `${prefix}trigger` }, 'Reply'),
      open: sheetOpen,
      onOpenChange: onSheetOpenChange,
    };
    return h('div', { id: 'page', ref: pageRef, 'data-muxui-motion': 'full' },
      h('button', { type: 'button', id: 'reply-with-link', onClick: () => { onSheetOpenChange?.(true); onOpenChange?.(true); } }, 'Reply with link'),
      layout === 'popover'
        ? h(Popover, { ...container, 'aria-label': 'Reply' }, toolbar, editor, popover, second)
        : h(Dialog, { ...container, title: 'Reply', presentation: layout === 'dialog' ? 'center' : 'sheet' }, toolbar, editor, popover, second, lines));
  }
  return h('div', { id: 'page', ref: pageRef, style: { position: 'relative', width: 900, height: 700 } },
    h('div', {
      id: 'frame',
      ref: frameRef,
      tabIndex: -1,
      style: { position: 'absolute', insetInlineStart: 40, insetBlockStart: 40, width: 300, height: frameHeight, overflow: 'auto', boxSizing: 'border-box', border: '1px solid' },
      ...frameScope,
    }, toolbar, island, lateBlock, editor, second, lines),
    h('button', { type: 'button', id: 'outside', style: { position: 'absolute', insetInlineStart: 600, insetBlockStart: 40 } }, 'Outside'),
    rename ? h('div', { style: { position: 'absolute', insetInlineStart: 600, insetBlockStart: 120 } }, h(RenameName, { how: rename })) : null,
    popover);
}
