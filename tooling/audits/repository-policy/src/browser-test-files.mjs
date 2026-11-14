// Lists the React browser test files for the browser jobs in .github/workflows/ci.yml.
//
//   node browser-test-files.mjs cross-engine    files that call the harness's browserEngines()
//   node browser-test-files.mjs chromium-only   every other file under test/browser
//
// A cross-engine file runs once per engine (MUXUI_BROWSER_ENGINES); the rest run in
// Chromium only. Paths are relative to packages/react, one per line. CI splits each
// list with Node's --test-shard, which sorts the files and keeps every n-th one.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reactRoot = resolve(import.meta.dirname, '../../../../packages/react');
const callsBrowserEngines = /\bbrowserEngines\(\)/u;

/** The two disjoint browser test lists, each sorted. */
export function browserTestFiles(root = reactRoot) {
  const files = readdirSync(resolve(root, 'test/browser'))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `test/browser/${name}`);
  const crossEngine = files.filter((file) => callsBrowserEngines.test(readFileSync(resolve(root, file), 'utf8')));
  return { 'cross-engine': crossEngine, 'chromium-only': files.filter((file) => !crossEngine.includes(file)) };
}

if (import.meta.main) {
  const kind = process.argv[2];
  const files = browserTestFiles()[kind];
  if (!files) {
    console.error(`MUXUI_BROWSER_TEST_KIND_UNKNOWN: expected cross-engine or chromium-only, got ${JSON.stringify(kind)}`);
    process.exit(2);
  }
  // An empty list would make `node --test` fall back to its default glob and run every test.
  if (files.length === 0) {
    console.error(`MUXUI_BROWSER_TEST_LIST_EMPTY: no ${kind} browser tests`);
    process.exit(1);
  }
  console.log(files.join('\n'));
}
