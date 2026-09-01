import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { EXPECTED_R14_COMPONENT_SLUGS, EXPECTED_R14_DONOR_CONTRACT } from '../src/r1-4-donor-contract.mjs';

function installDom(markup = '<div id="root"></div>') {
  const dom = new JSDOM(`<!doctype html>${markup}`, { url: 'http://localhost/' });
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  dom.window.ResizeObserver = ResizeObserverMock;
  dom.window.matchMedia ??= () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  dom.window.PointerEvent ??= dom.window.MouseEvent;
  dom.window.requestAnimationFrame ??= (callback) => dom.window.setTimeout(callback, 0);
  dom.window.cancelAnimationFrame ??= (handle) => dom.window.clearTimeout(handle);
  const keys = [
    'window', 'document', 'Document', 'DocumentFragment', 'Element', 'HTMLElement', 'HTMLButtonElement',
    'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLDivElement', 'SVGElement', 'Node', 'NodeFilter',
    'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'PointerEvent', 'MutationObserver',
    'File', 'Blob', 'FileReader', 'DOMRect', 'ResizeObserver', 'getComputedStyle', 'requestAnimationFrame',
    'cancelAnimationFrame',
  ];
  const previous = new Map(keys.map((key) => [key, globalThis[key]]));
  for (const key of keys) {
    if (dom.window[key] !== undefined) globalThis[key] = dom.window[key];
  }
  const previousCss = globalThis.CSS;
  globalThis.CSS ??= { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/gu, (character) => `\\${character}`) };
  const elementPrototype = dom.window.HTMLElement.prototype;
  const previousScrollTo = elementPrototype.scrollTo;
  const previousAttachEvent = elementPrototype.attachEvent;
  const previousDetachEvent = elementPrototype.detachEvent;
  elementPrototype.scrollTo ??= () => {};
  elementPrototype.attachEvent ??= () => {};
  elementPrototype.detachEvent ??= () => {};
  const hadActFlag = 'IS_REACT_ACT_ENVIRONMENT' in globalThis;
  const previousActFlag = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return {
    dom,
    restore() {
      for (const [key, value] of previous) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
      if (previousCss === undefined) delete globalThis.CSS;
      else globalThis.CSS = previousCss;
      if (previousScrollTo === undefined) delete elementPrototype.scrollTo;
      else elementPrototype.scrollTo = previousScrollTo;
      if (previousAttachEvent === undefined) delete elementPrototype.attachEvent;
      else elementPrototype.attachEvent = previousAttachEvent;
      if (previousDetachEvent === undefined) delete elementPrototype.detachEvent;
      else elementPrototype.detachEvent = previousDetachEvent;
      if (hadActFlag) globalThis.IS_REACT_ACT_ENVIRONMENT = previousActFlag;
      else delete globalThis.IS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    },
  };
}

const moduleEnvironment = installDom();
const { UNSTABLE_ToastQueue } = await import('react-aria-components');
const {
  Dialog,
  DropZone,
  FileTrigger,
  Popover,
  PreviewTrigger,
  Toast,
  ToastProvider,
  Tooltip,
  useToast,
} = await import('../src/overlays.mjs');
moduleEnvironment.restore();

function closedOverlayTree() {
  return React.createElement(ToastProvider, null,
    React.createElement('div', null,
      React.createElement(DropZone, { 'aria-label': 'Drop files' }),
      React.createElement(FileTrigger, null),
      React.createElement(Dialog, { title: 'Details', trigger: React.createElement('button', null, 'Open dialog') }, 'Dialog body'),
      React.createElement(Popover, { 'aria-label': 'Actions', trigger: React.createElement('button', null, 'Open actions') }, 'Popover body'),
      React.createElement(PreviewTrigger, { 'aria-label': 'Preview', trigger: React.createElement('button', null, 'Show preview') }, 'Preview body'),
      React.createElement(Tooltip, { content: 'Helpful text', trigger: React.createElement('button', null, 'Show help') }),
      React.createElement(Toast, { message: 'Queued after hydration' })));
}

test('R1.4 overlay owners use RAC lifecycle primitives and expose MuxUI names only', async () => {
  const packageRoot = resolve(import.meta.dirname, '..');
  const source = await readFile(resolve(packageRoot, 'src/overlays.mjs'), 'utf8');
  const index = await readFile(resolve(packageRoot, 'generated/index.mjs'), 'utf8');
  const types = await readFile(resolve(packageRoot, 'generated/index.d.ts'), 'utf8');
  assert.match(source, /from 'react-aria-components'/u);
  assert.match(source, /AriaDropZone|AriaFileTrigger|AriaModalOverlay|AriaPopover|AriaPreviewTrigger|AriaTooltipTrigger|UNSTABLE_ToastRegion/u);
  assert.doesNotMatch(source, /createPortal|document\.addEventListener|window\.setTimeout|setInterval/u);
  assert.doesNotMatch(index, /export .*Modal\b|UNSTABLE_/u);
  assert.doesNotMatch(types, /react-aria-components|react-stately|UNSTABLE_/u);
  for (const name of ['DropZone', 'FileTrigger', 'Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'ToastProvider', 'useToast', 'Tooltip']) assert.match(index, new RegExp(`\\b${name}\\b`));
  assert.deepEqual(EXPECTED_R14_COMPONENT_SLUGS, ['drop-zone', 'file-trigger', 'dialog', 'popover', 'preview-trigger', 'toast', 'tooltip']);
  assert.equal(EXPECTED_R14_DONOR_CONTRACT.dependency, false);
});

test('R1.4 families are SSR and hydration safe and reject missing accessible content', async () => {
  const server = renderToString(closedOverlayTree());
  assert.match(server, /muxui-drop-zone/u);
  assert.match(server, /muxui-file-trigger/u);
  assert.doesNotMatch(server, /muxui-dialog-backdrop|muxui-popover|muxui-preview-trigger|muxui-tooltip|muxui-toast/u);
  assert.throws(() => renderToString(React.createElement(Dialog, { title: ' ' })), /Dialog requires a title or accessible name/u);
  assert.throws(() => renderToString(React.createElement(Popover, { 'aria-label': ' ', trigger: React.createElement('button', null, 'Open') }, 'Body')), /Popover requires an accessible name/u);
  assert.throws(() => renderToString(React.createElement(PreviewTrigger, { trigger: React.createElement('button', null, 'Preview') }, 'Body')), /PreviewTrigger requires an accessible name/u);
  assert.throws(() => renderToString(React.createElement(Tooltip, { content: '', trigger: React.createElement('button', null, 'Help') })), /Tooltip requires content/u);
  assert.throws(() => renderToString(React.createElement(ToastProvider, null, React.createElement(Toast, { message: '' }))), /Toast requires a message/u);

  const env = installDom(`<div id="root">${server}</div>`);
  let root;
  try {
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), closedOverlayTree()); });
    assert.match(document.body.textContent, /Queued after hydration/u);
    await act(async () => root.unmount());
    await Promise.resolve();
    assert.equal(document.querySelector('.muxui-toast'), null);
  } finally {
    env.restore();
  }
});

test('PreviewTrigger keeps naming on one non-modal inner dialog and cleans up its portal', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const outerRef = React.createRef();
  try {
    await act(async () => root.render(React.createElement(PreviewTrigger, {
      'aria-label': 'Preview details',
      className: 'custom-preview',
      defaultOpen: true,
      ref: outerRef,
      trigger: React.createElement('button', null, 'Show preview'),
    }, 'Preview body')));

    const outer = document.body.querySelector('.muxui-preview-trigger');
    assert.ok(outer);
    assert.equal(outerRef.current, outer);
    assert.equal(outer.classList.contains('custom-preview'), true);
    const dialogs = document.body.querySelectorAll('[role="dialog"]');
    assert.equal(dialogs.length, 1);
    assert.equal(dialogs[0].classList.contains('muxui-preview-content'), true);
    assert.equal(dialogs[0].getAttribute('aria-label'), 'Preview details');
    assert.equal(outer.hasAttribute('aria-label'), false);
    assert.equal(dialogs[0].hasAttribute('aria-modal'), false);
    assert.equal(document.body.querySelector('[data-testid="underlay"]'), null);

    await act(async () => root.render(React.createElement(PreviewTrigger, {
      'aria-labelledby': 'preview-heading',
      defaultOpen: true,
      trigger: React.createElement('button', null, 'Show preview'),
    }, React.createElement('h2', { id: 'preview-heading' }, 'Preview heading'))));
    const labelledDialog = document.body.querySelector('.muxui-preview-content');
    assert.equal(labelledDialog.getAttribute('aria-labelledby'), 'preview-heading');
    assert.equal(labelledDialog.hasAttribute('aria-label'), false);
    assert.equal(document.body.querySelector('.muxui-preview-trigger').hasAttribute('aria-labelledby'), false);

    await act(async () => root.unmount());
    assert.equal(document.body.querySelector('.muxui-preview-trigger'), null);
    assert.equal(document.body.querySelector('[role="dialog"]'), null);
  } finally {
    if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
    env.restore();
  }
});

test('Dialog and Toast close controls use decorative Lucide X icons', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  let manager;
  function CaptureManager() {
    manager = useToast();
    return null;
  }
  try {
    await act(async () => root.render(React.createElement(ToastProvider, null,
      React.createElement(CaptureManager),
      React.createElement(Dialog, { title: 'Details', defaultOpen: true }, 'Dialog body'))));
    const dialogClose = document.body.querySelector('.muxui-dialog-close');
    assert.ok(dialogClose);
    assert.equal(dialogClose.getAttribute('aria-label'), 'Close dialog');
    assert.equal(dialogClose.querySelector('svg')?.classList.contains('lucide-x'), true);
    assert.equal(dialogClose.querySelector('svg')?.getAttribute('aria-hidden'), 'true');
    assert.equal(dialogClose.querySelector('svg')?.getAttribute('focusable'), 'false');

    await act(async () => manager.add('Saved', { duration: 60000 }));
    const toastDismiss = document.body.querySelector('.muxui-toast-dismiss');
    assert.ok(toastDismiss);
    assert.equal(toastDismiss.getAttribute('aria-label'), 'Dismiss notification');
    assert.equal(toastDismiss.querySelector('svg')?.classList.contains('lucide-x'), true);
    assert.equal(toastDismiss.querySelector('svg')?.getAttribute('aria-hidden'), 'true');
    assert.equal(toastDismiss.querySelector('svg')?.getAttribute('focusable'), 'false');
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('Dialog dismissable false rejects trigger toggles after opening', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const changes = [];
  try {
    await act(async () => root.render(React.createElement(Dialog, {
      title: 'Details',
      dismissable: false,
      onOpenChange: (open) => changes.push(open),
      trigger: React.createElement('button', { id: 'dialog-trigger' }, 'Open dialog'),
    }, 'Dialog body')));
    const trigger = document.querySelector('#dialog-trigger');
    await act(async () => trigger.click());
    assert.ok(document.body.querySelector('.muxui-dialog'));
    assert.deepEqual(changes, [true]);
    await act(async () => trigger.click());
    assert.ok(document.body.querySelector('.muxui-dialog'));
    assert.deepEqual(changes, [true]);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.4 label guards reject empty hosts, fragments, and arrays while preserving valid labels', () => {
  for (const empty of [React.createElement('span'), React.createElement(React.Fragment), []]) {
    assert.throws(() => renderToString(React.createElement(Dialog, { title: empty })), /Dialog requires a title or accessible name/u);
    assert.throws(() => renderToString(React.createElement(Tooltip, { content: empty, trigger: React.createElement('button', null, 'Help') })), /Tooltip requires content/u);
    assert.throws(() => renderToString(React.createElement(ToastProvider, null, React.createElement(Toast, { message: empty }))), /Toast requires a message/u);
  }
  assert.doesNotThrow(() => renderToString(React.createElement(Dialog, { title: 0 })));
  assert.doesNotThrow(() => renderToString(React.createElement(Dialog, { title: React.createElement('span', { 'aria-label': 'Details' }) })));
  function CustomTitle() { return React.createElement('span', null, 'Custom title'); }
  assert.doesNotThrow(() => renderToString(React.createElement(Dialog, { title: React.createElement(CustomTitle) })));
});

test('DropZone and FileTrigger normalize browser inputs to Mux UI-owned values', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const drops = [];
  const activations = [];
  const selections = [];
  try {
    await act(async () => root.render(React.createElement(DropZone, { 'aria-label': 'Upload', onDrop: (event) => drops.push(event), onActivate: (event) => activations.push(event) }, 'Drop here')));
    const pasteTarget = host.querySelector('.muxui-drop-zone button');
    await act(async () => pasteTarget.focus());
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        types: ['text/plain'],
        items: [{ kind: 'string', type: 'text/plain' }],
        getData: (type) => type === 'text/plain' ? 'MuxUI clipboard text' : '',
      },
    });
    await act(async () => document.dispatchEvent(pasteEvent));
    assert.equal(drops.length, 1);
    assert.notEqual(drops[0], pasteEvent);
    assert.deepEqual(Object.keys(drops[0]).sort(), ['dropOperation', 'items', 'type', 'x', 'y']);
    assert.deepEqual({ type: drops[0].type, x: drops[0].x, y: drops[0].y, dropOperation: drops[0].dropOperation }, { type: 'drop', x: 0, y: 0, dropOperation: 'copy' });
    assert.equal(drops[0].items[0].kind, 'text');
    assert.deepEqual([...drops[0].items[0].types], ['text/plain']);
    assert.equal(await drops[0].items[0].getText('text/plain'), 'MuxUI clipboard text');
    const dropButton = host.querySelector('.muxui-drop-zone button');
    await act(async () => dropButton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
    assert.deepEqual(activations, [{ type: 'activate', x: 0, y: 0 }]);

    await act(async () => root.render(React.createElement(FileTrigger, {
      acceptedFileTypes: ['.txt', 'text/plain'],
      allowsMultiple: true,
      acceptDirectory: true,
      onSelect: (files) => selections.push(files),
    }, 'Choose files')));
    const input = host.querySelector('input[type="file"]');
    assert.equal(input.getAttribute('accept'), '.txt,text/plain');
    assert.equal(input.multiple, true);
    assert.equal(input.getAttribute('webkitdirectory'), '');
    assert.ok(host.querySelector('.muxui-file-trigger'));
    const file = new File(['fixture'], 'fixture.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    Object.defineProperty(input, 'files', { configurable: true, value: null });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    assert.equal(Array.isArray(selections[0]), true);
    assert.deepEqual(selections[0], [file]);
    assert.deepEqual(selections[1], []);
    // Native picker cancellation has no change event and therefore no callback.
    assert.equal(selections.length, 2);
    await act(async () => root.render(React.createElement(FileTrigger, {
      disabled: true,
      onSelect: (files) => selections.push(files),
    }, 'Choose files')));
    const disabledInput = host.querySelector('input[type="file"]');
    Object.defineProperty(disabledInput, 'files', { configurable: true, value: [file] });
    await act(async () => disabledInput.dispatchEvent(new Event('change', { bubbles: true })));
    assert.equal(selections.length, 2);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('DropZone mirrors disabled state on its public root for assistive technology', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const activations = [];
  try {
    await act(async () => root.render(React.createElement(DropZone, { 'aria-label': 'Upload', disabled: true, onActivate: (event) => activations.push(event) }, 'Drop here')));
    const dropZone = host.querySelector('.muxui-drop-zone');
    assert.ok(dropZone);
    assert.equal(dropZone.getAttribute('data-disabled'), 'true');
    assert.equal(dropZone.getAttribute('aria-disabled'), 'true');
    const dropButton = dropZone.querySelector('button');
    await act(async () => dropButton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
    assert.deepEqual(activations, []);

    await act(async () => root.render(React.createElement(DropZone, { 'aria-label': 'Upload' }, 'Drop here')));
    assert.equal(dropZone.getAttribute('data-disabled'), null);
    assert.equal(dropZone.getAttribute('aria-disabled'), null);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('Popover dismissable false prevents Escape and outside-press dismissal', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Popover, {
      'aria-label': 'Actions',
      trigger: React.createElement('button', null, 'Open actions'),
      defaultOpen: true,
      dismissable: false,
    }, 'Popover body')));
    const popover = document.body.querySelector('.muxui-popover');
    assert.ok(popover);

    await act(async () => {
      popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.ok(document.body.querySelector('.muxui-popover'));

    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    assert.ok(document.body.querySelector('.muxui-popover'));
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.4 overlay geometry accepts only the bounded Mux contract', () => {
  const trigger = React.createElement('button', null, 'Open');
  assert.throws(() => renderToString(React.createElement(Popover, { 'aria-label': 'Actions', trigger, offset: Number.NaN }, 'Body')), TypeError);
  assert.throws(() => renderToString(React.createElement(Popover, { 'aria-label': 'Actions', trigger, placement: 'left' }, 'Body')), TypeError);
  assert.throws(() => renderToString(React.createElement(Popover, { 'aria-label': 'Actions', trigger, shouldFlip: 'yes' }, 'Body')), TypeError);
  assert.throws(() => renderToString(React.createElement(Popover, { 'aria-label': 'Actions', trigger, containerPadding: -1 }, 'Body')), TypeError);
  assert.throws(() => renderToString(React.createElement(PreviewTrigger, { 'aria-label': 'Preview', trigger, delay: -1 }, 'Body')), TypeError);
  assert.throws(() => renderToString(React.createElement(Tooltip, { trigger, content: 'Help', crossOffset: Infinity })), TypeError);
  assert.throws(() => renderToString(React.createElement(ToastProvider, { maxVisible: Number.NaN })), TypeError);
  assert.throws(() => renderToString(React.createElement(ToastProvider, { placement: 'middle' })), TypeError);
  assert.doesNotThrow(() => renderToString(React.createElement(Popover, {
    'aria-label': 'Actions', trigger, placement: 'start', offset: 0, crossOffset: -2, shouldFlip: false, containerPadding: 0,
  }, 'Body')));
});

test('timed overlays mask and cancel disabled interactions without disabling triggers', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const changes = [];
  const previewTrigger = (props = {}) => React.createElement(PreviewTrigger, {
    'aria-label': 'Preview', trigger: React.createElement('button', { id: 'preview-trigger' }, 'Preview'), onOpenChange: (open) => changes.push(open), ...props,
  }, 'Preview body');
  try {
    await act(async () => root.render(previewTrigger()));
    assert.equal(document.body.querySelector('.muxui-preview-trigger'), null);
    const openTrigger = document.querySelector('#preview-trigger');
    await act(async () => openTrigger.focus());
    assert.equal(document.activeElement, openTrigger);
    await act(async () => root.render(previewTrigger({ disabled: true })));
    assert.equal(document.body.querySelector('.muxui-preview-trigger'), null);
    assert.deepEqual(changes, [false]);
    const disabledTrigger = document.querySelector('#preview-trigger');
    assert.equal(document.activeElement, disabledTrigger);
    assert.equal(disabledTrigger.disabled, false);
    assert.equal(disabledTrigger.getAttribute('aria-disabled'), 'true');
    assert.equal(disabledTrigger.getAttribute('data-disabled'), 'true');
    act(() => disabledTrigger.focus());
    assert.equal(document.activeElement, disabledTrigger);

    await act(async () => root.render(previewTrigger({ defaultOpen: true })));
    assert.equal(document.body.querySelector('.muxui-preview-trigger'), null);
    await act(async () => root.render(previewTrigger({ delay: 100 })));
    const pendingTrigger = document.querySelector('#preview-trigger');
    await act(async () => {
      pendingTrigger.blur();
      pendingTrigger.focus();
    });
    await act(async () => root.render(previewTrigger({ delay: 100, disabled: true })));
    assert.deepEqual(changes, [false, false]);
    await act(async () => root.render(previewTrigger({ delay: 100 })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 125)));
    assert.equal(document.body.querySelector('.muxui-preview-trigger'), null);

    const controlledChanges = [];
    const controlled = (disabled) => React.createElement(PreviewTrigger, {
      key: 'controlled', 'aria-label': 'Controlled preview', open: true, disabled, trigger: React.createElement('button', { id: 'controlled-preview' }, 'Preview'), onOpenChange: (open) => controlledChanges.push(open),
    }, 'Preview body');
    await act(async () => root.render(controlled(false)));
    assert.ok(document.body.querySelector('.muxui-preview-trigger'));
    await act(async () => root.render(controlled(true)));
    assert.equal(document.body.querySelector('.muxui-preview-trigger'), null);
    assert.deepEqual(controlledChanges, [false]);
    await act(async () => root.render(controlled(true)));
    assert.deepEqual(controlledChanges, [false]);
    await act(async () => root.render(controlled(false)));
    assert.ok(document.body.querySelector('.muxui-preview-trigger'));

    const tooltipChanges = [];
    const tooltip = (disabled) => React.createElement(Tooltip, {
      content: 'Helpful text', disabled, trigger: React.createElement('button', { id: 'tooltip-trigger' }, 'Help'), onOpenChange: (open) => tooltipChanges.push(open),
    });
    await act(async () => root.render(tooltip(false)));
    const tooltipTrigger = document.querySelector('#tooltip-trigger');
    await act(async () => tooltipTrigger.focus());
    assert.equal(document.activeElement, tooltipTrigger);
    await act(async () => root.render(tooltip(true)));
    assert.equal(document.activeElement, document.querySelector('#tooltip-trigger'));
    assert.equal(document.querySelector('#tooltip-trigger').getAttribute('aria-disabled'), 'true');
    assert.equal(document.querySelector('#tooltip-trigger').disabled, false);
    assert.deepEqual(tooltipChanges, [true, false]);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('ToastProvider pauses auto-dismiss timers before clearing on teardown', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const originalPauseAll = UNSTABLE_ToastQueue.prototype.pauseAll;
  const originalClear = UNSTABLE_ToastQueue.prototype.clear;
  const calls = [];
  UNSTABLE_ToastQueue.prototype.pauseAll = function pauseAll(...args) {
    calls.push('pauseAll');
    return originalPauseAll.apply(this, args);
  };
  UNSTABLE_ToastQueue.prototype.clear = function clear(...args) {
    calls.push('clear');
    return originalClear.apply(this, args);
  };
  let manager;
  function CaptureManager() {
    manager = useToast();
    return null;
  }
  try {
    await act(async () => root.render(React.createElement(ToastProvider, null, React.createElement(CaptureManager))));
    await act(async () => manager.add('Pending teardown', { duration: 60000 }));
    assert.ok(document.body.querySelector('.muxui-toast'));
    await act(async () => root.unmount());
    await Promise.resolve();
    assert.deepEqual(calls.slice(-2), ['pauseAll', 'clear']);
  } finally {
    UNSTABLE_ToastQueue.prototype.pauseAll = originalPauseAll;
    UNSTABLE_ToastQueue.prototype.clear = originalClear;
    if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
    env.restore();
  }
});

test('ToastProvider normalizes zero maxVisible so toasts still auto-dismiss', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  let manager;
  let dismissed = 0;
  function CaptureManager() {
    manager = useToast();
    return null;
  }
  try {
    await act(async () => root.render(React.createElement(ToastProvider, { maxVisible: 0 }, React.createElement(CaptureManager))));
    await act(async () => manager.add('Visible toast', { duration: 25, onDismiss: () => { dismissed += 1; } }));
    assert.ok(document.body.querySelector('.muxui-toast'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    assert.equal(dismissed, 1);
    assert.equal(document.body.querySelector('.muxui-toast'), null);
  } finally {
    if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
    env.restore();
  }
});

test('title-less useToast notifications have an accessible RAC name', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  let manager;
  function CaptureManager() {
    manager = useToast();
    return null;
  }
  try {
    await act(async () => root.render(React.createElement(ToastProvider, null, React.createElement(CaptureManager))));
    await act(async () => manager.add('Saved', { duration: 60000 }));
    const toast = document.body.querySelector('.muxui-toast');
    assert.ok(toast);
    assert.equal(toast.getAttribute('role'), 'alertdialog');
    const labelledBy = toast.getAttribute('aria-labelledby');
    assert.ok(labelledBy);
    const title = document.getElementById(labelledBy);
    assert.ok(title);
    assert.equal(title.classList.contains('muxui-toast-title-fallback'), true);
    assert.equal(title.textContent, 'Notification');
    const content = toast.querySelector('.muxui-toast-content');
    const dismiss = toast.querySelector('.muxui-toast-dismiss');
    assert.ok(content);
    assert.ok(dismiss);
    assert.equal(content.parentElement, toast);
    assert.equal(dismiss.parentElement, toast);
    assert.equal(content.contains(dismiss), false);
    assert.equal(dismiss.getAttribute('aria-label'), 'Dismiss notification');
    assert.equal(dismiss.querySelector('svg')?.classList.contains('lucide-x'), true);
    assert.equal(dismiss.querySelector('svg')?.getAttribute('aria-hidden'), 'true');
    assert.equal(dismiss.querySelector('svg')?.getAttribute('focusable'), 'false');
    const styles = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
    assert.match(styles, /:where\([\s\S]*\.muxui-toast-dismiss[\s\S]*border:\s*1px solid transparent;[\s\S]*appearance:\s*none;/u);
    assert.match(styles, /\.muxui-toast-dismiss\s*\{[^}]*aspect-ratio:\s*1;[\s\S]*width:\s*calc\(1rem \+ var\(--muxui-semantic-layout-tight-inset\) \+ var\(--muxui-semantic-layout-tight-inset\) \+ 2px\);[\s\S]*height:\s*calc\(1rem \+ var\(--muxui-semantic-layout-tight-inset\) \+ var\(--muxui-semantic-layout-tight-inset\) \+ 2px\);[\s\S]*padding:\s*var\(--muxui-semantic-layout-tight-inset\);[\s\S]*border-radius:\s*var\(--muxui-semantic-shape-option-radius\)/u);
    assert.match(styles, /\.muxui-dialog-close\s*\{[^}]*aspect-ratio:\s*1;[\s\S]*width:\s*calc\(1rem \+ var\(--muxui-semantic-layout-tight-inset\) \+ var\(--muxui-semantic-layout-tight-inset\) \+ 2px\);[\s\S]*height:\s*calc\(1rem \+ var\(--muxui-semantic-layout-tight-inset\) \+ var\(--muxui-semantic-layout-tight-inset\) \+ 2px\);/u);
    assert.match(styles, /\.muxui-toast\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/u);
    assert.match(styles, /\.muxui-toast-content\s*\{[^}]*display:\s*grid/u);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('declarative Toast teardown cancels its timer without settling onDismiss', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set();
  globalThis.setTimeout = (...args) => {
    const handle = originalSetTimeout(...args);
    activeTimers.add(handle);
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    activeTimers.delete(handle);
    return originalClearTimeout(handle);
  };
  let dismissed = 0;
  try {
    await act(async () => root.render(
      React.createElement(React.StrictMode, null,
        React.createElement(ToastProvider, null,
          React.createElement(Toast, { message: 'Declarative toast', duration: 60000, onDismiss: () => { dismissed += 1; } }))
      )
    ));
    await Promise.resolve();
    assert.equal(dismissed, 0);
    assert.equal(activeTimers.size, 1);
    const toast = document.body.querySelector('.muxui-toast');
    assert.ok(toast);
    assert.equal(toast.getAttribute('role'), 'alertdialog');
    const labelledBy = toast.getAttribute('aria-labelledby');
    assert.ok(labelledBy);
    const title = document.getElementById(labelledBy);
    assert.ok(title);
    assert.equal(title.classList.contains('muxui-toast-title-fallback'), true);
    assert.equal(title.textContent, 'Notification');

    await act(async () => root.unmount());
    await Promise.resolve();
    assert.equal(activeTimers.size, 0);
    assert.equal(dismissed, 0);
    assert.equal(document.body.querySelector('.muxui-toast'), null);
  } finally {
    for (const handle of activeTimers) originalClearTimeout(handle);
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
    env.restore();
  }
});

test('Toast keeps one stable MuxUI manager and settles accepted dismissals once', async () => {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  let manager;
  function CaptureManager() {
    manager = useToast();
    return null;
  }
  let dismissed = 0;
  try {
    await act(async () => root.render(React.createElement(React.StrictMode, null,
      React.createElement(ToastProvider, null, React.createElement(CaptureManager)))));
    await Promise.resolve();
    assert.ok(manager);
    assert.throws(() => manager.add('   '), /Toast requires a message/u);
    let firstKey;
    await act(async () => { firstKey = manager.add('Saved', { title: 'Complete', duration: 60000, onDismiss: () => { dismissed += 1; } }); });
    const toast = document.body.querySelector('.muxui-toast');
    assert.ok(toast);
    assert.equal(toast.getAttribute('role'), 'alertdialog');
    assert.match(toast.textContent, /Complete.*Saved/u);
    assert.ok(toast.querySelector('[role="alert"]'));
    await act(async () => manager.remove(firstKey));
    await act(async () => manager.remove(firstKey));
    assert.equal(dismissed, 1);

    await act(async () => { manager.add('Pending teardown', { duration: 60000, onDismiss: () => { dismissed += 1; } }); });
    await act(async () => { root.unmount(); await Promise.resolve(); });
    await Promise.resolve();
    assert.equal(dismissed, 1);
    assert.equal(document.body.querySelector('.muxui-toast'), null);
  } finally {
    if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
    env.restore();
  }
});
