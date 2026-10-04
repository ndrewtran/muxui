import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const slugs = ['autocomplete', 'checkbox-group', 'date-field', 'date-picker', 'date-range-picker', 'form', 'number-field', 'search-field', 'switch', 'text-field', 'time-field'];
const events = new Map([
  ['change', 'onChange'], ['select', 'onSelect'], ['openChange', 'onOpenChange'],
  ['submit', 'onSubmit'], ['reset', 'onReset'], ['clear', 'onClear'],
]);
// Native attributes that reach the rendered element through the rest spread.
const restProps = new Map([
  ['Form', ['method', 'action']],
  ['SearchField', ['id']],
  ['TextField', ['id']],
]);

function componentName(slug) {
  return slug.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

function propPattern(prop) {
  if (prop.startsWith('aria-')) return new RegExp(`['"]${prop}['"]`, 'u');
  return new RegExp(`\\b${prop}\\b`, 'u');
}

test('R1.2 artifact declarations have a generated MuxUI type and runtime surface', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const [types, runtime] = await Promise.all([
    readFile(resolve(import.meta.dirname, '../generated/index.d.ts'), 'utf8'),
    readFile(resolve(import.meta.dirname, '../src/fields.mjs'), 'utf8'),
  ]);
  for (const slug of slugs) {
    const name = componentName(slug);
    const artifact = JSON.parse(await readFile(resolve(repositoryRoot, `catalog/components/${slug}/artifact.json`), 'utf8'));
    const api = artifact.bindings['web.react'].api;
    const typeStart = types.search(new RegExp(`export (?:interface|type) ${name}Props\\b`, 'u'));
    assert.notEqual(typeStart, -1, `${name}Props is missing from generated public types`);
    const typeEnd = types.indexOf('export declare const', typeStart);
    let typeSurface = types.slice(typeStart, typeEnd === -1 ? undefined : typeEnd);
    for (const inherited of ['DateFieldProps', 'NamedFieldProps', 'FieldValidationProps', 'MuxUIAccessibleName']) {
      if (!typeSurface.includes(inherited)) continue;
      const inheritedStart = types.search(new RegExp(`export (?:interface|type) ${inherited}\\b`, 'u'));
      const inheritedEnd = types.indexOf('\nexport ', inheritedStart + inherited.length);
      if (inheritedStart !== -1) typeSurface += types.slice(inheritedStart, inheritedEnd === -1 ? undefined : inheritedEnd);
    }
    const runtimeStart = runtime.indexOf(`export const ${name} `);
    assert.notEqual(runtimeStart, -1, `${name} runtime export is missing`);
    const runtimeNext = runtime.indexOf('\nexport const ', runtimeStart + 1);
    const runtimeSurface = runtime.slice(runtimeStart, runtimeNext === -1 ? undefined : runtimeNext);
    const forwardedByRest = restProps.get(name) ?? [];
    for (const prop of api.props) {
      const inheritsHtml = forwardedByRest.includes(prop) && /React\.\w+HTMLAttributes</u.test(typeSurface);
      if (!inheritsHtml) assert.match(typeSurface, propPattern(prop), `${name}.${prop} is missing from generated type surface`);
      if (forwardedByRest.includes(prop)) {
        assert.match(runtimeSurface, /\.\.\.props\b/u, `${name}.${prop} needs the rest spread`);
        continue;
      }
      assert.match(runtimeSurface, propPattern(prop), `${name}.${prop} is missing from runtime surface`);
    }
    for (const event of api.events) {
      const callback = events.get(event);
      assert.ok(callback, `${name}.${event} needs a MuxUI callback mapping`);
      assert.match(typeSurface, propPattern(callback), `${name}.${callback} is missing from generated type surface`);
      assert.match(runtimeSurface, propPattern(callback), `${name}.${callback} is missing from runtime surface`);
    }
  }
});
