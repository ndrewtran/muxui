import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getArtifact,
  getManifest,
  listArtifacts,
  searchArtifacts,
} from '@muxui/catalog';
import {
  QUERY_ENVELOPE_SCHEMA_ID,
  validateFamily,
} from '@muxui/schema';
import {
  cliManifest,
  commandRegistry,
  completionScript,
  helpText,
  mcpInputSchemas,
  parserMetadata,
} from '../generated/command-surface.mjs';
import {
  assertSafeDiagnostics,
  countTokens,
  executeCommand,
  parseDense,
  parseCliArguments,
  parseHuman,
  renderDense,
  renderHuman,
  renderJson,
  runCli,
  tokenBudgetFor,
} from '../src/index.mjs';
import { buildCommandProjections } from '../src/registry.mjs';
import { resolvePnpmProjectCatalog } from '../src/pnpm-adapter.mjs';

const details = ['brief', 'compact', 'full'];
const commandCases = {
  manifest: (detail) => ({ args: ['manifest', '--detail', detail], request: { detail } }),
  list: (detail) => ({ args: ['list', '--detail', detail], request: { detail, limit: 20, platform: null, purpose: null, cursor: null, kind: null } }),
  search: (detail) => ({ args: ['search', 'button', '--detail', detail], request: { detail, limit: 20, platform: null, purpose: null, cursor: null, query: 'button' } }),
  get: (detail) => ({ args: ['get', 'muxui:component:button', '--detail', detail], request: { detail, platform: null, purpose: null, section: null, 'id-or-alias': 'muxui:component:button' } }),
};

function jsonResult(args) {
  const result = runCli([...args, '--json']);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function processJsonResult(args) {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../bin/muxui.mjs', import.meta.url)),
    ...args,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('public tooling entrypoint keeps project resolution internal', async () => {
  const tooling = await import('@muxui/tooling');
  assert.equal(Object.hasOwn(tooling, 'resolvePnpmProjectCatalog'), false);
});

test('E-G0.3-01 programmatic and CLI JSON surfaces return the same responses', () => {
  const resolution = resolvePnpmProjectCatalog();
  assert.equal(resolution.type, 'success');
  const catalogManifest = resolution.api.getManifest({ detail: 'full' });
  assert.deepEqual(
    jsonResult(['manifest', '--detail', 'full']),
    catalogManifest,
  );
  assert.deepEqual(
    processJsonResult(['manifest', '--detail', 'full']),
    catalogManifest,
  );
  assert.deepEqual(
    jsonResult(['list', '--detail', 'compact']),
    resolution.api.listArtifacts({ detail: 'compact', limit: 20, platform: null, purpose: null, cursor: null, kind: null }),
  );
  assert.deepEqual(
    jsonResult(['search', 'button', '--detail', 'brief']),
    resolution.api.searchArtifacts({ query: 'button', detail: 'brief', limit: 20, platform: null, purpose: null, cursor: null }),
  );
  assert.deepEqual(
    jsonResult(['get', 'muxui:component:button', '--detail', 'full']),
    resolution.api.getArtifact({ id: 'muxui:component:button', platform: null, detail: 'full', purpose: null, section: null }),
  );
  for (const undeclaredAlias of ['button', 'Button']) {
    const result = runCli(['get', undeclaredAlias, '--json']);
    assert.equal(result.exitCode, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'MUXUI_QUERY_INVALID');
  }
  const manifestDrift = structuredClone(catalogManifest);
  delete manifestDrift.data.cli;
  assert.throws(() => assert.deepEqual(manifestDrift, catalogManifest));
});

test('E-G0.3-02 human, JSON, and dense projections preserve one response object', () => {
  const response = executeCommand('get', {
    'id-or-alias': 'muxui:component:button',
    platform: 'web.react',
    detail: 'compact',
    purpose: null,
    section: null,
  });
  assert.deepEqual(JSON.parse(renderJson(response)), response);
  assert.deepEqual(parseDense(renderDense(response)), response);
  assert.deepEqual(parseHuman(renderHuman(response)), response);
  assert.equal(response.data.artifact.id, 'muxui:component:button');
  assert.equal(response.meta.platform, 'web.react');
  assert.match(response.meta.revisions.bindingSpec, /^sha256:/);
  assert.equal(response.meta.resolution.authority, 'advisory');
  assert.equal(response.meta.resolution.compatibility, 'unresolved');
  assert.equal(response.meta.resolution.catalogSource, 'package');
});

test('muxui get negotiates 1.1/1.2/2.0 and preserves page compatibility', () => {
  const parsed = parseCliArguments([
    'get', 'muxui:token:default-theme', '--query-api-version', '1.2.0',
    '--section', 'tokens', '--limit', '1', '--json',
  ]);
  assert.equal(parsed.request.queryApiVersion, '1.2.0');
  assert.equal(parsed.request.limit, 1);
  assert.equal(parsed.request.section, 'tokens');

  const page = executeCommand('get', parsed.request);
  assert.equal(page.responseType, 'artifact.detail.section-page');
  assert.equal(page.entries.status, 'available');
  assert.equal(page.entries.items.length, 1);
  assert.deepEqual(JSON.parse(renderJson(page)), page);
  assert.deepEqual(parseDense(renderDense(page)), page);
  assert.deepEqual(parseHuman(renderHuman(page)), page);
  assert.ok(countTokens(renderDense(page)) <= 2048);

  const sourceCrosswalk = jsonResult([
    'get', 'muxui:token:default-theme', '--query-api-version', '1.2.0',
    '--section', 'source-crosswalk',
  ]);
  assert.deepEqual(sourceCrosswalk.entries, {
    status: 'absent',
    reason: 'token-source-omits-source-crosswalk',
    tokenSourceSchemaVersion: '2.1.0',
    items: [],
  });

  const historical = jsonResult([
    'get', 'muxui:token:default-theme', '--query-api-version', '1.1.0', '--detail', 'full',
  ]);
  assert.equal(historical.apiVersion, '1.1.0');
  assert.deepEqual(historical.warnings, []);
  assert.ok(Object.hasOwn(historical.data.artifact, 'tokens'));

  for (const args of [
    ['get', 'muxui:component:missing', '--query-api-version', '1.1.0', '--json'],
    [
      'get', 'muxui:token:default-theme', '--query-api-version', '1.1.0',
      '--cursor', 'not-a-cursor', '--json',
    ],
  ]) {
    const error = JSON.parse(runCli(args).stdout);
    assert.equal(error.type, 'error');
    assert.equal(error.apiVersion, '1.1.0');
  }

  const current = runCli([
    'get', 'muxui:token:default-theme', '--query-api-version', '2.0.0', '--json',
  ]);
  assert.equal(current.exitCode, 0);
  const currentResponse = JSON.parse(current.stdout);
  assert.equal(currentResponse.apiVersion, '2.0.0');
  assert.equal(Object.hasOwn(currentResponse.data.artifact, 'tokens'), false);
  assert.deepEqual(currentResponse.data.artifact.availableSections, ['tokens']);
  const removedCurrentIdentity = runCli([
    'get', 'muxui:token:button-minimum', '--query-api-version', '2.0.0', '--json',
  ]);
  assert.equal(removedCurrentIdentity.exitCode, 4);
  assert.equal(JSON.parse(removedCurrentIdentity.stdout).error.code, 'MUXUI_ARTIFACT_NOT_FOUND');
});

test('E-G0.3-03 dense outputs round-trip deterministically within every locked budget', () => {
  for (const [command, makeCase] of Object.entries(commandCases)) {
    for (const detail of details) {
      const { request } = makeCase(detail);
      const definition = commandRegistry.commands.find(({ name }) => name === command);
      const response = executeCommand(command, { ...request, ...definition.budgetFixture });
      const first = renderDense(response);
      const second = renderDense(response);
      assert.equal(first, second, `${command}.${detail} must be deterministic`);
      assert.deepEqual(parseDense(first), response, `${command}.${detail} must round-trip`);
      assert.ok(
        countTokens(first) <= tokenBudgetFor(commandRegistry, command, detail),
        `${command}.${detail} exceeded its token budget`,
      );
    }
  }
});

test('E-G0.3-03 dense golden snapshots remain stable', async () => {
  const goldenCases = {
    'manifest-brief.txt': executeCommand('manifest', { detail: 'brief' }),
    'list-brief.txt': executeCommand('list', { ...commandCases.list('brief').request, limit: 1 }),
    'search-brief.txt': executeCommand('search', { ...commandCases.search('brief').request, limit: 1 }),
    'get-compact.txt': executeCommand('get', commandCases.get('compact').request),
  };
  for (const [name, response] of Object.entries(goldenCases)) {
    const expected = await readFile(new URL(`goldens/${name}`, import.meta.url), 'utf8');
    assert.equal(renderDense(response), expected, name);
  }
});

test('E-G0.3-04 registry generates parser, help, completion, manifest, types, and future MCP inputs', async () => {
  const names = commandRegistry.commands.map(({ name }) => name);
  assert.deepEqual(names, ['manifest', 'list', 'search', 'get']);
  assert.deepEqual(parserMetadata.commands.map(({ name }) => name), names);
  assert.deepEqual(cliManifest.commands.map(({ name }) => name), names);
  assert.deepEqual(mcpInputSchemas.map(({ name }) => name), names);
  assert.ok(mcpInputSchemas.every(({ available }) => available === false));
  assert.ok(mcpInputSchemas.every(({ inputSchema }) => (
    !Object.hasOwn(inputSchema.properties, 'project')
    && !Object.hasOwn(inputSchema.properties, 'catalog-version')
    && !Object.hasOwn(inputSchema.properties, 'catalog-digest')
  )));
  const catalogCliAvailable = jsonResult(['manifest', '--detail', 'full'])
    .data.capabilities
    .find(({ id }) => id === 'muxui:capability:query-baseline')
    .availableOn.includes('cli');
  assert.equal(commandRegistry.surfacePolicy.cli.available, catalogCliAvailable);
  for (const name of names) {
    assert.match(helpText, new RegExp(`\\b${name}\\b`));
    assert.match(completionScript, new RegExp(`\\b${name}\\b`));
  }
  const types = await readFile(new URL('../generated/response-types.d.ts', import.meta.url), 'utf8');
  for (const command of commandRegistry.commands) {
    assert.match(types, new RegExp(command.responseType));
    assert.equal(command.responseSchema, QUERY_ENVELOPE_SCHEMA_ID);
    assert.equal(
      parserMetadata.commands.find(({ name }) => name === command.name).responseSchema,
      QUERY_ENVELOPE_SCHEMA_ID,
    );
    assert.equal(
      cliManifest.commands.find(({ name }) => name === command.name).responseSchema,
      QUERY_ENVELOPE_SCHEMA_ID,
    );
  }
  const authoredRegistry = JSON.parse(await readFile(
    new URL('../command-registry.json', import.meta.url),
    'utf8',
  ));
  assert.ok(authoredRegistry.commands.every((command) => !Object.hasOwn(command, 'responseType')));
  assert.deepEqual(
    commandRegistry.commands.map(({ operation, responseType }) => ({ operation, responseType })),
    getManifest({ detail: 'full' }).data.cli.commands
      .map(({ operation, responseType }) => ({ operation, responseType })),
  );
  const manifest = getManifest({ detail: 'full' });
  validateFamily('query-envelope', manifest);
  for (const mutate of [
    (value) => { delete value.data.cli; },
    (value) => { value.data.cli = 'not-an-object'; },
    (value) => { delete value.data.operations.getManifest.responseType; },
    (value) => { value.data.operations.getManifest.undocumented = true; },
    (value) => { delete value.data.cli.commands[0].responseSchema; },
  ]) {
    const malformed = structuredClone(manifest);
    mutate(malformed);
    assert.throws(() => validateFamily('query-envelope', malformed), /MUXUI_SCHEMA_INVALID/);
  }

  const extra = structuredClone(authoredRegistry);
  extra.commands.push({ ...extra.commands[0], name: 'doctor' });
  assert.throws(() => buildCommandProjections(extra), /CLI_COMMAND_SURFACE_DRIFT/);
  const duplicateResponseOwner = structuredClone(authoredRegistry);
  duplicateResponseOwner.commands[0].responseType = 'catalog.manifest';
  assert.throws(() => buildCommandProjections(duplicateResponseOwner), /CLI_REGISTRY_UNKNOWN_FIELD/);
  const duplicateSchemaOwner = structuredClone(authoredRegistry);
  duplicateSchemaOwner.commands[0].responseSchema = QUERY_ENVELOPE_SCHEMA_ID;
  assert.throws(() => buildCommandProjections(duplicateSchemaOwner), /CLI_REGISTRY_UNKNOWN_FIELD/);
  const selectorDrift = structuredClone(authoredRegistry);
  selectorDrift.selectors.find(({ name }) => name === 'detail').choices.push('verbose');
  assert.throws(() => buildCommandProjections(selectorDrift), /CLI_SELECTOR_SCHEMA_DRIFT/);
  const operationDrift = structuredClone(authoredRegistry);
  operationDrift.commands[0].operation = 'planComposition';
  assert.throws(() => buildCommandProjections(operationDrift), /CLI_OPERATION_REFERENCE_INVALID/);
  const requestKeyDrift = structuredClone(authoredRegistry);
  requestKeyDrift.commands.find(({ name }) => name === 'get').arguments[0].requestKey = 'alias';
  assert.throws(() => buildCommandProjections(requestKeyDrift), /CLI_OPERATION_REQUEST_DRIFT/);
  const optionDrift = structuredClone(authoredRegistry);
  optionDrift.commands.find(({ name }) => name === 'search').options.push('section');
  assert.throws(() => buildCommandProjections(optionDrift), /CLI_OPERATION_REQUEST_DRIFT/);
  const unknownField = structuredClone(authoredRegistry);
  unknownField.undocumented = true;
  assert.throws(() => buildCommandProjections(unknownField), /CLI_REGISTRY_UNKNOWN_FIELD/);
  const nestedUnknownField = structuredClone(authoredRegistry);
  nestedUnknownField.commands[0].arguments.push({
    name: 'extra',
    required: false,
    type: 'string',
    undocumented: true,
  });
  assert.throws(() => buildCommandProjections(nestedUnknownField), /CLI_REGISTRY_UNKNOWN_FIELD/);
  const tokenizerDrift = structuredClone(authoredRegistry);
  tokenizerDrift.tokenizer.id = 'approximate';
  assert.throws(() => buildCommandProjections(tokenizerDrift), /CLI_TOKENIZER_INVALID/);
  const duplicateAvailabilityOwner = structuredClone(authoredRegistry);
  duplicateAvailabilityOwner.surfacePolicy.cli.available = true;
  assert.throws(() => buildCommandProjections(duplicateAvailabilityOwner), /CLI_REGISTRY_UNKNOWN_FIELD/);
  const duplicateUnavailableOwner = structuredClone(authoredRegistry);
  duplicateUnavailableOwner.unavailableCommands[0].capability = { available: false };
  assert.throws(() => buildCommandProjections(duplicateUnavailableOwner), /CLI_REGISTRY_UNKNOWN_FIELD/);
});

test('G0.4 project and cache inputs stay outside query selectors and require an exact pair', () => {
  const parsed = parseCliArguments([
    'manifest', '--project', 'apps/consumer', '--catalog-version', '1.0.0',
    '--catalog-digest', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '--json',
  ]);
  assert.equal(parsed.kind, 'command');
  assert.deepEqual(parsed.request, { detail: 'compact' });
  assert.deepEqual(parsed.resolution, {
    project: 'apps/consumer',
    cache: {
      version: '1.0.0',
      digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  });
  const unpaired = parseCliArguments(['manifest', '--catalog-version', '1.0.0', '--json']);
  assert.equal(unpaired.error.error.code, 'MUXUI_QUERY_INVALID');
  assert.equal(unpaired.error.error.ruleId, 'cli.resolution.cache-tuple');
});

test('E-G0.3-05 structured errors have stable codes, safe actions, and meaningful exits', () => {
  const fixtures = [
    { args: ['unknown', '--json'], code: 'MUXUI_QUERY_INVALID', exitCode: 2 },
    { args: ['list', '--detail', 'verbose', '--json'], code: 'MUXUI_QUERY_INVALID', exitCode: 2 },
    { args: ['list', '--cursor', 'wrong', '--json'], code: 'MUXUI_CURSOR_INVALID', exitCode: 3 },
    { args: ['get', 'muxui:component:missing', '--json'], code: 'MUXUI_ARTIFACT_NOT_FOUND', exitCode: 4 },
  ];
  for (const fixture of fixtures) {
    const result = runCli(fixture.args);
    assert.equal(result.exitCode, fixture.exitCode);
    assert.equal(result.stderr, '');
    const response = JSON.parse(result.stdout);
    assert.equal(response.type, 'error');
    assert.equal(response.error.code, fixture.code);
    assert.equal(typeof response.error.details, 'object');
    assert.equal(response.error.nextCommand.effect, 'read-only');
    assert.equal(response.error.nextCommand.requiresConfirmation, false);
  }
  assert.throws(() => assertSafeDiagnostics({
    apiVersion: '1.1.0',
    type: 'error',
    error: {
      code: 'MUXUI_QUERY_INVALID',
      ruleId: 'cli.fixture.unsafe',
      message: 'unsafe fixture',
      retryable: false,
      details: {},
      nextCommand: {
        command: 'muxui init',
        effect: 'project-write',
        requiresConfirmation: false,
      },
    },
  }), /CLI_UNSAFE_NEXT_COMMAND/);
  const human = runCli(['get', 'muxui:component:missing']);
  assert.equal(human.stdout, '');
  assert.match(human.stderr, /MUXUI_ARTIFACT_NOT_FOUND/);
});

test('E-G0.3-05 process boundary keeps JSON singular and diagnostics off stderr', () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../bin/muxui.mjs', import.meta.url)),
    'get',
    'muxui:component:missing',
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 4);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).error.code, 'MUXUI_ARTIFACT_NOT_FOUND');
  assert.equal(result.stdout.trim().split('\n').length, 1);
});

test('E-G0.3-06 bare JSON cold start discovers manifest and retrieves without repository crawling', () => {
  const manifestResult = runCli(['--json']);
  assert.equal(manifestResult.exitCode, 0);
  const manifest = JSON.parse(manifestResult.stdout);
  assert.equal(manifest.type, 'catalog.manifest');
  assert.deepEqual(manifest.data.cli.commands.map(({ name }) => name), [
    'manifest', 'list', 'search', 'get',
  ]);
  assert.deepEqual(
    manifest.data.capabilities.find(({ id }) => id === 'muxui:capability:query-baseline').availableOn,
    ['api', 'cli'],
  );
  const search = jsonResult(['search', 'button', '--detail', 'brief']);
  const id = search.data.items.find(({ name }) => name === 'Button').id;
  const detail = jsonResult(['get', id, '--detail', 'compact']);
  assert.equal(detail.data.artifact.id, 'muxui:component:button');
  assert.equal(detail.meta.resolution.catalogSource, 'project');
});
