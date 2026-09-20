import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Avatar } from '../src/supplemental/avatar.mjs';
import { Image } from '../src/supplemental/image.mjs';

function installDom(dom) {
  const names = [
    'window', 'document', 'Element', 'HTMLElement', 'HTMLImageElement', 'Node', 'Event',
    'MouseEvent', 'KeyboardEvent', 'MutationObserver',
  ];
  const previous = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  };
}

function imageElement(document) {
  const image = document.querySelector('img.muxui-image');
  assert.ok(image, 'expected a Mux image');
  return image;
}

function avatarRoot(document) {
  const root = document.querySelector('.muxui-avatar');
  assert.ok(root, 'expected an Avatar root');
  return root;
}

test('Image requires alt, preserves native media props, and renders Mux styling hooks', () => {
  assert.throws(
    () => renderToStaticMarkup(React.createElement(Image, { src: '/logo.svg' })),
    /Image requires an alt string/u,
  );

  const html = renderToStaticMarkup(React.createElement(Image, {
    src: '/logo.svg',
    srcSet: '/logo.svg 1x, /logo@2x.svg 2x',
    alt: 'Mux logo',
    width: 160,
    height: 96,
    loading: 'lazy',
    decoding: 'async',
    radius: 'md',
    fit: 'contain',
    className: 'consumer-image',
  }));
  const document = new JSDOM(html).window.document;
  const image = imageElement(document);
  assert.equal(image.getAttribute('alt'), 'Mux logo');
  assert.equal(image.getAttribute('src'), '/logo.svg');
  assert.equal(image.getAttribute('srcset'), '/logo.svg 1x, /logo@2x.svg 2x');
  assert.equal(image.getAttribute('width'), '160');
  assert.equal(image.getAttribute('height'), '96');
  assert.equal(image.getAttribute('loading'), 'lazy');
  assert.equal(image.getAttribute('decoding'), 'async');
  assert.equal(image.className, 'muxui-image muxui-image-radius-md muxui-image--fit-contain consumer-image');

  const decorative = imageElement(new JSDOM(renderToStaticMarkup(React.createElement(Image, {
    src: '/decorative.svg', alt: '',
  }))).window.document);
  assert.equal(decorative.getAttribute('alt'), '');
  assert.equal(decorative.classList.contains('muxui-image--fit-cover'), true);
});

test('Image recovers once, forwards errors and refs, and resets recovery for a new source', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const restore = installDom(dom);
  const rootElement = document.querySelector('#root');
  const ref = React.createRef();
  let errorCount = 0;
  let loadCount = 0;
  let root;
  const render = (props = {}) => React.createElement(Image, {
    src: '/primary.svg',
    fallbackSrc: '/fallback.svg',
    alt: 'Workspace logo',
    width: 32,
    height: 32,
    ref,
    onError: () => { errorCount += 1; },
    onLoad: () => { loadCount += 1; },
    ...props,
  });
  try {
    await act(async () => { root = createRoot(rootElement); root.render(render()); });
    const image = imageElement(document);
    assert.equal(ref.current, image);
    assert.equal(image.getAttribute('src'), '/primary.svg');
    assert.equal(image.hasAttribute('data-fallback'), false);
    assert.equal(image.hasAttribute('data-error'), false);

    await act(async () => { image.dispatchEvent(new Event('error', { bubbles: false })); });
    assert.equal(errorCount, 1);
    assert.equal(imageElement(document).getAttribute('src'), '/fallback.svg');
    assert.equal(imageElement(document).getAttribute('data-fallback'), '');
    assert.equal(imageElement(document).hasAttribute('data-error'), false);

    await act(async () => { imageElement(document).dispatchEvent(new Event('load', { bubbles: false })); });
    assert.equal(loadCount, 1);
    await act(async () => { imageElement(document).dispatchEvent(new Event('error', { bubbles: false })); });
    assert.equal(errorCount, 2);
    assert.equal(imageElement(document).getAttribute('data-error'), '');
    assert.equal(imageElement(document).getAttribute('src'), '/fallback.svg');

    await act(async () => { root.render(render({ src: '/next.svg', fallbackSrc: '/next-fallback.svg' })); });
    assert.equal(imageElement(document).getAttribute('src'), '/next.svg');
    assert.equal(imageElement(document).hasAttribute('data-fallback'), false);
    assert.equal(imageElement(document).hasAttribute('data-error'), false);
    assert.equal(ref.current, imageElement(document));

    await act(async () => { root.render(render()); });
    assert.equal(imageElement(document).getAttribute('src'), '/primary.svg');
    assert.equal(imageElement(document).hasAttribute('data-fallback'), false);
    assert.equal(imageElement(document).hasAttribute('data-error'), false);

    await act(async () => {
      root.render(render({
        src: '/responsive.svg',
        srcSet: '/responsive.svg 1x, /responsive@2x.svg 2x',
        fallbackSrc: undefined,
        fallbackSrcSet: '/responsive-fallback.svg 1x',
      }));
    });
    await act(async () => { imageElement(document).dispatchEvent(new Event('error', { bubbles: false })); });
    assert.equal(imageElement(document).getAttribute('srcset'), '/responsive-fallback.svg 1x');
    assert.equal(imageElement(document).hasAttribute('data-fallback'), true);
    await act(async () => {
      root.render(render({
        src: '/responsive.svg',
        srcSet: '/responsive-next.svg 1x',
        fallbackSrc: undefined,
        fallbackSrcSet: '/responsive-next-fallback.svg 1x',
      }));
    });
    assert.equal(imageElement(document).getAttribute('srcset'), '/responsive-next.svg 1x');
    assert.equal(imageElement(document).hasAttribute('data-fallback'), false);
    assert.equal(imageElement(document).hasAttribute('data-error'), false);
  } finally {
    await act(async () => root?.unmount());
    restore();
  }
});

test('Avatar supports fallback-only content and avoids duplicate accessible names', () => {
  const fallbackOnly = new JSDOM(renderToStaticMarkup(React.createElement(
    Avatar.Root,
    { size: 'sm' },
    React.createElement(Avatar.Fallback, null, React.createElement('strong', null, 'WS')),
  ))).window.document;
  const fallback = avatarRoot(fallbackOnly).querySelector('.muxui-avatar__fallback');
  assert.equal(avatarRoot(fallbackOnly).dataset.imageState, 'fallback');
  assert.equal(fallback.hidden, false);
  assert.equal(fallback.textContent, 'WS');
  assert.equal(fallback.getAttribute('aria-hidden'), null);

  const named = new JSDOM(renderToStaticMarkup(React.createElement(
    Avatar.Root,
    { size: 'lg', 'aria-label': 'Workspace avatar' },
    React.createElement(Avatar.Image, { src: '/avatar.svg', alt: 'Workspace avatar' }),
    React.createElement(Avatar.Fallback, null, 'WS'),
  ))).window.document;
  const namedRoot = avatarRoot(named);
  const namedImage = namedRoot.querySelector('.muxui-avatar__image');
  assert.equal(namedRoot.getAttribute('role'), 'img');
  assert.equal(namedRoot.getAttribute('aria-label'), 'Workspace avatar');
  assert.equal(namedImage.getAttribute('aria-hidden'), 'true');
  assert.equal(namedRoot.querySelector('.muxui-avatar__fallback').getAttribute('aria-hidden'), 'true');
});

test('Avatar accepts fragments, treats unavailable sources as fallback, and rejects opaque wrappers', () => {
  const fragmented = new JSDOM(renderToStaticMarkup(React.createElement(
    Avatar.Root,
    null,
    React.createElement(React.Fragment, null,
      React.createElement(Avatar.Image, { src: '/avatar.svg', alt: 'Alex avatar' }),
      React.createElement(Avatar.Fallback, null, 'AX'),
    ),
  ))).window.document;
  assert.equal(avatarRoot(fragmented).querySelector('.muxui-avatar__image').hidden, false);
  assert.equal(avatarRoot(fragmented).querySelector('.muxui-avatar__fallback').hidden, true);

  const unavailable = new JSDOM(renderToStaticMarkup(React.createElement(
    Avatar.Root,
    null,
    React.createElement(Avatar.Image, { alt: 'Alex avatar' }),
    React.createElement(Avatar.Fallback, null, 'AX'),
  ))).window.document;
  const unavailableRoot = avatarRoot(unavailable);
  assert.equal(unavailableRoot.dataset.imageState, 'fallback');
  assert.equal(unavailableRoot.getAttribute('role'), 'img');
  assert.equal(unavailableRoot.getAttribute('aria-label'), 'Alex avatar');
  assert.equal(unavailableRoot.querySelector('.muxui-avatar__image').hidden, true);
  assert.equal(unavailableRoot.querySelector('.muxui-avatar__fallback').hidden, false);
  assert.equal(unavailableRoot.querySelector('.muxui-avatar__fallback').getAttribute('aria-hidden'), 'true');

  const decorativeUnavailable = new JSDOM(renderToStaticMarkup(React.createElement(
    Avatar.Root,
    null,
    React.createElement(Avatar.Image, { src: '  ', srcSet: '', alt: '' }),
    React.createElement(Avatar.Fallback, null, 'AX'),
  ))).window.document;
  const decorativeRoot = avatarRoot(decorativeUnavailable);
  assert.equal(decorativeRoot.getAttribute('role'), null);
  assert.equal(decorativeRoot.getAttribute('aria-label'), null);
  assert.equal(decorativeRoot.querySelector('.muxui-avatar__fallback').getAttribute('aria-hidden'), 'true');

  function OpaqueImageWrapper() {
    return React.createElement(Avatar.Image, { src: '/avatar.svg', alt: 'Alex avatar' });
  }
  assert.throws(
    () => renderToStaticMarkup(React.createElement(
      Avatar.Root,
      null,
      React.createElement(OpaqueImageWrapper),
      React.createElement(Avatar.Fallback, null, 'AX'),
    )),
    /direct children or fragment children/u,
  );
});

test('Avatar keeps a decorative fallback out of the accessibility tree after an image error', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const restore = installDom(dom);
  const rootElement = document.querySelector('#root');
  let root;
  try {
    await act(async () => {
      root = createRoot(rootElement);
      root.render(React.createElement(
        Avatar.Root,
        null,
        React.createElement(Avatar.Image, { src: '/decorative.svg', alt: '' }),
        React.createElement(Avatar.Fallback, null, 'AX'),
      ));
    });
    const image = avatarRoot(document).querySelector('.muxui-avatar__image');
    await act(async () => { image.dispatchEvent(new Event('error', { bubbles: false })); });
    const avatar = avatarRoot(document);
    assert.equal(avatar.dataset.imageState, 'error');
    assert.equal(image.hidden, true);
    assert.equal(avatar.querySelector('.muxui-avatar__fallback').hidden, false);
    assert.equal(avatar.querySelector('.muxui-avatar__fallback').getAttribute('aria-hidden'), 'true');
    assert.equal(avatar.getAttribute('role'), null);
    assert.equal(avatar.getAttribute('aria-label'), null);
  } finally {
    await act(async () => root?.unmount());
    restore();
  }
});

test('Avatar swaps image and fallback states, forwards refs, and recovers on source changes', async () => {
  const server = renderToString(React.createElement(
    Avatar.Root,
    { size: 'md' },
    React.createElement(Avatar.Image, { src: '/avatar.svg', alt: 'Alex avatar' }),
    React.createElement(Avatar.Fallback, null, 'AX'),
  ));
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`, { url: 'http://localhost/' });
  const restore = installDom(dom);
  const rootElement = document.querySelector('#root');
  const rootRef = React.createRef();
  const imageRef = React.createRef();
  let errorCount = 0;
  let loadCount = 0;
  let root;
  const render = (src = '/avatar.svg') => React.createElement(
    Avatar.Root,
    { size: 'md', ref: rootRef },
    React.createElement(Avatar.Image, {
      ref: imageRef,
      src,
      alt: 'Alex avatar',
      onError: () => { errorCount += 1; },
      onLoad: () => { loadCount += 1; },
    }),
    React.createElement(Avatar.Fallback, null, 'AX'),
  );
  try {
    await act(async () => { root = hydrateRoot(rootElement, render()); });
    const avatar = avatarRoot(document);
    assert.equal(rootRef.current, avatar);
    assert.equal(imageRef.current, avatar.querySelector('.muxui-avatar__image'));
    assert.equal(avatar.dataset.imageState, 'loading');
    assert.equal(imageRef.current.hidden, false);
    assert.equal(avatar.querySelector('.muxui-avatar__fallback').hidden, true);
    assert.equal(avatar.getAttribute('role'), null);

    await act(async () => { imageRef.current.dispatchEvent(new Event('error', { bubbles: false })); });
    assert.equal(errorCount, 1);
    assert.equal(avatarRoot(document).dataset.imageState, 'error');
    assert.equal(imageRef.current.hidden, true);
    assert.equal(avatarRoot(document).getAttribute('role'), 'img');
    assert.equal(avatarRoot(document).getAttribute('aria-label'), 'Alex avatar');
    assert.equal(avatarRoot(document).querySelector('.muxui-avatar__fallback').hidden, false);
    assert.equal(avatarRoot(document).querySelector('.muxui-avatar__fallback').getAttribute('aria-hidden'), 'true');

    await act(async () => { root.render(render('/new-avatar.svg')); });
    assert.equal(avatarRoot(document).dataset.imageState, 'loading');
    assert.equal(imageRef.current.getAttribute('src'), '/new-avatar.svg');
    assert.equal(imageRef.current.hidden, false);
    assert.equal(avatarRoot(document).querySelector('.muxui-avatar__fallback').hidden, true);
    assert.equal(avatarRoot(document).getAttribute('role'), null);
    assert.equal(avatarRoot(document).getAttribute('aria-label'), null);

    await act(async () => { root.render(render('/avatar.svg')); });
    assert.equal(avatarRoot(document).dataset.imageState, 'loading');
    assert.equal(imageRef.current.getAttribute('src'), '/avatar.svg');
    assert.equal(imageRef.current.hidden, false);
    assert.equal(avatarRoot(document).querySelector('.muxui-avatar__fallback').hidden, true);
    assert.equal(avatarRoot(document).getAttribute('role'), null);
    assert.equal(avatarRoot(document).getAttribute('aria-label'), null);

    await act(async () => { root.render(render('/new-avatar.svg')); });
    assert.equal(avatarRoot(document).dataset.imageState, 'loading');
    assert.equal(imageRef.current.getAttribute('src'), '/new-avatar.svg');
    assert.equal(imageRef.current.hidden, false);

    await act(async () => { imageRef.current.dispatchEvent(new Event('load', { bubbles: false })); });
    assert.equal(loadCount, 1);
    assert.equal(avatarRoot(document).dataset.imageState, 'loaded');
  } finally {
    await act(async () => root?.unmount());
    restore();
  }
});

test('native image errors before hydration recover without replaying callbacks', async () => {
  const server = renderToString(React.createElement(Image, {
    src: '/missing.svg',
    fallbackSrc: '/fallback.svg',
    alt: 'Workspace logo',
  }));
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`, { url: 'http://localhost/' });
  const restore = installDom(dom);
  const image = document.querySelector('.muxui-image');
  const rootElement = document.querySelector('#root');
  let errorCount = 0;
  let loadCount = 0;
  let root;
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  Object.defineProperty(image, 'naturalWidth', {
    configurable: true,
    get: () => image.getAttribute('src') === '/fallback.svg' ? 16 : 0,
  });
  try {
    await act(async () => {
      root = hydrateRoot(rootElement, React.createElement(Image, {
        src: '/missing.svg',
        fallbackSrc: '/fallback.svg',
        alt: 'Workspace logo',
        onError: () => { errorCount += 1; },
        onLoad: () => { loadCount += 1; },
      }));
    });
    assert.equal(image.getAttribute('src'), '/fallback.svg');
    assert.equal(image.hasAttribute('data-fallback'), true);
    assert.equal(image.hasAttribute('data-error'), false);
    assert.equal(errorCount, 0);
    assert.equal(loadCount, 0);
  } finally {
    await act(async () => root?.unmount());
    restore();
  }
});
