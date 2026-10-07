import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCatalogApi } from '@muxui/catalog';
import { commandRegistry, helpByCommand } from '../generated/command-surface.mjs';
import {
  countTokens,
  executeCommand,
  parseCliArguments,
  parseDense,
  parseHuman,
  renderDense,
  renderHuman,
  renderJson,
  runCli,
  tokenBudgetFor,
} from '../src/index.mjs';
import { buildCommandProjections } from '../src/registry.mjs';
import { compileFixtureBundle } from './pattern-fixture.mjs';

const patternId = 'muxui:pattern:poster-grid';
const variantIds = ['muxui:example:poster-grid-css', 'muxui:example:poster-grid-virtualized'];

const compileFixtureApi = async () => createCatalogApi(await compileFixtureBundle());

let shared;
const fixtureApi = () => (shared ??= compileFixtureApi());

function run(api, args) {
  const parsed = parseCliArguments(args);
  assert.equal(parsed.kind, 'command', args.join(' '));
  return executeCommand(parsed.command, parsed.request, api);
}

test('--uses parses on list and search only, and the registry owns it', async () => {
  const list = parseCliArguments(['list', 'pattern', '--uses', 'muxui:component:button', '--dense']);
  assert.equal(list.mode, 'dense');
  assert.deepEqual(list.request, {
    kind: 'pattern',
    platform: null,
    detail: 'compact',
    purpose: null,
    limit: 20,
    cursor: null,
    uses: 'muxui:component:button',
  });
  const search = parseCliArguments(['search', 'grid', '--uses', 'muxui:component:grid-list']);
  assert.equal(search.request.uses, 'muxui:component:grid-list');
  assert.equal(parseCliArguments(['list']).request.uses, null);
  assert.equal(parseCliArguments(['search', 'grid']).request.uses, null);
  assert.equal(parseCliArguments(['get', patternId, '--uses', 'muxui:component:button']).error.error.ruleId, 'cli.option.unknown');
  assert.equal(parseCliArguments(['list', '--uses']).error.error.ruleId, 'cli.option.value');
  for (const command of ['list', 'search']) assert.match(helpByCommand[command], /--uses <uses>/u);
  assert.doesNotMatch(helpByCommand.get, /--uses/u);

  const authored = JSON.parse(await readFile(new URL('../command-registry.json', import.meta.url), 'utf8'));
  assert.ok(authored.selectors.some(({ name }) => name === 'uses'));
  const drifted = structuredClone(authored);
  drifted.selectors = drifted.selectors.filter(({ name }) => name !== 'uses');
  assert.throws(() => buildCommandProjections(drifted), /CLI_OPTION_SURFACE_DRIFT/u);
  const unrouted = structuredClone(authored);
  unrouted.commands.find(({ name }) => name === 'get').options.push('uses');
  assert.throws(() => buildCommandProjections(unrouted), /CLI_OPERATION_REQUEST_DRIFT/u);
  const dropped = structuredClone(authored);
  dropped.commands.find(({ name }) => name === 'search').options = dropped.commands
    .find(({ name }) => name === 'search').options.filter((name) => name !== 'uses');
  assert.throws(() => buildCommandProjections(dropped), /CLI_OPERATION_REQUEST_DRIFT/u);
});

test('E-BL1-07: pattern list, search, and get keep one response across JSON, human, and dense', async () => {
  const api = await fixtureApi();
  const requests = [
    ['list', 'pattern'],
    ['list', '--uses', 'muxui:component:grid-list'],
    ['search', 'poster', '--uses', 'muxui:component:virtualizer'],
    ['get', patternId],
    ['get', patternId, '--detail', 'full'],
    ['get', patternId, '--section', 'examples'],
    ['get', 'muxui:component:grid-list'],
    ['get', 'muxui:component:grid-list', '--detail', 'full'],
    ['get', 'muxui:example:poster-grid-css'],
  ];
  for (const args of requests) {
    for (const detail of args[0] === 'get' && args.includes('--detail') ? [null] : ['brief', 'compact', 'full']) {
      const response = run(api, detail === null ? args : [...args, '--detail', detail]);
      assert.notEqual(response.type, 'error', args.join(' '));
      assert.deepEqual(JSON.parse(renderJson(response)), response, args.join(' '));
      assert.deepEqual(parseDense(renderDense(response)), response, args.join(' '));
      assert.deepEqual(parseHuman(renderHuman(response)), response, args.join(' '));
    }
  }
  // Both projections carry the exact variant source in authored order.
  const examples = run(api, ['get', patternId, '--section', 'examples']);
  assert.deepEqual(examples.data.value.map(({ id }) => id), variantIds);
  assert.equal(parseDense(renderDense(examples)).data.value[0].code, examples.data.value[0].code);
});

test('E-BL1-07: the --uses matrix and pattern pages stay inside the dense budgets', async () => {
  const api = await fixtureApi();
  const uses = (component, command = 'list') => run(
    api,
    command === 'list' ? ['list', '--uses', component] : ['search', 'poster', '--uses', component],
  );
  assert.deepEqual(uses('muxui:component:grid-list').data.items.map(({ id }) => id), [patternId]);
  assert.deepEqual(uses('muxui:component:button').data.items, []);
  assert.deepEqual(uses('muxui:component:virtualizer', 'search').data.items.map(({ id }) => id), [patternId]);
  assert.equal(run(api, ['list', '--uses', 'grid-list']).error.code, 'MUXUI_QUERY_INVALID');
  assert.equal(run(api, ['search', 'poster', '--uses', 'muxui:component:missing']).error.code, 'MUXUI_ARTIFACT_NOT_FOUND');

  const budgeted = {
    list: ['list', 'pattern', '--limit', '1'],
    search: ['search', 'poster', '--limit', '1'],
    get: ['get', patternId],
  };
  for (const [command, args] of Object.entries(budgeted)) {
    for (const detail of ['brief', 'compact', 'full']) {
      const response = run(api, [...args, '--detail', detail]);
      assert.notEqual(response.type, 'error', `${command}.${detail}`);
      const dense = renderDense(response);
      assert.equal(renderDense(response), dense);
      assert.ok(
        countTokens(dense) <= tokenBudgetFor(commandRegistry, command, detail),
        `${command}.${detail} used ${countTokens(dense)} lexemes`,
      );
    }
  }
  // The component page that gains `usedIn` also stays inside its tier.
  for (const detail of ['compact', 'full']) {
    const dense = renderDense(run(api, ['get', 'muxui:component:virtualizer', '--detail', detail]));
    assert.ok(countTokens(dense) <= tokenBudgetFor(commandRegistry, 'get', detail), detail);
  }
});

test('E-BL1-07: the real catalog enables pattern with no records and rejects bad --uses', () => {
  const empty = JSON.parse(runCli(['list', 'pattern', '--json']).stdout);
  assert.deepEqual(empty.data.items, []);
  const manifest = JSON.parse(runCli(['manifest', '--detail', 'brief', '--json']).stdout);
  assert.ok(manifest.data.artifactKinds.includes('pattern'));
  const none = runCli(['list', '--uses', 'muxui:component:button', '--json']);
  assert.equal(none.exitCode, 0);
  assert.deepEqual(JSON.parse(none.stdout).data.items, []);

  const invalid = runCli(['list', '--uses', 'button', '--json']);
  assert.equal(invalid.exitCode, 2);
  assert.equal(JSON.parse(invalid.stdout).error.code, 'MUXUI_QUERY_INVALID');
  const missing = runCli(['search', 'grid', '--uses', 'muxui:component:missing', '--json']);
  assert.equal(missing.exitCode, 4);
  const { error } = JSON.parse(missing.stdout);
  assert.equal(error.code, 'MUXUI_ARTIFACT_NOT_FOUND');
  assert.match(error.nextCommand.command, /^muxui search "muxui:component:missing"/u);
});
