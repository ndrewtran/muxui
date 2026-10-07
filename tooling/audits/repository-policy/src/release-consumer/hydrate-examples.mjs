// Client half of the packed SSR/hydration proof. Run from a clean consumer:
// `node hydrate-examples.mjs <server-result.json> <result.json> <jsdom-url>`. Installs a
// jsdom window before React DOM or Mux UI load, then hydrates each server
// render and records recoverable errors and hydration warnings, plus how many
// `role="row"` elements the server markup and the hydrated tree hold. A render
// with `measuredLayout` hydrates under a measured layout (below), so virtualized
// content mounts the way it does in a browser. Exits 3 for a hydration mismatch;
// any other non-zero exit is a failure of the script itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { format } from 'node:util';

// jsdom comes from the release tooling so the consumer keeps only the packed runtime graph.
const [serverResultPath, resultPath, jsdomUrl] = process.argv.slice(2);
const { JSDOM } = await import(jsdomUrl);
const { renders } = JSON.parse(readFileSync(serverResultPath, 'utf8'));

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
window.matchMedia ??= (media) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
window.Element.prototype.scrollTo ??= () => {};
window.Element.prototype.scrollIntoView ??= () => {};
// jsdom lays nothing out, so a virtualizer sees a 0x0 scroller and mounts no rows.
// Under `measuredLayout`, every element reports this box and each ResizeObserver
// reports it on `observe`, the way a browser does after its first layout.
const measuredBox = { width: 1000, height: 480 };
const measuredRect = { x: 0, y: 0, left: 0, top: 0, right: measuredBox.width, bottom: measuredBox.height, ...measuredBox };
class MeasuredResizeObserver {
  #callback;
  #targets = new Set();
  constructor(callback) { this.#callback = callback; }
  observe(target) {
    this.#targets.add(target);
    queueMicrotask(() => {
      if (!this.#targets.has(target)) return;
      const size = [{ inlineSize: measuredBox.width, blockSize: measuredBox.height }];
      this.#callback([{ target, contentRect: measuredRect, borderBoxSize: size, contentBoxSize: size }], this);
    });
  }
  unobserve(target) { this.#targets.delete(target); }
  disconnect() { this.#targets.clear(); }
}
const measuredProperties = {
  clientWidth: { get: () => measuredBox.width },
  clientHeight: { get: () => measuredBox.height },
  scrollWidth: { get: () => measuredBox.width },
  scrollHeight: { get: () => measuredBox.height },
  getBoundingClientRect: { value: () => measuredRect },
};
const unmeasuredResizeObserver = window.ResizeObserver;
function setMeasuredLayout(measured) {
  globalThis.ResizeObserver = window.ResizeObserver = measured ? MeasuredResizeObserver : unmeasuredResizeObserver;
  for (const [property, descriptor] of Object.entries(measuredProperties)) {
    if (measured) Object.defineProperty(window.HTMLElement.prototype, property, { configurable: true, ...descriptor });
    else delete window.HTMLElement.prototype[property];
  }
}

const names = [
  'window', 'document', 'navigator', 'Document', 'DocumentFragment', 'Element', 'Node', 'NodeFilter', 'Text', 'Range', 'Selection',
  'Event', 'CustomEvent', 'UIEvent', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'PointerEvent',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'FormData', 'DOMRect', 'CSS', 'getComputedStyle', 'matchMedia',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getSelection', 'File', 'FileList', 'Blob', 'DataTransfer',
  ...Object.getOwnPropertyNames(window).filter((name) => /^(?:HTML|SVG)\w*Element$/u.test(name)),
];
for (const name of names) {
  if (window[name] !== undefined) Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { act } = await import('react');
const { hydrateRoot } = await import('react-dom/client');

const hydrationPattern = /hydrat|did not match|server rendered|server html|mismatch/iu;
const results = [];
const scriptFailures = [];
const originalError = console.error;
const rowSelector = '[role="row"]';
for (const { id, file, name, html, measuredLayout } of renders) {
  const module = await import(pathToFileURL(resolve(file)).href);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const serverRows = container.querySelectorAll(rowSelector).length;
  let hydratedRows = 0;
  setMeasuredLayout(Boolean(measuredLayout));
  const recoverable = [];
  const consoleErrors = [];
  console.error = (...args) => { consoleErrors.push(format(...args)); };
  let root;
  try {
    await act(async () => {
      root = hydrateRoot(container, React.createElement(module[name]), {
        onRecoverableError: (error) => recoverable.push(String(error?.message ?? error)),
        onUncaughtError: (error) => scriptFailures.push(`${id}: uncaught ${error?.stack ?? error}`),
      });
    });
    await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    hydratedRows = container.querySelectorAll(rowSelector).length;
    await act(async () => { root.unmount(); });
  } catch (error) {
    scriptFailures.push(`${id}: thrown ${error?.stack ?? error}`);
  } finally {
    console.error = originalError;
    setMeasuredLayout(false);
    container.remove();
  }
  results.push({
    id,
    serverRows,
    hydratedRows,
    hydrationErrors: [...recoverable, ...consoleErrors.filter((message) => hydrationPattern.test(message))],
    consoleErrors: consoleErrors.filter((message) => !hydrationPattern.test(message)).map((message) => message.split('\n', 1)[0]),
  });
}
writeFileSync(resultPath, `${JSON.stringify({ results })}\n`);
window.close();
if (scriptFailures.length !== 0) {
  console.error(scriptFailures.join('\n'));
  process.exit(2);
}
const failed = results.filter(({ hydrationErrors }) => hydrationErrors.length !== 0);
if (failed.length !== 0) {
  console.error(failed.map(({ id, hydrationErrors }) => `${id}: ${hydrationErrors[0].split('\n', 1)[0]}`).join('\n'));
  process.exit(3);
}
