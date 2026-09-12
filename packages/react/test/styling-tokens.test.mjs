import assert from 'node:assert/strict';
import { glob, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compilePureTokenGraph, cssName } from '@muxui/tokens/core';

const packageRoot = resolve(import.meta.dirname, '..');
const source = JSON.parse(await readFile(resolve(packageRoot, '../../catalog/tokens/default-theme.json'), 'utf8'));
const tokenIds = new Map(Object.keys(source.tokens).map((id) => [cssName(id), id]));
const styles = [];
for await (const path of glob('src/**/*.css', { cwd: packageRoot })) {
  styles.push({ path, css: await readFile(resolve(packageRoot, path), 'utf8') });
}

test('all authored component styles resolve design tokens through semantic or component roles', () => {
  const failures = [];
  for (const { path, css } of styles) {
    const localHooks = new Set([...css.matchAll(/(--muxui-component-[\w-]+)\s*:/gu)].map(([, name]) => name));
    for (const [match, variable, fallback] of css.matchAll(/var\((--muxui-(?:reference|semantic|component)-[\w-]+)(\s*,)?/gu)) {
      // Renderer-owned geometry hooks may be locally defined or expose a fallback;
      // semantic token references must always exist in the canonical theme.
      const geometryHook = variable.startsWith('--muxui-component-') && (localHooks.has(variable) || fallback);
      if (!tokenIds.has(variable) && !geometryHook) failures.push(`${path}: unknown ${match}`);
      if (variable.startsWith('--muxui-reference-')) failures.push(`${path}: reference-layer styling ${match}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('component spacing declarations keep gaps separate from padding and geometry', () => {
  const failures = [];
  for (const { path, css } of styles) {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
    for (const [, property, value] of withoutComments.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/gu)) {
      const refs = [...value.matchAll(/var\((--muxui-(?:semantic|component)-[\w-]+)/gu)].map(([, name]) => name);
      for (const ref of refs) {
        const switchLabelGap = property === 'padding-inline-start' && value.includes('--muxui-component-switch-track-width');
        if (!switchLabelGap && (/^padding(?:-|$)/u.test(property) || /padding|inset/u.test(property) || /^(?:top|right|bottom|left|(?:min-|max-)?(?:width|height|inline-size|block-size)|inset(?:-.+)?)$/u.test(property)) && /-gap$/u.test(ref)) {
          failures.push(`${path}: ${property} must not borrow ${ref}`);
        }
        if (/(?:^|-)gap$/u.test(property) && /(?:padding|inset|radius|typography)/u.test(ref)) {
          failures.push(`${path}: ${property} must not borrow ${ref}`);
        }
        if (/^margin(?:-|$)/u.test(property) && /(?:padding|inset|radius)/u.test(ref)) {
          failures.push(`${path}: ${property} must not borrow ${ref}`);
        }
        if (property.includes('radius') && /(?:layout|padding|typography)/u.test(ref)) {
          failures.push(`${path}: ${property} must not borrow ${ref}`);
        }
        // Size calculations may include padding or viewport clearance, but an
        // inset alone must not stand in for an indicator's width or height.
        if (/^(?:min-|max-)?(?:width|height|inline-size|block-size)$/u.test(property) && /(?:padding|inset)/u.test(ref) && !value.includes('calc(')) {
          failures.push(`${path}: ${property} must use a size role instead of ${ref}`);
        }
        if (/background|border|outline|box-shadow/u.test(property) && ref.startsWith('--muxui-semantic-content-')) {
          failures.push(`${path}: ${property} must use a surface, border, selection, or focus role instead of ${ref}`);
        }
        if ((property === 'color' || property.endsWith('foreground')) && /--muxui-semantic-(?:surface-|border-|feedback-invalid-border$)/u.test(ref)) {
          failures.push(`${path}: ${property} must use a foreground role instead of ${ref}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('semantic styling roles compile across all declared mode combinations', () => {
  const combinations = Object.entries(source.theme.modeAxes).reduce((rows, [axis, values]) =>
    rows.flatMap((row) => values.map((value) => ({ ...row, [axis]: value }))), [{}]);
  for (const modes of combinations) {
    const graph = compilePureTokenGraph(source, { modes });
    assert.equal(Object.keys(graph.tokens).length, Object.keys(source.tokens).length);
  }
});
