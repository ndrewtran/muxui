import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createDom } from './support/dom.mjs';

// A toast's action: one named button between the message and the dismiss control, named again by a polite status once
// the toast is shown. Activating it runs its handler once and then closes the toast as the dismiss control does, so
// onDismiss follows it once. A toast that has an action when it is added stays at least 10000 ms. The browser proof of
// hover, focus, the keyboard path, motion and forced colours is test/browser/toast-action.test.mjs.

const installDom = () => createDom(undefined, { layoutStubs: true });

const moduleEnvironment = installDom();
const { Toast, ToastProvider, useToast } = await import('../src/overlays.ts');
moduleEnvironment.restore();

// Mounts a provider, hands back its manager, and records the delay of every timer longer than the entry motion.
async function mountProvider(t, children = null) {
  const env = installDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const delays = [];
  const active = new Set();
  globalThis.setTimeout = (callback, delay, ...args) => {
    const handle = originalSetTimeout((...callbackArgs) => {
      active.delete(handle);
      callback(...callbackArgs);
    }, delay, ...args);
    if (delay >= 1000) {
      delays.push(delay);
      active.add(handle);
    }
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    active.delete(handle);
    return originalClearTimeout(handle);
  };
  t.after(async () => {
    for (const handle of active) originalClearTimeout(handle);
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
    env.restore();
  });
  let manager;
  function CaptureManager() {
    manager = useToast();
    return null;
  }
  await act(async () => root.render(React.createElement(ToastProvider, null, React.createElement(CaptureManager), children)));
  return { root, manager: () => manager, delays, active };
}

const settle = () => act(async () => { await Promise.resolve(); });

test('a toast action is a named button between the message and the dismiss control, and a polite status names it', async (t) => {
  const { manager } = await mountProvider(t);
  await act(async () => { manager().add('The draft is archived.', { title: 'Archived', duration: 60000, action: { label: 'Undo', onAction() {} } }); });
  await settle();
  const toast = document.body.querySelector('.muxui-toast');
  const parts = [...toast.children].map((child) => child.className.split(' ').find((name) => name.startsWith('muxui-toast__')));
  assert.deepEqual(parts, ['muxui-toast__content', 'muxui-toast__action', 'muxui-toast__dismiss', 'muxui-toast__announcer']);
  const action = toast.querySelector('.muxui-toast__action');
  assert.equal(action.tagName, 'BUTTON');
  assert.equal(action.textContent, 'Undo');
  assert.equal(action.classList.contains('muxui-button'), true, 'the action is a Mux Button');
  assert.equal(toast.querySelector('[role="alert"]').contains(action), false, 'the alert announces the message, not the button');
  const status = toast.querySelector('.muxui-toast__announcer');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.textContent, 'Undo', 'the status names the action once the toast is shown');
  assert.equal(document.activeElement, document.body, 'showing the toast moves no focus');

  // A toast without an action has neither part.
  await act(async () => { manager().add('Saved', { duration: 60000 }); });
  const plain = [...document.body.querySelectorAll('.muxui-toast')].find((node) => node.textContent.includes('Saved'));
  assert.equal(plain.querySelector('.muxui-toast__action, .muxui-toast__announcer'), null);
});

test('a toast action needs a label and a handler', async (t) => {
  const { manager } = await mountProvider(t);
  assert.throws(() => manager().add('Archived', { action: { label: '  ', onAction() {} } }), /Toast action requires a label/u);
  assert.throws(() => manager().add('Archived', { action: { onAction() {} } }), /Toast action requires a label/u);
  assert.throws(() => manager().add('Archived', { action: { label: 'Undo' } }), /Toast action requires an onAction function/u);
  assert.equal(document.body.querySelector('.muxui-toast'), null, 'no toast is added');
});

test('a toast that has an action stays at least 10000 ms, and 0 still keeps it until it is dismissed', async (t) => {
  const { manager, delays } = await mountProvider(t);
  const action = { label: 'Undo', onAction() {} };
  // The first timer a toast starts runs for its whole duration. Each toast is removed before the next, so no earlier
  // timer resumes in between.
  const firstTimer = async (message, options) => {
    delays.length = 0;
    let key;
    await act(async () => { key = manager().add(message, options); });
    const delay = delays[0];
    await act(async () => manager().remove(key));
    return delay;
  };
  for (const [duration, expected] of [[1000, 10000], [undefined, 10000], [9999, 10000], [12000, 12000]]) {
    assert.equal(await firstTimer('Archived', { duration, action }), expected, `a duration of ${duration} with an action starts a ${expected} ms timer`);
  }
  assert.equal(await firstTimer('Archived', { duration: 0, action }), undefined, 'a duration of 0 sets no timer');
  assert.equal(await firstTimer('Saved', { duration: 1000 }), 1000, 'a toast without an action keeps its own duration');
});

test('activating the action runs its handler once, then closes the toast and reports onDismiss once', async (t) => {
  const { manager, active } = await mountProvider(t);
  const calls = [];
  await act(async () => {
    manager().add('Archived', { duration: 60000, onDismiss: () => calls.push('dismiss'), action: { label: 'Undo', onAction: () => calls.push('action') } });
  });
  const toast = document.body.querySelector('.muxui-toast');
  const action = toast.querySelector('.muxui-toast__action');
  // Two activations before React renders again, and one more after.
  await act(async () => {
    action.click();
    action.click();
  });
  await act(async () => action.click());
  assert.deepEqual(calls, ['action', 'dismiss']);
  assert.equal(toast.hasAttribute('data-muxui-toast-exiting'), true, 'the toast leaves through its exit');
  assert.equal(active.size, 0, 'no expiry timer is left running');
});

test('a handler that throws still closes the toast once', async (t) => {
  const { manager } = await mountProvider(t);
  const calls = [];
  await act(async () => {
    manager().add('Archived', { duration: 60000, onDismiss: () => calls.push('dismiss'), action: { label: 'Undo', onAction: () => { calls.push('action'); throw new Error('handler failed'); } } });
  });
  const action = document.body.querySelector('.muxui-toast__action');
  const errors = [];
  const onError = (event) => { event.preventDefault(); errors.push(event.error?.message); };
  window.addEventListener('error', onError);
  try {
    await act(async () => action.click());
  } finally {
    window.removeEventListener('error', onError);
  }
  await act(async () => action.click());
  assert.deepEqual(calls, ['action', 'dismiss']);
  assert.deepEqual(errors, ['handler failed']);
});

test('the dismiss control closes a toast with an action without running it', async (t) => {
  const { manager } = await mountProvider(t);
  const calls = [];
  await act(async () => {
    manager().add('Archived', { duration: 60000, onDismiss: () => calls.push('dismiss'), action: { label: 'Undo', onAction: () => calls.push('action') } });
  });
  const toast = document.body.querySelector('.muxui-toast');
  await act(async () => toast.querySelector('.muxui-toast__dismiss').click());
  await act(async () => toast.querySelector('.muxui-toast__action').click());
  assert.deepEqual(calls, ['dismiss']);
});

test('a declarative Toast updates its action in place, runs the latest handler, and keeps its exit when the handler unmounts it', async (t) => {
  const calls = [];
  let rerender;
  function Parent() {
    const [count, setCount] = React.useState(0);
    const [shown, setShown] = React.useState(true);
    rerender = () => setCount((value) => value + 1);
    if (!shown) return React.createElement('p', { id: 'restored' }, 'Restored');
    // A fresh action object and handler on every render.
    return React.createElement(Toast, {
      message: 'Archived',
      duration: 60000,
      onDismiss: () => calls.push(`dismiss ${count}`),
      action: { label: count < 2 ? 'Undo' : 'Restore', onAction: () => { calls.push(`action ${count}`); setShown(false); } },
    });
  }
  const { delays } = await mountProvider(t, React.createElement(Parent));
  await settle();
  const toast = document.body.querySelector('.muxui-toast');
  assert.equal(delays[0], 60000);
  const timersAfterMount = delays.length;
  const observer = new MutationObserver((records) => mutations.push(...records));
  const mutations = [];
  observer.observe(toast, { childList: true, subtree: true, characterData: true });
  await act(async () => rerender());
  await settle();
  assert.deepEqual(mutations, [], 'the same label renders no change');
  await act(async () => rerender());
  await settle();
  observer.disconnect();
  assert.equal(document.body.querySelector('.muxui-toast'), toast, 'the toast is the same element');
  assert.equal(toast.querySelector('.muxui-toast__action').textContent, 'Restore', 'a new label updates in place');
  assert.equal(toast.querySelector('.muxui-toast__announcer').textContent, 'Restore');
  assert.equal(delays.length, timersAfterMount, 'no toast is enqueued again and the timer is not reset');

  // jsdom runs no exit motion, so the exit may finish at once: watch for the toast to enter it.
  let exited = false;
  const exitObserver = new MutationObserver(() => { exited ||= toast.hasAttribute('data-muxui-toast-exiting'); });
  exitObserver.observe(toast, { attributes: true, attributeFilter: ['data-muxui-toast-exiting'] });
  await act(async () => toast.querySelector('.muxui-toast__action').click());
  await settle();
  exitObserver.disconnect();
  assert.deepEqual(calls, ['action 2', 'dismiss 2']);
  assert.ok(document.querySelector('#restored'));
  assert.equal(exited, true, 'the toast leaves through its exit, not the silent removal an unmount takes');
});

for (const strict of [false, true]) {
  test(`unmounting while the action holds the timers paused leaves no timer and settles nothing${strict ? ' in StrictMode' : ''}`, async (t) => {
    const env = installDom();
    const host = document.querySelector('#root');
    const root = createRoot(host);
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const active = new Set();
    globalThis.setTimeout = (callback, delay, ...args) => {
      const handle = originalSetTimeout(callback, delay, ...args);
      if (delay >= 1000) active.add(handle);
      return handle;
    };
    globalThis.clearTimeout = (handle) => {
      active.delete(handle);
      return originalClearTimeout(handle);
    };
    t.after(async () => {
      for (const handle of active) originalClearTimeout(handle);
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
      env.restore();
    });
    const calls = [];
    let setMounted;
    function Owner() {
      const [mounted, set] = React.useState(true);
      setMounted = set;
      return mounted ? React.createElement(Toast, { message: 'Archived', onDismiss: () => calls.push('dismiss'), action: { label: 'Undo', onAction: () => calls.push('action') } }) : null;
    }
    const wrap = (node) => (strict ? React.createElement(React.StrictMode, null, node) : node);
    for (const teardown of ['toast', 'provider']) {
      await act(async () => root.render(wrap(React.createElement(ToastProvider, { key: teardown }, React.createElement(Owner)))));
      await settle();
      const action = document.body.querySelector('.muxui-toast__action');
      // Focus inside the region pauses every timer, as hover does.
      await act(async () => action.focus());
      assert.equal(document.activeElement, action);
      assert.equal(active.size, 0, `focus on the action pauses the timer before the ${teardown} unmounts`);
      if (teardown === 'toast') await act(async () => setMounted(false));
      else await act(async () => root.render(null));
      await settle();
      await settle();
      assert.equal(active.size, 0, `no timer is left after the ${teardown} unmounts`);
      assert.equal(document.body.querySelector('.muxui-toast'), null, `the toast is gone after the ${teardown} unmounts`);
      assert.deepEqual(calls, [], `the ${teardown} unmount runs no handler and reports no dismissal`);
    }
  });
}

// The queue finishes removing a toast before onDismiss runs, so a toast that onDismiss adds stays, and the dismissed one
// leaves, whichever way it was dismissed.
for (const [path, dismiss] of [
  ['the action', (toast) => toast.querySelector('.muxui-toast__action').click()],
  ['the dismiss control', (toast) => toast.querySelector('.muxui-toast__dismiss').click()],
  ['a timeout', () => new Promise((resolve) => setTimeout(resolve, 1300))],
]) {
  test(`a toast that onDismiss adds after ${path} stays, and onDismiss runs once`, async (t) => {
    const { manager } = await mountProvider(t);
    const calls = [];
    const timed = path === 'a timeout';
    await act(async () => {
      manager().add('Archived', {
        duration: timed ? 1000 : 60000,
        onDismiss: () => {
          calls.push('dismiss');
          manager().add('Restored', { duration: 60000 });
        },
        ...(timed ? {} : { action: { label: 'Undo', onAction: () => calls.push('action') } }),
      });
    });
    const original = document.body.querySelector('.muxui-toast');
    await act(async () => dismiss(original));
    await settle();
    const live = [...document.body.querySelectorAll('.muxui-toast:not([data-muxui-toast-exiting])')].map((node) => node.querySelector('.muxui-toast__message').textContent);
    assert.deepEqual(live, ['Restored'], 'only the added toast is live');
    assert.deepEqual(calls, path === 'the action' ? ['action', 'dismiss'] : ['dismiss'], 'onDismiss runs once, after the action when there is one');
  });
}
