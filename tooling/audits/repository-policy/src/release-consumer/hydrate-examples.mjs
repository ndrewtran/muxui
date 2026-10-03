// Client half of the packed SSR/hydration proof. Run from a clean consumer:
// `node hydrate-examples.mjs <server-result.json> <result.json> <jsdom-url>`. Installs a
// jsdom window before React DOM or Mux UI load, then hydrates each server
// render and records recoverable errors and hydration warnings.
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
const originalError = console.error;
for (const { id, file, name, html } of renders) {
  const module = await import(pathToFileURL(resolve(file)).href);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const recoverable = [];
  const consoleErrors = [];
  console.error = (...args) => { consoleErrors.push(format(...args)); };
  let root;
  try {
    await act(async () => {
      root = hydrateRoot(container, React.createElement(module[name]), {
        onRecoverableError: (error) => recoverable.push(String(error?.message ?? error)),
        onUncaughtError: (error) => recoverable.push(`uncaught: ${error?.message ?? error}`),
      });
    });
    await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    await act(async () => { root.unmount(); });
  } catch (error) {
    recoverable.push(`thrown: ${error?.message ?? error}`);
  } finally {
    console.error = originalError;
    container.remove();
  }
  results.push({
    id,
    hydrationErrors: [...recoverable, ...consoleErrors.filter((message) => hydrationPattern.test(message))],
    consoleErrors: consoleErrors.filter((message) => !hydrationPattern.test(message)).map((message) => message.split('\n', 1)[0]),
  });
}
writeFileSync(resultPath, `${JSON.stringify({ results })}\n`);
window.close();
const failed = results.filter(({ hydrationErrors }) => hydrationErrors.length !== 0);
if (failed.length !== 0) {
  console.error(failed.map(({ id, hydrationErrors }) => `${id}: ${hydrationErrors[0].split('\n', 1)[0]}`).join('\n'));
  process.exit(1);
}
