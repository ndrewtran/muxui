import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { webCompatibility, webSurfaces } from '../src/index.mjs';
import { compileWebSurface } from '../src/compile-surface.mjs';
import { catalogJson } from '@muxui/catalog/bundle';

const bundle = JSON.parse(catalogJson);
const button = bundle.artifacts.find(({ id }) => id === 'muxui:component:button');
const tokenSource = bundle.artifacts.find(({ id }) => id === 'muxui:token:default-theme').record;

test('E-G1.1-02 machine-enumerates only binding and token-policy derived hooks', () => {
  const html = webSurfaces['web.html'].surface;
  const react = webSurfaces['web.react'].surface;
  for (const surface of [html, react]) {
    assert.equal(surface.rootClass, '.muxui-button');
    assert.deepEqual(surface.slots, ['[data-muxui-slot="label"]']);
    assert.deepEqual(surface.states, surface === html
      ? ['data-muxui-state-disabled']
      : ['data-muxui-state-disabled', 'data-muxui-state-pending']);
    assert.deepEqual(surface.events, ['muxui:activate']);
    assert.deepEqual(surface.publicCustomProperties, [
      '--muxui-component-button-background',
      '--muxui-component-button-foreground',
    ]);
    assert.deepEqual(surface.cascadeLayers, ['muxui.tokens', 'muxui.components', 'muxui.utilities']);
    assert.equal(surface.styleExport, '@muxui/web/button.css');
    assert.ok(!JSON.stringify(surface).includes('wrapper'));
  }
  assert.deepEqual(
    (({ bindingRef, bindingSpecRevision, states, ...surface }) => surface)(html),
    (({ bindingRef, bindingSpecRevision, states, ...surface }) => surface)(react),
  );
  assert.equal(webCompatibility.bindings['web.html'].lifecycle, 'experimental');
  assert.equal(webCompatibility.bindings['web.react'].lifecycle, 'experimental');
  assert.deepEqual(button.record.bindings['web.html'].api.props, ['disabled']);
  assert.deepEqual(button.record.bindings['web.react'].api.props, ['disabled', 'pending', 'variant', 'tone', 'size']);
  assert.doesNotMatch(JSON.stringify(html), /pending|variant|tone|size/u);
  assert.match(JSON.stringify(react), /pending/u);
});

test('E-G1.1-02 framework-free web output does not inherit React-only props', async () => {
  const bindings = await readFile(new URL('../generated/bindings.d.ts', import.meta.url), 'utf8');
  const stylesheet = await readFile(new URL('../generated/button.css', import.meta.url), 'utf8');
  const [htmlTypes, reactTypes] = bindings.split('\n\n');
  assert.doesNotMatch(htmlTypes, /pending|variant|tone|size/u);
  for (const prop of ['pending', 'variant', 'tone', 'size']) assert.match(reactTypes, new RegExp(prop, 'u'));
  assert.doesNotMatch(stylesheet, /pending/u);
});

test('E-G1.1-02 refuses nonexistent exports and non-component identities', () => {
  assert.throws(
    () => compileWebSurface({ artifact: button, bindingId: 'web.html', packageExports: [], tokenSource }),
    /MUXUI_WEB_SURFACE_EXPORT_MISSING/,
  );
  assert.throws(
    () => compileWebSurface({
      artifact: { ...button, id: 'muxui:guide:button' },
      bindingId: 'web.html',
      packageExports: ['./button.css'],
      tokenSource,
    }),
    /MUXUI_WEB_SURFACE_ARTIFACT_INVALID/,
  );
});
