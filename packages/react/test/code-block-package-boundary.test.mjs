import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import test from 'node:test';

const packageRoot = resolve(import.meta.dirname, '..');
const publicEntry = resolve(packageRoot, 'generated/index.mjs');

test('root import and CodeBlock SSR do not load a Shiki module, engine, or grammar', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(id, context, next) {
      assert.ok(!id.startsWith('shiki') && !id.startsWith('@shikijs/'), 'SSR attempted Shiki load: ' + id);
      return next(id, context);
    } });
    const { CodeBlock } = await import('./generated/index.mjs');
    const { default: React } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(React.createElement(CodeBlock, {source: 'const x = 1;', language: 'typescript'}));
    assert.ok(html.includes('const x = 1;'));
    assert.ok(!html.includes('muxui-code-block-token-'));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: packageRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('CodeBlock bundle keeps Shiki engine and grammars behind dynamic chunks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muxui-code-block-bundle-'));
  try {
    const entry = join(directory, 'entry.mjs');
    await writeFile(entry, `export { CodeBlock } from ${JSON.stringify(publicEntry)};\n`);
    const result = await build({ configFile: false, logLevel: 'silent', root: directory, build: { write: false, rollupOptions: {
      input: entry, external: (id) => ['react', 'react-dom', 'react-aria-components', '@internationalized/date', 'lucide-react'].includes(id) || id.startsWith('lucide-react/'),
      preserveEntrySignatures: 'strict', output: { format: 'es' },
    } } });
    const chunks = (Array.isArray(result) ? result : result.output).filter((item) => item.type === 'chunk');
    const initial = chunks.find((chunk) => chunk.isEntry);
    assert.ok(initial.exports.includes('CodeBlock'));
    const shikiModules = (chunk) => Object.entries(chunk.modules).filter(([id, module]) => /node_modules\/\.pnpm\/(?:shiki|@shikijs\+)/u.test(id) && module.renderedLength > 0);
    assert.equal(shikiModules(initial).length, 0);
    assert.ok(initial.dynamicImports.length > 0);
    assert.ok(chunks.some((chunk) => chunk !== initial && shikiModules(chunk).some(([id]) => /engine-oniguruma/u.test(id))));
    assert.ok(chunks.some((chunk) => chunk !== initial && shikiModules(chunk).some(([id]) => /langs.*typescript/u.test(id))));
    assert.ok(chunks.flatMap(shikiModules).every(([id]) => !/\/shiki\/dist\/bundle-full/u.test(id)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('packed public consumer hydrates and highlights with exact copy text and retained license files', { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muxui-code-block-consumer-'));
  try {
    const staging = join(directory, 'package');
    await mkdir(staging);
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    for (const file of new Set(['package.json', ...manifest.files])) await cp(join(packageRoot, file), join(staging, file), { recursive: true });
    const archive = join(directory, 'muxui-react.tgz');
    const packed = spawnSync('tar', ['-czf', archive, '-C', directory, 'package'], { encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const consumer = join(directory, 'consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
      '@muxui/react': 'file:../muxui-react.tgz', react: '19.2.8', 'react-dom': '19.2.8', jsdom: '30.0.1',
    } }));
    const install = spawnSync('pnpm', ['install', '--prefer-offline', '--ignore-scripts'], { cwd: consumer, encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const script = `
      import assert from 'node:assert/strict';
      import { access, readFile } from 'node:fs/promises';
      import React, { act } from 'react';
      import { hydrateRoot } from 'react-dom/client';
      import { renderToString } from 'react-dom/server';
      import { JSDOM } from 'jsdom';
      import { CodeBlock } from '@muxui/react';
      const entry = import.meta.resolve('@muxui/react');
      const manifest = JSON.parse(await readFile(new URL('../package.json', entry), 'utf8'));
      assert.equal(manifest.dependencies.shiki, '4.5.0');
      for (const file of ['shiki.MIT.txt', 'shiki-vscode-textmate.MIT.txt', 'shiki-oniguruma.NOTICES.txt']) await access(new URL('../licenses/' + file, entry));
      const source = '\\tconst value = "<script>&";\\r\\n  // retained  \\n';
      const element = React.createElement(CodeBlock, {source, language: 'typescript'});
      const html = renderToString(element);
      assert.ok(!html.includes('muxui-code-block-token-'));
      const dom = new JSDOM('<!doctype html><div id="root">' + html + '</div>', {pretendToBeVisual: true});
      for (const name of [...Object.getOwnPropertyNames(dom.window).filter((name) => /^(HTML|SVG)\\w*Element$/.test(name)), 'window', 'document', 'Document', 'DocumentFragment', 'Node', 'NodeFilter', 'Element', 'Event', 'MutationObserver', 'getComputedStyle']) {
        if (dom.window[name] !== undefined) Object.defineProperty(globalThis, name, {configurable: true, writable: true, value: name === 'window' ? dom.window : dom.window[name]});
      }
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
      globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
      dom.window.Element.prototype.scrollTo = () => {};
      const writes = [];
      Object.defineProperty(dom.window.navigator, 'clipboard', {value: {writeText: async (value) => writes.push(value)}});
      const errors = [];
      let root;
      await act(async () => { root = hydrateRoot(document.querySelector('#root'), element, {onRecoverableError: (error) => errors.push(error.message)}); });
      for (let count = 0; count < 200 && !document.querySelector('.muxui-code-block-token-link'); count++) await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
      assert.deepEqual(errors, []);
      assert.ok(document.querySelector('.muxui-code-block-token-link'));
      assert.equal(document.querySelector('code').textContent, source);
      assert.equal(document.querySelector('script'), null);
      await act(async () => document.querySelector('button').click());
      assert.deepEqual(writes, [source]);
      await act(async () => root.unmount());
      dom.window.close();
      console.log('packed highlight and copy passed');
    `;
    const check = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'development' } });
    assert.equal(check.status, 0, check.stderr || check.stdout);
    assert.match(check.stdout, /packed highlight and copy passed/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
