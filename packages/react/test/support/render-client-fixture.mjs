// A client fixture of support/styling-fixtures.mjs, rendered in a fresh jsdom window and driven by its steps the way a user would. The
// emission test looks for the part map's rows in it and holds its markup to the class rules; the host-independence guard places the
// markup it ends in on a real page. React DOM is imported here, before the DOM exists, as in the package's own tests, so it reads the
// changed value of a field on a key event.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createDom } from './dom.mjs';

export const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

/** jsdom has no layout: every element reports the size, and the observer reports it as soon as it observes a target. */
function sizeLayout(window, { width, height }) {
  for (const [name, value] of [['offsetHeight', height], ['offsetWidth', width], ['clientHeight', height], ['clientWidth', width], ['scrollHeight', height * 10]]) {
    Object.defineProperty(window.HTMLElement.prototype, name, { configurable: true, get: () => value });
  }
  class SizedObserver {
    constructor(callback) { this.callback = callback; }
    // Asynchronous, so the virtualizer is not asked to flush inside the lifecycle that started the observation.
    observe(target) { setTimeout(() => this.callback([{ target, contentRect: { width, height }, borderBoxSize: [{ inlineSize: width, blockSize: height }] }], this), 0); }
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = SizedObserver;
  globalThis.ResizeObserver = SizedObserver;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON() {} });
}

/**
 * Renders `fixture.element(lib)`, runs its steps, and calls `observe(document)` after the render and after each step (an overlay
 * closes, a toast leaves). A console error is returned in `errors`, never swallowed. `html` is the markup of the container after the last step
 * (portaled parts are outside it).
 * @returns {Promise<{ errors: string[], html: string }>}
 */
export async function renderClientFixture({ element, steps = [], layout }, lib, observe = () => {}) {
  // The harness's container is the caller's element, like the elements the fixtures' `h` creates.
  const { dom, restore } = createDom('<div id="root" data-caller=""></div>', { layoutStubs: true });
  const { window } = dom;
  const { document } = window;
  const errors = [];
  let html = '';
  const consoleError = console.error;
  console.error = (...messages) => errors.push(String(messages[0]).slice(0, 160));
  if (layout) sizeLayout(window, layout);
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(element(lib)));
    await act(async () => sleep(40));
    observe(document);
    for (const step of steps) {
      await act(async () => { await step({ window, document, sleep }); });
      await act(async () => sleep(60));
      observe(document);
    }
    html = document.getElementById('root').innerHTML;
  } catch (error) {
    errors.push(`threw: ${String(error?.message ?? error).slice(0, 160)}`);
  } finally {
    console.error = consoleError;
    try { await act(async () => root.unmount()); } catch { /* unmounting is not what is being proven */ }
    await sleep(30);
    restore();
  }
  return { errors, html };
}
