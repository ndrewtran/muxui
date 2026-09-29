import { JSDOM } from 'jsdom';

// Window properties every React DOM test exposes as globals, alongside every
// HTML*/SVG* element interface the window defines.
const sharedGlobals = [
  'window', 'document', 'Document', 'DocumentFragment', 'Element', 'Node', 'NodeFilter',
  'Event', 'CustomEvent', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'PointerEvent',
  'MutationObserver', 'FormData', 'DOMRect', 'CSS', 'getComputedStyle',
];

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function matchMediaStub() {
  return {
    matches: false,
    media: '',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  };
}

/**
 * Makes a JSDOM window the global browser environment for a React test and
 * returns `restore()`, which puts back every replaced global and closes the window.
 *
 * `globals` exposes extra window properties, such as `File` or `Blob`, that
 * would otherwise keep their Node implementations. `layoutStubs` adds inert
 * `ResizeObserver` and `matchMedia` for positioning code that jsdom lacks.
 */
export function installDom(dom, { globals = [], layoutStubs = false } = {}) {
  const { window } = dom;
  if (layoutStubs) {
    window.ResizeObserver = ResizeObserverStub;
    window.matchMedia ??= matchMediaStub;
  }
  const elementInterfaces = Object.getOwnPropertyNames(window).filter((name) => /^(?:HTML|SVG)\w*Element$/u.test(name));
  const names = [...new Set([...sharedGlobals, ...elementInterfaces, ...globals, ...(layoutStubs ? ['ResizeObserver'] : [])])];
  const touched = [...names, 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(touched.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

  for (const name of names) if (window[name] !== undefined) globalThis[name] = window[name];
  // jsdom only animates frames with `pretendToBeVisual`; otherwise frames become
  // window timers, which closing the window cancels.
  window.requestAnimationFrame ??= (callback) => window.setTimeout(callback, 0);
  window.cancelAnimationFrame ??= (handle) => window.clearTimeout(handle);
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  // React Aria probes these legacy and scrolling hooks, which jsdom omits.
  const elementPrototype = window.Element.prototype;
  elementPrototype.scrollTo ??= () => {};
  elementPrototype.attachEvent ??= () => {};
  elementPrototype.detachEvent ??= () => {};

  return function restore() {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    window.close();
  };
}

/** Parses `markup` into a fresh document at http://localhost/ and installs it. */
export function createDom(markup = '<div id="root"></div>', options) {
  const dom = new JSDOM(`<!doctype html>${markup}`, { url: 'http://localhost/' });
  return { dom, restore: installDom(dom, options) };
}
