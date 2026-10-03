import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');

async function currentReactExamples() {
  const descriptor = JSON.parse(await readFile(resolve(packageRoot, 'generated/descriptor.json'), 'utf8'));
  const seen = new Set();
  const examples = [];
  for (const binding of descriptor.bindings) {
    const componentId = binding.binding.split('#', 1)[0];
    const slug = componentId.slice('muxui:component:'.length);
    const artifactPath = `catalog/components/${slug}/artifact.json`;
    const artifact = JSON.parse(await readFile(resolve(repositoryRoot, artifactPath), 'utf8'));
    assert.equal(artifact.id, componentId, `${slug} artifact identity`);
    assert.ok(artifact.bindings?.['web.react'], `${slug} has a React artifact binding`);
    const examplesRoot = resolve(repositoryRoot, `catalog/components/${slug}/examples/react`);
    const files = (await readdir(examplesRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
      .map((entry) => entry.name)
      .sort();
    assert.ok(files.length > 0, `${slug} has no canonical React example`);
    for (const file of files) {
      const example = `catalog/components/${slug}/examples/react/${file}`;
      assert.equal(seen.has(example), false, `duplicate canonical example ${example}`);
      seen.add(example);
      const sourcePath = resolve(repositoryRoot, example);
      assert.equal((await readFile(sourcePath, 'utf8')).length > 0, true, `${slug} example is empty`);
      examples.push({ component: { slug, family: artifact.name }, example, sourcePath });
    }
  }
  assert.equal(new Set(descriptor.bindings.map(({ binding }) => binding)).size, descriptor.bindings.length);
  assert.equal(new Set(examples.map(({ component }) => component.slug)).size, descriptor.bindings.length);
  return examples;
}

async function linkPackageDependencies(nodeModules) {
  const source = join(packageRoot, 'node_modules');
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === '.bin') continue;
    const destination = join(nodeModules, entry.name);
    if (entry.name.startsWith('@')) {
      await mkdir(destination, { recursive: true });
      for (const scopedEntry of await readdir(join(source, entry.name), { withFileTypes: true })) {
        await symlink(join(source, entry.name, scopedEntry.name), join(destination, scopedEntry.name), 'junction').catch(() => {});
      }
      continue;
    }
    await symlink(join(source, entry.name), destination, 'junction').catch(() => {});
  }
}

test('packed @muxui/react declarations typecheck every current catalog example', async () => {
  const exampleFiles = await currentReactExamples();

  const workspace = await mkdtemp(join(tmpdir(), 'muxui-react-packed-types-'));
  try {
    const packResult = spawnSync('pnpm', ['pack', '--pack-destination', workspace, '--json'], {
      cwd: packageRoot,
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(packResult.status, 0, `${packResult.stdout}\n${packResult.stderr}`);
    const jsonStart = packResult.stdout.indexOf('\n{\n  "name": "@muxui/react"');
    assert.notEqual(jsonStart, -1, packResult.stdout);
    const packRecord = JSON.parse(packResult.stdout.slice(jsonStart + 1));
    const archive = packRecord.filename;
    const extract = spawnSync('tar', ['-xzf', archive, '-C', workspace], { encoding: 'utf8' });
    assert.equal(extract.status, 0, `${extract.stdout}\n${extract.stderr}`);

    const consumer = join(workspace, 'consumer');
    const nodeModules = join(consumer, 'node_modules');
    const packageScope = join(nodeModules, '@muxui');
    mkdirSync(packageScope, { recursive: true });
    await cp(join(workspace, 'package'), join(packageScope, 'react'), { recursive: true });
    await linkPackageDependencies(nodeModules);

    for (const [index, { component, example, sourcePath }] of exampleFiles.entries()) {
      const destination = join(consumer, 'examples', component.slug, `${String(index).padStart(3, '0')}-${example.split('/').at(-1)}`);
      await mkdirSync(dirname(destination), { recursive: true });
      await cp(sourcePath, destination);
    }
    const themeTypeExample = join(consumer, 'examples', 'themes', 'preset.tsx');
    await mkdir(dirname(themeTypeExample), { recursive: true });
    await writeFile(themeTypeExample, `import { MUXUI_THEME_PRESETS } from '@muxui/react/themes';
import type { MuxUIThemeId } from '@muxui/react/themes';

export const selectedTheme: MuxUIThemeId = MUXUI_THEME_PRESETS[0].id;
export const selectedSwatch: string = MUXUI_THEME_PRESETS[0].swatch.primary;
`);
    const tsconfig = join(consumer, 'tsconfig.json');
    await writeFile(tsconfig, `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: ['react', 'react-dom'],
      },
      include: ['examples/**/*.tsx'],
    }, null, 2)}\n`);
    const tsc = resolve(repositoryRoot, 'node_modules/.pnpm/node_modules/.bin/tsc');
    const typecheck = spawnSync(tsc, ['--noEmit', '-p', tsconfig], {
      cwd: consumer,
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);

    // Server-render the supplemental families' catalog examples from the packed package.
    const renderedSlugs = ['text', 'image', 'avatar', 'select-native'];
    const renderDist = join(consumer, 'render-dist');
    const renderConfig = join(consumer, 'tsconfig.render.json');
    await writeFile(renderConfig, `${JSON.stringify({
      extends: './tsconfig.json',
      // ES module output so Node runs the emitted examples directly.
      compilerOptions: { noEmit: false, outDir: 'render-dist', rootDir: 'examples', module: 'ES2022', moduleResolution: 'Bundler' },
      include: renderedSlugs.map((slug) => `examples/${slug}/*.tsx`),
    }, null, 2)}\n`);
    const emit = spawnSync(tsc, ['-p', renderConfig], { cwd: consumer, env: process.env, encoding: 'utf8' });
    assert.equal(emit.status, 0, `${emit.stdout}\n${emit.stderr}`);
    await writeFile(join(renderDist, 'package.json'), '{ "type": "module" }\n');
    const renderProbe = join(renderDist, 'render.mjs');
    await writeFile(renderProbe, `import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const markup = {};
for (const slug of ${JSON.stringify(renderedSlugs)}) {
  for (const file of await readdir(new URL(\`./\${slug}/\`, import.meta.url))) {
    const module = await import(\`./\${slug}/\${file}\`);
    const examples = Object.values(module).filter((value) => typeof value === 'function');
    assert.ok(examples.length > 0, \`\${slug}/\${file} exports an example component\`);
    markup[slug] = examples.map((Example) => renderToStaticMarkup(React.createElement(Example))).join('');
  }
}
assert.match(markup.text, /<h2 class="muxui-text muxui-text--heading-md">Account<\\/h2>/);
assert.match(markup.text, /class="muxui-text muxui-text--mono-sm"/);
assert.match(markup.image, /<img[^>]*class="muxui-image muxui-image--radius-md muxui-image--fit-cover"/);
assert.match(markup.image, /style="--muxui-image-ratio:320 \\/ 180"/);
assert.match(markup.avatar, /<span[^>]*class="muxui-avatar__fallback"[^>]*>AB<\\/span>/);
assert.match(markup.avatar, /<span role="img" aria-label="Andrew"[^>]*data-image-state="loading">/);
assert.doesNotMatch(markup.avatar, /<span[^>]*hidden=""[^>]*>AB</);
assert.match(markup['select-native'], /<label[^>]*for="([^"]+)"[^>]*>Saved panel<\\/label><select[^>]*id="\\1"/);
`);
    const rendered = spawnSync(process.execPath, [renderProbe], { cwd: consumer, env: process.env, encoding: 'utf8' });
    assert.equal(rendered.status, 0, `${rendered.stdout}\n${rendered.stderr}`);

    const loader = join(consumer, 'trace-loader.mjs');
    await writeFile(loader, `export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'marked' || specifier.startsWith('@tiptap/')) process.stderr.write(\`FORBIDDEN_EDGE:\${specifier}\\n\`);
  return nextResolve(specifier, context);
}\n`);
    const runImportProbe = async (name, source) => {
      const probe = join(consumer, `${name}.mjs`);
      await writeFile(probe, `${source}\n`);
      return spawnSync(process.execPath, ['--loader', loader, probe], {
        cwd: consumer,
        env: process.env,
        encoding: 'utf8',
      });
    };
    const rootProbe = await runImportProbe('root-runtime', `import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as MuxUI from '@muxui/react';
import * as themes from '@muxui/react/themes';
assert.ok(MuxUI.Button, 'root runtime loads Button');
assert.equal(themes.MUXUI_THEME_PRESETS.length, 15, 'packed theme metadata loads');
const packageEntry = await import.meta.resolve('@muxui/react');
if (!import.meta.resolve('@muxui/react/themes.css').endsWith('/generated/themes.css')) throw new Error('themes stylesheet resolution');
await access(fileURLToPath(new URL('../generated/themes.css', packageEntry)));
await access(fileURLToPath(new URL('../generated/themes.mjs', packageEntry)));
function PackedCommands() {
  const palette = MuxUI.useCommandPalette({ commands: [{ id: 'cafe', title: 'Café' }], defaultQuery: 'cafe' });
  assert.equal(palette.filteredCommands[0]?.id, 'cafe');
  assert.equal(palette.getItemProps(palette.filteredCommands[0]).closeOnSelect, false);
  return React.createElement(MuxUI.ColorSwatch, { color: '#ff0000', secondaryColor: '#0000ff', shape: 'circle' });
}
const markup = renderToStaticMarkup(React.createElement(PackedCommands));
assert.match(markup, /data-shape="circle"/);
assert.match(markup, /data-two-tone/);
assert.match(markup, /--muxui-color-swatch-secondary/);
`);
    assert.equal(rootProbe.status, 0, `${rootProbe.stdout}\n${rootProbe.stderr}`);
    assert.doesNotMatch(rootProbe.stderr, /FORBIDDEN_EDGE:/u, 'root import must not evaluate editor or Markdown dependencies');

    const markdownProbe = await runImportProbe('markdown-runtime', "import * as Markdown from '@muxui/react/markdown'; if (!Markdown.Markdown) throw new Error('Markdown subpath did not load');");
    assert.equal(markdownProbe.status, 0, `${markdownProbe.stdout}\n${markdownProbe.stderr}`);
    assert.match(markdownProbe.stderr, /FORBIDDEN_EDGE:marked/u, 'Markdown subpath must evaluate its parser dependency');
    assert.doesNotMatch(markdownProbe.stderr, /FORBIDDEN_EDGE:@tiptap\//u, 'Markdown subpath must not evaluate the editor dependency');

    const editorProbe = await runImportProbe('editor-runtime', "import * as TextEditor from '@muxui/react/text-editor'; if (!TextEditor.TextEditor) throw new Error('TextEditor subpath did not load');");
    assert.equal(editorProbe.status, 0, `${editorProbe.stdout}\n${editorProbe.stderr}`);
    assert.match(editorProbe.stderr, /FORBIDDEN_EDGE:@tiptap\//u, 'TextEditor subpath must evaluate its editor dependency');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
