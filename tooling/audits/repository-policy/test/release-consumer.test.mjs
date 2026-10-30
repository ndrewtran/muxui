import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const renderer = resolve(import.meta.dirname, '../src/release-consumer/render-examples.mjs');
const requireFromReact = createRequire(resolve(import.meta.dirname, '../../../../packages/react/package.json'));

function consumer(t) {
  const root = mkdtempSync(join(tmpdir(), 'muxui-release-render-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'node_modules'));
  for (const name of ['react', 'react-dom']) {
    symlinkSync(dirname(requireFromReact.resolve(`${name}/package.json`)), join(root, 'node_modules', name), 'dir');
  }
  copyFileSync(renderer, join(root, 'render-examples.mjs'));
  return {
    write(file, source) { writeFileSync(join(root, file), source); },
    run(plan) {
      writeFileSync(join(root, 'plan.json'), JSON.stringify({ exportModules: [], ...plan }));
      const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', 'render-examples.mjs', 'plan.json', 'result.json'], {
        cwd: root, env: { ...process.env, NODE_ENV: 'development' }, encoding: 'utf8', timeout: 15_000,
      });
      assert.ifError(child.error);
      return { ...child, result: existsSync(join(root, 'result.json')) ? JSON.parse(readFileSync(join(root, 'result.json'), 'utf8')) : undefined };
    },
  };
}

const reactImport = "import React from 'react';\n";

test('packed renderer preserves module, component, coverage and value-check order', (t) => {
  const fixture = consumer(t);
  fixture.write('exports.mjs', 'globalThis.events = []; export const z = 1; export const a = 2;');
  const modules = [];
  const expectedIds = [];
  const expectedEvents = [];
  for (let index = 0; index < 12; index += 1) {
    // URL-sensitive characters must identify the original file, not entry source.
    const file = `example ${index}#'%.mjs`;
    fixture.write(file, `${reactImport}
      globalThis.events.push('load${index}');
      export const data = 42;
      export const fixtureCoverage = { Alpha: ['public:Alpha${index}'], Zulu: ['public:Zulu${index}'] };
      export function Zulu() { globalThis.events.push('Zulu${index}'); return React.createElement('p', null, 'Zulu${index}'); }
      export function Alpha() { globalThis.events.push('Alpha${index}'); return React.createElement('p', null, 'Alpha${index}'); }
    `);
    const components = index === 1 ? ['Zulu', 'Alpha'] : undefined;
    modules.push({ file, ...(components ? { components } : {}), measuredLayout: index === 1 });
    for (const name of components ?? ['Alpha', 'Zulu']) expectedIds.push(`${file}#${name}`);
    expectedEvents.push(`load${index}`);
  }
  // A repeated file remains a separate planned render without re-evaluation.
  modules.push({ file: modules[0].file, components: ['Zulu'] });
  expectedIds.push(`${modules[0].file}#Zulu`);
  expectedEvents.push(...expectedIds.map((id) => {
    const [index, name] = /example (\d+)#'%\.mjs#(\w+)/u.exec(id).slice(1);
    return `${name}${index}`;
  }));
  fixture.write('values.mjs', `export function check() {
    const expected = ${JSON.stringify(expectedEvents)};
    if (JSON.stringify(globalThis.events) !== JSON.stringify(expected)) throw new Error(JSON.stringify(globalThis.events));
    return ['public:value'];
  }`);
  const { status, stderr, result } = fixture.run({
    exportModules: ['./exports.mjs'], modules, valueChecks: { file: 'values.mjs', name: 'check' },
  });
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.deepEqual(result.exportKeys, { './exports.mjs': ['a', 'z'] });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.valueExports, ['public:value']);
  assert.deepEqual(result.renders.map(({ id }) => id), expectedIds);
  assert.equal(result.renders.length, 25);
  for (const [index, render] of result.renders.entries()) {
    const label = expectedEvents[12 + index];
    assert.equal(render.html, `<p>${label}</p>`);
    assert.equal(render.measuredLayout, index === 2 || index === 3);
    assert.deepEqual(render.covers, [`public:${label}`]);
    assert.equal(Number.isFinite(render.milliseconds), true);
    assert.equal(render.id, `${render.file}#${render.name}`);
  }
});

test('packed renderer includes delayed module evaluation in its SSR interval and waits before rendering', (t) => {
  const fixture = consumer(t);
  fixture.write('delayed.mjs', `${reactImport}
    await new Promise((done) => setTimeout(done, 150));
    globalThis.ready = true;
    export function Delayed() { return React.createElement('p', null, 'delayed'); }
  `);
  fixture.write('following.mjs', `${reactImport}
    export function Following() {
      if (!globalThis.ready) throw new Error('rendered before import completed');
      return React.createElement('p', null, 'following');
    }
  `);
  const { status, stderr, result } = fixture.run({ modules: [{ file: 'delayed.mjs' }, { file: 'following.mjs' }] });
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.deepEqual(result.renders.map(({ html }) => html), ['<p>delayed</p>', '<p>following</p>']);
  assert.ok(result.ssrMilliseconds >= 140, `untimed import: ${result.ssrMilliseconds}ms`);
});

test('packed renderer retains missing-component, render and value failures while rendering remaining entries', (t) => {
  const fixture = consumer(t);
  fixture.write('empty.mjs', 'export const value = 1;');
  fixture.write('components.mjs', `${reactImport}
    export function Broken() { throw new Error('render failure sentinel'); }
    export function Good() { return React.createElement('p', null, 'good'); }
  `);
  fixture.write('values.mjs', "export function check() { throw new Error('value failure sentinel'); }");
  const { status, stderr, result } = fixture.run({
    modules: [{ file: 'empty.mjs' }, { file: 'components.mjs', components: ['Broken', 'Missing', 'Good'], measuredLayout: true }],
    valueChecks: { file: 'values.mjs', name: 'check' },
  });
  assert.equal(status, 1, stderr);
  assert.deepEqual(result.valueExports, []);
  assert.equal(result.failures.length, 4);
  assert.match(result.failures[0], /empty.mjs: no component export/u);
  assert.match(result.failures[1], /components.mjs#Broken:.*render failure sentinel/u);
  assert.match(result.failures[2], /components.mjs#Missing:/u);
  assert.equal(result.failures[3], 'values.mjs: value failure sentinel');
  assert.match(stderr, /render failure sentinel/u);
  assert.match(stderr, /value failure sentinel/u);
  assert.deepEqual(result.renders.map(({ id, html, measuredLayout, covers }) => ({ id, html, measuredLayout, covers })), [
    { id: 'components.mjs#Good', html: '<p>good</p>', measuredLayout: true, covers: [] },
  ]);
});

test('packed renderer fails closed on missing imports, linking errors, evaluation throws and rejected top-level await', async (t) => {
  for (const [name, source, modules, exportModules, error] of [
    ['missing example', '', [{ file: 'absent.mjs' }], [], /ERR_MODULE_NOT_FOUND/u],
    ['missing export module', '', [], ['./absent.mjs'], /ERR_MODULE_NOT_FOUND/u],
    ['link failure', "import { absent } from './dependency.mjs'; export const value = absent;", [{ file: 'bad.mjs' }], [], /does not provide an export named 'absent'/u],
    ['evaluation throw', "throw new Error('evaluation sentinel');", [{ file: 'bad.mjs' }], [], /evaluation sentinel/u],
    ['rejected await', "await Promise.reject(new Error('await sentinel'));", [{ file: 'bad.mjs' }, { file: 'other-rejection.mjs' }], [], /await sentinel/u],
  ]) {
    await t.test(name, (t) => {
      const fixture = consumer(t);
      fixture.write('bad.mjs', source);
      fixture.write('dependency.mjs', 'export const present = 1;');
      fixture.write('other-rejection.mjs', "await new Promise((_, reject) => setTimeout(() => reject(new Error('later rejection sentinel')), 5));");
      const { status, stderr, result } = fixture.run({ modules, exportModules });
      assert.equal(status, 1, stderr);
      assert.match(stderr, error);
      assert.doesNotMatch(stderr, /UnhandledPromiseRejection|later rejection sentinel/u);
      assert.equal(result, undefined, 'an import failure must not emit successful partial results');
    });
  }
});
