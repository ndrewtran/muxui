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

/** The package modules a bundle of `import { <name> } from components.js` keeps, as paths under generated/. */
async function bundledModules(name) {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const directory = mkdtempSync(join(packageRoot, 'build', 'tree-shaking-'));
  try {
    const entry = join(directory, 'entry.mjs');
    writeFileSync(entry, `export { ${name} } from '${relative(directory, resolve(generated, 'components.js')).replaceAll('\\', '/')}';\n`);
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
