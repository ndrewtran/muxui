import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import { build } from 'vite';

const packageRoot = resolve(import.meta.dirname, '..');
const generated = resolve(packageRoot, 'generated');

// Disclosure is the one component in components.ts wrapped in a pure-annotated function. A plain
// forwardRef followed by `displayName = ...` is kept by a bundler even when nothing uses it, and
// would pull in Disclosure's motion modules for a consumer that imports another component.
test('tsc keeps the pure annotation on Disclosure\'s wrapper', () => {
  const emitted = readFileSync(resolve(generated, 'components.js'), 'utf8');
  assert.match(emitted, /^export const Disclosure = \/\*#__PURE__\*\/ \(\(\) => \{$/mu);
});

/** The package modules a bundle of `import { <name> } from <module>` keeps, as paths under generated/. */
async function bundledModules(name, module = 'components.js') {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const directory = mkdtempSync(join(packageRoot, 'build', 'tree-shaking-'));
  try {
    const entry = join(directory, 'entry.mjs');
    writeFileSync(entry, `export { ${name} } from '${relative(directory, resolve(generated, module)).replaceAll('\\', '/')}';\n`);
    const bundle = await build({
      root: directory,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ['es'], fileName: 'bundle' },
        // Packages are not under test: only which of the package's own modules the bundle keeps.
        rollupOptions: { external: [/^[^./]/u] },
      },
    });
    return [bundle].flat().flatMap(({ output }) => output)
      .filter(({ type }) => type === 'chunk')
      .flatMap(({ modules }) => Object.entries(modules))
      .filter(([, { renderedLength }]) => renderedLength > 0)
      .map(([id]) => relative(generated, id).replaceAll('\\', '/'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a bundle that uses another component from components.js drops Disclosure and its motion modules', async () => {
  // The package marks only its stylesheets as side effects, so an unused module is dropped whole.
  assert.deepEqual(JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')).sideEffects, ['*.css']);
  const separatorOnly = await bundledModules('Separator');
  assert.ok(separatorOnly.includes('components.js'));
  assert.equal(separatorOnly.includes('motion-components.mjs'), false);
  // The control: using Disclosure keeps the motion module its panel needs.
  const withDisclosure = await bundledModules('Disclosure');
  assert.ok(withDisclosure.includes('components.js') && withDisclosure.includes('motion-components.mjs'));
});

// Dialog (a pure-annotated wrapper) and Popover (a pure-annotated forwardRef) are the two overlays
// whose motion modules only they need. Without the annotation, a bundler keeps both whenever any
// overlay is imported, for the same reason as Disclosure above.
test('tsc keeps the pure annotation on Dialog\'s wrapper and Popover\'s forwardRef', () => {
  const emitted = readFileSync(resolve(generated, 'overlays.js'), 'utf8');
  assert.match(emitted, /^export const Dialog = \/\*#__PURE__\*\/ \(\(\) => \{$/mu);
  assert.match(emitted, /^export const Popover = \/\*#__PURE__\*\/ React\.forwardRef\(/mu);
  assert.match(emitted, /^const PopupContent = \/\*#__PURE__\*\/ React\.forwardRef\(/mu);
});

test('a bundle that uses another overlay drops Dialog, Popover, and their motion modules', async () => {
  const tooltipOnly = await bundledModules('Tooltip', 'overlays.js');
  assert.ok(tooltipOnly.includes('overlays.js'));
  assert.equal(tooltipOnly.includes('dialog-motion.mjs'), false);
  assert.equal(tooltipOnly.includes('popover-motion.mjs'), false);
  // The controls: using Dialog keeps the modal motion, and using Popover keeps the popover motion.
  const withDialog = await bundledModules('Dialog', 'overlays.js');
  assert.ok(withDialog.includes('dialog-motion.mjs'));
  assert.equal(withDialog.includes('popover-motion.mjs'), false);
  const withPopover = await bundledModules('Popover', 'overlays.js');
  assert.ok(withPopover.includes('popover-motion.mjs'));
  assert.equal(withPopover.includes('dialog-motion.mjs'), false);
});
