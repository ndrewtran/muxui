import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { installPackedTuple, writeProjection } from './support/packed-tuple.mjs';

// E-P2.1-02: the `muxui` bin installed from the packed schema, catalog, tooling and React tarballs, never the source
// tree. The tuple is packed and installed once for the file.
let tuple;
before(async () => {
  tuple = await installPackedTuple();
});
after(async () => {
  await tuple?.dispose();
});

// Tests that only read the install share one run of each distinct invocation. The last test edits the install, so it
// calls `tuple.muxui` for fresh runs.
const invocations = new Map();
function muxui(args) {
  const key = JSON.stringify(args);
  if (!invocations.has(key)) invocations.set(key, tuple.muxui(args));
  return invocations.get(key);
}

const BUTTON = 'muxui:component:button';
// A regression ceiling for `get` with `--platform web.react --detail full` (2797 tokens today), not the registry budget (2048).
const WEB_REACT_GET_FULL_REGRESSION_CEILING = 3072;
const GOLDENS = fileURLToPath(new URL('goldens/packed/', import.meta.url));
const MODES = { human: [], json: ['--json'], dense: ['--dense'] };

// Each case is a CLI invocation and the catalog API request it stands for.
const DISCOVERY = [
  { name: 'manifest-brief', args: ['manifest', '--detail', 'brief'], request: { detail: 'brief' } },
  {
    name: 'list-brief',
    args: ['list', 'component', '--platform', 'web.react', '--detail', 'brief', '--limit', '2'],
    request: { kind: 'component', platform: 'web.react', detail: 'brief', limit: 2, purpose: null, cursor: null, uses: null },
  },
  {
    name: 'search-brief',
    args: ['search', 'button', '--platform', 'web.react', '--detail', 'brief', '--limit', '2'],
    request: { query: 'button', platform: 'web.react', detail: 'brief', limit: 2, purpose: null, cursor: null, uses: null },
  },
  {
    name: 'get-compact',
    args: ['get', BUTTON, '--platform', 'web.react', '--detail', 'compact'],
    request: { id: BUTTON, platform: 'web.react', detail: 'compact', purpose: null, section: null },
  },
].map((discovery) => ({ ...discovery, command: discovery.args[0], detail: discovery.request.detail }));

// Runs inside the consumer, so every import below is the installed package.
const REFERENCE = `
  import { join } from 'node:path';
  import { pathToFileURL } from 'node:url';
  import * as catalog from '@muxui/catalog';
  // The pnpm adapter is internal to tooling, so it is loaded by path rather than through the export map.
  const { resolvePnpmProjectCatalog } = await import(
    pathToFileURL(join(process.cwd(), 'node_modules/@muxui/tooling/src/pnpm-adapter.mjs')).href
  );
  const operations = { manifest: 'getManifest', list: 'listArtifacts', search: 'searchArtifacts', get: 'getArtifact' };
  console.log(JSON.stringify(input.map(({ command, request }) => {
    const resolved = resolvePnpmProjectCatalog({
      platform: request.platform ?? null,
      artifact: command === 'get' ? request.id : null,
      filterBindings: command === 'list' || command === 'search',
    });
    if (resolved.type !== 'success') throw new Error(JSON.stringify(resolved));
    return {
      project: resolved.api[operations[command]](request),
      plain: catalog[operations[command]](request),
    };
  })));
`;
const NORMALIZE = `
  import { countTokens, parseDense, parseHuman, tokenBudgetFor } from '@muxui/tooling';
  import { commandRegistry } from '@muxui/tooling/registry';
  const parse = { json: JSON.parse, dense: parseDense, human: parseHuman };
  console.log(JSON.stringify({
    responses: input.map(({ mode, text }) => parse[mode](text)),
    tokens: input.map(({ mode, text, command, detail }) => (mode === 'dense' && command
      ? { used: countTokens(text), budget: tokenBudgetFor(commandRegistry, command, detail) }
      : null)),
    budgetFixtures: Object.fromEntries(commandRegistry.commands.map(({ name, budgetFixture }) => [name, budgetFixture])),
  }));
`;

/** Runs `args` in each output mode and returns the three results by mode. */
async function inEveryMode(args) {
  const results = await Promise.all(Object.values(MODES).map((flags) => muxui([...args, ...flags])));
  return Object.fromEntries(Object.keys(MODES).map((mode, index) => [mode, results[index]]));
}

/** Normalizes each rendering back to its response inside the consumer, with its dense token use. */
const normalize = (renderings) => tuple.inConsumer(NORMALIZE, renderings);

function once(make) {
  let value;
  return () => (value ??= make());
}

/** The discovery cases run in every mode; a success writes JSON or dense text to stdout and nothing to stderr. */
const discover = once(() => Promise.all(DISCOVERY.map(async (discovery) => {
  const outputs = await inEveryMode(discovery.args);
  for (const [mode, { status, stderr }] of Object.entries(outputs)) {
    assert.deepEqual({ mode, status, stderr }, { mode, status: 0, stderr: '' }, discovery.name);
  }
  assert.equal(outputs.json.stdout.trimEnd().split('\n').length, 1, `${discovery.name} JSON is one value`);
  return { ...discovery, outputs };
})));

// Digests and the cursors that embed them change with any catalog edit, so goldens hold placeholders for them (the same
// rule as cli.test.mjs) and change only when rendered content does.
function normalizeDigests(rendering) {
  return rendering
    .replace(/sha256:[0-9a-f]{64}/gu, 'sha256:<digest>')
    .replace(/"nextCursor":"[^"]+"/gu, '"nextCursor":"<cursor>"');
}

/** Compares each normalized rendering with its golden; MUXUI_UPDATE_GOLDENS=1 rewrites a stale one instead. */
async function checkGoldens(renderings) {
  const update = process.env.MUXUI_UPDATE_GOLDENS === '1';
  for (const [name, rendering] of Object.entries(renderings)) {
    const actual = normalizeDigests(rendering);
    const path = join(GOLDENS, name);
    const expected = await readFile(path, 'utf8').catch(() => null);
    if (actual === expected) continue;
    if (!update) assert.equal(actual, expected, name);
    await mkdir(GOLDENS, { recursive: true });
    await writeFile(path, actual);
    console.log(`[goldens] rewrote ${name}`);
  }
}

test('E-P2.1-02 the muxui bin and every package it reads are the installed tarballs', async () => {
  const modules = await realpath(join(tuple.root, 'node_modules'));
  const inside = (path) => path.startsWith(`${modules}${sep}`);
  const installed = async (name) => realpath(join(modules, name));

  for (const name of ['@muxui/catalog', '@muxui/react', '@muxui/tooling']) {
    const root = await installed(name);
    assert.ok(inside(root), `${name} resolves outside the consumer: ${root}`);
    assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, tuple.versions[name]);
  }
  // Tooling reads the packed schema next to it, not the checkout's.
  assert.ok(inside(await realpath(join(await installed('@muxui/tooling'), '../schema'))));

  const tooling = await installed('@muxui/tooling');
  const { bin } = JSON.parse(await readFile(join(tooling, 'package.json'), 'utf8'));
  const binPath = await realpath(join(tooling, bin.muxui));
  assert.ok(inside(binPath));
  const shim = await readFile(join(modules, '.bin/muxui'), 'utf8');
  assert.ok(shim.includes(`../${relative(modules, binPath).split(sep).join('/')}`), 'the .bin shim runs the installed bin');

  // The CLI read the installed tuple: project-local authority over the installed catalog and renderer versions.
  const get = (await discover()).find(({ name }) => name === 'get-compact');
  const { resolution } = JSON.parse(get.outputs.json.stdout).meta;
  assert.deepEqual(
    { authority: resolution.authority, catalogSource: resolution.catalogSource, compatibility: resolution.compatibility },
    { authority: 'installed-local', catalogSource: 'project', compatibility: 'exact' },
  );
  assert.deepEqual(resolution.targetPackages, {
    '@muxui/catalog': tuple.versions['@muxui/catalog'],
    '@muxui/react': tuple.versions['@muxui/react'],
  });
});

/** The tooling version `run` reports in response meta, in each manifest detail, and in the help title. */
async function reportedVersions(run) {
  const [brief, compact, full, help] = await Promise.all([
    ...['brief', 'compact', 'full'].map((detail) => run(['manifest', '--detail', detail, '--json'])),
    run(['--help']),
  ]);
  const [briefResponse, compactResponse, fullResponse] = [brief, compact, full].map(({ stdout }) => JSON.parse(stdout));
  return {
    meta: [briefResponse, compactResponse, fullResponse].map(({ meta }) => meta.muxuiVersion),
    manifest: [briefResponse.data.cli.version, compactResponse.data.cli.cli.version, fullResponse.data.cli.cli.version],
    help: help.stdout.split('\n')[0],
  };
}

const reportedAs = (version) => ({
  meta: [version, version, version],
  manifest: [version, version, version],
  help: `muxui ${version}`,
});

test('E-P2.1-02 responses, the manifest, and help report the installed tooling version', async () => {
  const version = tuple.versions['@muxui/tooling'];
  assert.deepEqual(await reportedVersions(muxui), reportedAs(version));
});

test('E-P2.1-02 list, search, and get discover and retrieve the installed React tuple', async () => {
  const react = await realpath(join(tuple.root, 'node_modules/@muxui/react'));
  const { bindings } = JSON.parse(await readFile(join(react, 'generated/renderer-descriptor.json'), 'utf8'));
  const ids = Object.keys(bindings).map((binding) => binding.split('#')[0]).sort();
  assert.ok(ids.includes(BUTTON));

  // Every component binding the installed descriptor carries is listed for the platform, and no other.
  const listed = await muxui(['list', 'component', '--platform', 'web.react', '--limit', '100', '--detail', 'brief', '--json']);
  assert.equal(listed.status, 0);
  assert.deepEqual(JSON.parse(listed.stdout).data.items.map(({ id }) => id).sort(), ids);

  const cases = Object.fromEntries((await discover()).map(({ name, outputs }) => [name, JSON.parse(outputs.json.stdout)]));
  assert.equal(cases['search-brief'].data.items[0].id, BUTTON);
  assert.equal(cases['get-compact'].data.artifact.id, BUTTON);
  assert.equal(cases['get-compact'].meta.platform, 'web.react');
  assert.match(cases['get-compact'].meta.revisions.bindingSpec, /^sha256:[0-9a-f]{64}$/u);
});

test('E-P2.1-02 discovery output matches the packed goldens in human, JSON, and dense modes', async () => {
  const renderings = {};
  for (const { name, outputs } of await discover()) {
    for (const [mode, { stdout }] of Object.entries(outputs)) {
      renderings[`${name}.${mode}.txt`] = stdout;
    }
  }
  await checkGoldens(renderings);
});

test('E-P2.1-02 human, JSON, and dense output normalize to the catalog API response', async () => {
  const discovered = await discover();
  const references = await tuple.inConsumer(REFERENCE, discovered);
  const { responses } = await normalize(discovered.flatMap(({ command, detail, outputs }) => (
    Object.entries(outputs).map(([mode, { stdout }]) => ({ mode, text: stdout, command, detail }))
  )));

  discovered.forEach(({ name }, index) => {
    const { project, plain } = references[index];
    for (const [offset, mode] of Object.keys(MODES).entries()) {
      assert.deepEqual(responses[index * 3 + offset], project, `${name} ${mode}`);
    }
    // Project resolution adds installed-tuple authority; the artifact record is the catalog's own.
    if (name === 'get-compact') assert.deepEqual(project.data.artifact, plain.data.artifact);
  });
});

test('E-P2.1-02 dense output stays inside every locked token budget', async () => {
  // These arguments are the registry's budget fixtures, checked below against the installed registry.
  const fixtures = { manifest: [], list: ['--limit', '1'], search: ['button', '--limit', '1'], get: [BUTTON] };
  const cases = ['brief', 'compact', 'full'].flatMap((detail) => Object.entries(fixtures)
    .map(([command, args]) => ({ command, detail, args: [command, ...args, '--detail', detail, '--dense'] })));
  // `get --platform web.react` fits the registry budget at brief and compact. Its full detail exceeds the 2048 budget, so
  // it is held to a regression ceiling instead.
  cases.push(...['brief', 'compact', 'full'].map((detail) => ({
    command: 'get',
    detail,
    ceiling: detail === 'full' ? WEB_REACT_GET_FULL_REGRESSION_CEILING : undefined,
    args: ['get', BUTTON, '--platform', 'web.react', '--detail', detail, '--dense'],
  })));
  const outputs = await Promise.all(cases.map(({ args }) => muxui(args)));
  outputs.forEach(({ status, stderr }, index) => assert.deepEqual({ status, stderr }, { status: 0, stderr: '' }, cases[index].args.join(' ')));

  const { tokens, budgetFixtures } = await normalize(cases.map(({ command, detail }, index) => (
    { mode: 'dense', text: outputs[index].stdout, command, detail }
  )));
  assert.deepEqual(budgetFixtures, {
    manifest: {}, list: { limit: 1 }, search: { query: 'button', limit: 1 }, get: { 'id-or-alias': BUTTON },
  });
  tokens.forEach(({ used, budget }, index) => {
    const { command, detail, ceiling = budget } = cases[index];
    assert.ok(used > 0 && used <= ceiling, `${command}.${detail} used ${used} of ${ceiling} tokens`);
  });
});

test('E-P2.1-02 the manifest reports the commands P2.1 does not enable as unavailable', async () => {
  const { status, stdout } = await muxui(['manifest', '--json']);
  assert.equal(status, 0);
  const { cli, capabilities } = JSON.parse(stdout).data;

  // Only the discovery baseline is a command; everything else is explicitly unavailable and names its milestone.
  assert.deepEqual(cli.commands.map(({ name }) => name), ['manifest', 'list', 'search', 'get']);
  assert.deepEqual(
    Object.fromEntries(cli.unavailableCommands.map(({ name, capability }) => [name, capability.available])),
    { validate: false, plan: false, doctor: false, init: false, migrate: false },
  );
  assert.deepEqual(capabilities.map(({ id, availability }) => [id, availability]), [['muxui:capability:query-baseline', 'available']]);

  // Running one is the same typed refusal as any unknown command.
  for (const name of ['validate', 'plan', 'doctor', 'init', 'migrate']) {
    const refused = await muxui([name, '--json']);
    assert.equal(refused.status, 2, name);
    assert.equal(JSON.parse(refused.stdout).error.ruleId, 'cli.command.unknown', name);
  }
});

test('E-P2.1-02 invalid requests return structured errors with stable codes and a read-only nextCommand', async () => {
  const invalid = [
    { args: ['unknown'], code: 'MUXUI_QUERY_INVALID', exitCode: 2, ruleId: 'cli.command.unknown', next: 'muxui --json' },
    { args: ['list', '--bogus'], code: 'MUXUI_QUERY_INVALID', exitCode: 2, ruleId: 'cli.option.unknown', next: 'muxui list --help' },
    { args: ['get', BUTTON, '--platform', 'nope'], code: 'MUXUI_QUERY_INVALID', exitCode: 2, ruleId: 'cli.option.value', next: 'muxui get --help' },
    { args: ['list', '--cursor', 'wrong'], code: 'MUXUI_CURSOR_INVALID', exitCode: 3, ruleId: 'query.cursor.identity', next: 'muxui list --help' },
    {
      args: ['get', 'muxui:component:missing'],
      code: 'MUXUI_ARTIFACT_NOT_FOUND',
      exitCode: 4,
      ruleId: 'artifact.resolve.exists',
      next: 'muxui search "muxui:component:missing" --json',
    },
  ];
  const results = await Promise.all(invalid.map(({ args }) => muxui([...args, '--json'])));
  invalid.forEach(({ args, code, exitCode, ruleId, next }, index) => {
    const { status, stdout, stderr } = results[index];
    const label = args.join(' ');
    const response = JSON.parse(stdout);
    assert.deepEqual({ status, stderr, type: response.type }, { status: exitCode, stderr: '', type: 'error' }, label);
    assert.deepEqual(
      { code: response.error.code, ruleId: response.error.ruleId, nextCommand: response.error.nextCommand },
      { code, ruleId, nextCommand: { command: next, effect: 'read-only', requiresConfirmation: false } },
      label,
    );
  });

  // The three renderings of an error are one response; human errors go to stderr.
  const [missing] = invalid.slice(-1);
  const modes = await inEveryMode(missing.args);
  const { responses } = await normalize([
    { mode: 'human', text: modes.human.stderr },
    { mode: 'json', text: modes.json.stdout },
    { mode: 'dense', text: modes.dense.stdout },
  ]);
  assert.equal(modes.human.stdout, '');
  assert.equal(modes.human.status, missing.exitCode);
  assert.equal(modes.dense.status, missing.exitCode);
  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(responses[2], responses[1]);
});

// Last, because it edits the installed package.
test('E-P2.1-02 an installed descriptor the resolver rejects makes get fail with MUXUI_CATALOG_INCOMPATIBLE', async () => {
  const descriptorPath = join(await realpath(join(tuple.root, 'node_modules/@muxui/react')), 'generated/renderer-descriptor.json');
  const files = [descriptorPath, `${descriptorPath}.provenance`];
  const originals = await Promise.all(files.map(async (path) => [path, await readFile(path, 'utf8')]));
  const get = () => tuple.muxui(['get', BUTTON, '--platform', 'web.react', '--json']);
  assert.equal((await get()).status, 0);

  // Installed files may share inodes with the pnpm store, so replace them rather than writing in place.
  try {
    const descriptor = JSON.parse(originals[0][1]);
    descriptor.bindings[`${BUTTON}#web.react`].specRevision = `sha256:${'0'.repeat(64)}`;
    await Promise.all(files.map((path) => rm(path)));
    await writeProjection(descriptorPath, 'packages/react/generated/renderer-descriptor.json', descriptor);

    const { status, stdout, stderr } = await get();
    const { error } = JSON.parse(stdout);
    assert.deepEqual({ status, stderr, code: error.code }, { status: 16, stderr: '', code: 'MUXUI_CATALOG_INCOMPATIBLE' });
    assert.deepEqual([...new Set(error.details.compatibilityFailures.map(({ dimension }) => dimension))], ['binding-spec']);
    assert.equal(error.nextCommand.effect, 'read-only');
    assert.equal(error.nextCommand.requiresConfirmation, false);
  } finally {
    for (const [path, bytes] of originals) {
      await rm(path, { force: true });
      await writeFile(path, bytes);
    }
  }
  assert.equal((await get()).status, 0);
});

// Also edits the installed package, so it restores the file before the next test and leaves the install as it found it.
test('E-P2.1-02 an installed catalog whose bytes differ from its provenance sidecar makes get fail with MUXUI_CATALOG_INTEGRITY_MISMATCH', async () => {
  const catalogPath = join(await realpath(join(tuple.root, 'node_modules/@muxui/catalog')), 'generated/catalog.json');
  const original = await readFile(catalogPath, 'utf8');
  const get = () => tuple.muxui(['get', BUTTON, '--platform', 'web.react', '--json']);

  // Installed files may share inodes with the pnpm store, so replace the file rather than writing in place.
  try {
    await rm(catalogPath);
    await writeFile(catalogPath, `${original} `);

    const { status, stdout, stderr } = await get();
    const { error } = JSON.parse(stdout);
    assert.deepEqual({ status, stderr, code: error.code }, { status: 14, stderr: '', code: 'MUXUI_CATALOG_INTEGRITY_MISMATCH' });
    assert.equal(error.nextCommand.effect, 'read-only');
  } finally {
    await rm(catalogPath, { force: true });
    await writeFile(catalogPath, original);
  }
});

// Also edits the installed package, so it restores the file. Release preparation rewrites the packed version to an rc,
// and the CLI must report that one, not the version it was packed with.
test('E-P2.1-02 a version rewritten in the installed package.json is the version the CLI reports', async () => {
  const manifestPath = join(await realpath(join(tuple.root, 'node_modules/@muxui/tooling')), 'package.json');
  const original = await readFile(manifestPath, 'utf8');
  const rewritten = '1.1.0-rc.2';
  assert.notEqual(JSON.parse(original).version, rewritten);

  // Installed files may share inodes with the pnpm store, so replace the file rather than writing in place.
  try {
    await rm(manifestPath);
    await writeFile(manifestPath, `${JSON.stringify({ ...JSON.parse(original), version: rewritten }, null, 2)}\n`);
    assert.deepEqual(await reportedVersions((args) => tuple.muxui(args)), reportedAs(rewritten));
  } finally {
    await rm(manifestPath, { force: true });
    await writeFile(manifestPath, original);
  }
});
