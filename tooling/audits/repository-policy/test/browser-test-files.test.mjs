import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { browserTestFiles } from '../src/browser-test-files.mjs';

test('the CI browser lists split every React browser test into cross-engine and Chromium-only, once each', () => {
  const lists = browserTestFiles();
  const all = readdirSync(resolve(import.meta.dirname, '../../../../packages/react/test/browser'))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `test/browser/${name}`)
    .sort();
  assert.ok(lists['cross-engine'].length > 0 && lists['chromium-only'].length > 0);
  assert.deepEqual([...lists['cross-engine'], ...lists['chromium-only']].sort(), all);
  assert.ok(lists['cross-engine'].includes('test/browser/button.test.mjs'));
  assert.ok(lists['chromium-only'].includes('test/browser/themes.test.mjs'));
});

test('a browser test is cross-engine when it calls browserEngines(), and helpers are not tests', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-browser-test-files-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'test/browser'), { recursive: true });
  const files = {
    'b.test.mjs': "for (const engine of browserEngines()) test(engine, () => {});\n",
    'a.test.mjs': "// browserEngines is only mentioned here\ntest('chromium', () => {});\n",
    'harness.mjs': 'export function browserEngines() {}\n',
  };
  for (const [name, text] of Object.entries(files)) await writeFile(join(root, 'test/browser', name), text);
  assert.deepEqual(browserTestFiles(root), { 'cross-engine': ['test/browser/b.test.mjs'], 'chromium-only': ['test/browser/a.test.mjs'] });
});

// The image's browser builds only launch from the playwright-core version that built them.
test('the CI Playwright image is tagged with the playwright-core version React pins', () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../../..');
  const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
  const { devDependencies } = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/react/package.json'), 'utf8'));
  const images = workflow.match(/mcr\.microsoft\.com\/playwright\S*/gu) ?? [];
  assert.ok(images.length > 0, 'ci.yml names a Playwright image');
  for (const image of images) assert.equal(image, `mcr.microsoft.com/playwright:v${devDependencies['playwright-core']}-noble`);
});
