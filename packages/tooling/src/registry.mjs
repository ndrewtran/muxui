import {
  QUERY_RESPONSE_TYPES,
  QUERY_API_VERSIONS,
  QUERY_ENVELOPE_SCHEMA_ID,
  QUERY_SELECTORS,
  canonicalJson,
} from '@muxui/schema';
import { getManifest } from '@muxui/catalog';

const BASELINE_COMMANDS = ['get', 'list', 'manifest', 'search'];
const BASELINE_GLOBAL_OPTIONS = [
  'catalog-digest', 'catalog-version', 'dense', 'help', 'json', 'project',
];
const OUTPUT_OPTIONS = ['dense', 'help', 'json'];
const RESOLUTION_OPTIONS = ['catalog-digest', 'catalog-version', 'project'];
const BASELINE_SELECTORS = ['cursor', 'detail', 'limit', 'platform', 'purpose', 'query-api-version', 'section', 'uses'];
const UNAVAILABLE_COMMANDS = ['doctor', 'init', 'migrate', 'plan', 'validate'];
const DETAILS = ['brief', 'compact', 'full'];
const CATALOG_MANIFEST = getManifest({ detail: 'full' });
const CATALOG_OPERATIONS = CATALOG_MANIFEST.data.operations;
const CLI_AVAILABLE = CATALOG_MANIFEST.data.capabilities
  .find(({ id }) => id === 'muxui:capability:query-baseline')
  .availableOn.includes('cli');

function assertKeys(value, allowed, context) {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'CLI_REGISTRY_INVALID',
    `${context} must be an object`,
  );
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key)).sort(compareText);
  assert(
    unknown.length === 0,
    'CLI_REGISTRY_UNKNOWN_FIELD',
    `${context} has unknown fields: ${unknown.join(', ')}`,
  );
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assert(condition, code, message) {
  if (!condition) throw new Error(`${code}: ${message}`);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function optionMap(registry) {
  return new Map(
    [...registry.globalOptions, ...registry.selectors].map((option) => [option.name, option]),
  );
}

export function validateCommandRegistry(registry) {
  assert(
    registry && typeof registry === 'object' && !Array.isArray(registry),
    'CLI_REGISTRY_INVALID',
    'registry must be an object',
  );
  assert(registry.schemaVersion === '1.0.0', 'CLI_REGISTRY_INVALID', 'schemaVersion must be 1.0.0');
  assertKeys(registry, [
    'schemaVersion', 'cli', 'tokenizer', 'outputModes', 'bareJsonRecoveryCommand',
    'globalOptions', 'selectors', 'commands', 'unavailableCommands', 'surfacePolicy',
  ], 'registry');
  assertKeys(registry.cli, ['name', 'version', 'description'], 'registry.cli');
  assertKeys(registry.tokenizer, ['id', 'description'], 'registry.tokenizer');
  assert(registry.cli?.name === 'muxui', 'CLI_REGISTRY_INVALID', 'CLI name must be muxui');
  assert(
    typeof registry.cli.version === 'string'
      && typeof registry.cli.description === 'string'
      && registry.cli.description.length > 0,
    'CLI_REGISTRY_INVALID',
    'CLI version and description must be non-empty strings',
  );
  assert(
    registry.tokenizer.id === 'muxui-lexeme-v1'
      && typeof registry.tokenizer.description === 'string'
      && registry.tokenizer.description.length > 0,
    'CLI_TOKENIZER_INVALID',
    'tokenizer must declare the locked muxui-lexeme-v1 contract',
  );
  assert(
    canonicalJson(registry.outputModes) === canonicalJson(['human', 'json', 'dense']),
    'CLI_REGISTRY_INVALID',
    'output modes must be human, json, and dense',
  );

  const options = [...registry.globalOptions, ...registry.selectors];
  assert(unique(options.map(({ name }) => name)), 'CLI_REGISTRY_INVALID', 'option names must be unique');
  assert(unique(options.map(({ flag }) => flag)), 'CLI_REGISTRY_INVALID', 'option flags must be unique');
  const optionsByName = optionMap(registry);
  assert(
    canonicalJson(registry.globalOptions.map(({ name }) => name).sort(compareText))
      === canonicalJson(BASELINE_GLOBAL_OPTIONS),
    'CLI_OPTION_SURFACE_DRIFT',
    'global options must be the locked output and local-resolution options',
  );
  assert(
    canonicalJson(registry.selectors.map(({ name }) => name).sort(compareText))
      === canonicalJson(BASELINE_SELECTORS),
    'CLI_OPTION_SURFACE_DRIFT',
    'selectors must be exactly cursor, detail, limit, platform, purpose, query-api-version, section, and uses',
  );

  for (const option of registry.globalOptions) {
    assertKeys(
      option,
      ['name', 'flag', 'type', 'default', 'conflicts', 'description'],
      `registry.globalOptions.${option.name ?? 'unknown'}`,
    );
    const outputOption = OUTPUT_OPTIONS.includes(option.name);
    const resolutionOption = RESOLUTION_OPTIONS.includes(option.name);
    assert(
      ((outputOption && option.type === 'boolean' && typeof option.default === 'boolean')
        || (resolutionOption && option.type === 'string' && option.default === null))
        && Array.isArray(option.conflicts)
        && option.conflicts.every((name) => OUTPUT_OPTIONS.includes(name))
        && typeof option.description === 'string'
        && option.description.length > 0,
      'CLI_OPTION_REFERENCE_INVALID',
      `${option.name} must be a closed output or local-resolution option`,
    );
  }

  for (const selector of registry.selectors) {
    assertKeys(
      selector,
      ['name', 'flag', 'requestKey', 'type', 'choices', 'default', 'minimum', 'maximum'],
      `registry.selectors.${selector.name ?? 'unknown'}`,
    );
    if (QUERY_SELECTORS[selector.name]) {
      assert(
        canonicalJson(selector.choices) === canonicalJson(QUERY_SELECTORS[selector.name]),
        'CLI_SELECTOR_SCHEMA_DRIFT',
        `${selector.name} choices must come from @muxui/schema`,
      );
    }
    if (selector.name === 'query-api-version') {
      assert(
        canonicalJson(selector.choices) === canonicalJson(QUERY_API_VERSIONS),
        'CLI_SELECTOR_SCHEMA_DRIFT',
        'query-api-version choices must come from @muxui/schema',
      );
    }
    assert(
      ['integer', 'string'].includes(selector.type),
      'CLI_OPTION_REFERENCE_INVALID',
      `${selector.name} must use a supported selector type`,
    );
  }

  const commands = registry.commands.map(({ name }) => name);
  assert(unique(commands), 'CLI_REGISTRY_INVALID', 'command names must be unique');
  assert(
    canonicalJson([...commands].sort(compareText)) === canonicalJson(BASELINE_COMMANDS),
    'CLI_COMMAND_SURFACE_DRIFT',
    `baseline commands must be exactly ${BASELINE_COMMANDS.join(', ')}`,
  );

  for (const command of registry.commands) {
    assertKeys(command, [
      'name', 'summary', 'operation', 'arguments', 'options',
      'examples', 'budgetFixture', 'tokenBudgets',
    ], `registry.commands.${command.name ?? 'unknown'}`);
    assert(
      CATALOG_OPERATIONS[command.operation]?.available === true,
      'CLI_OPERATION_REFERENCE_INVALID',
      `${command.name} references unavailable catalog operation ${command.operation}`,
    );
    assert(
      typeof command.summary === 'string'
        && command.summary.length > 0
        && Array.isArray(command.examples)
        && command.examples.length > 0
        && command.examples.every((example) => typeof example === 'string' && example.length > 0),
      'CLI_COMMAND_SURFACE_DRIFT',
      `${command.name} must declare a summary and examples`,
    );
    command.responseType = CATALOG_OPERATIONS[command.operation].responseType;
    command.responseSchema = QUERY_ENVELOPE_SCHEMA_ID;
    assert(
      QUERY_RESPONSE_TYPES.includes(command.responseType),
      'CLI_RESPONSE_TYPE_DRIFT',
      `${command.name} references undeclared response type ${command.responseType}`,
    );
    assert(
      unique(command.options) && command.options.every((name) => optionsByName.has(name)),
      'CLI_OPTION_REFERENCE_INVALID',
      `${command.name} references an unknown or repeated option`,
    );
    assert(
      unique(command.arguments.map(({ name }) => name)),
      'CLI_ARGUMENT_INVALID',
      `${command.name} argument names must be unique`,
    );
    for (const argument of command.arguments) {
      assertKeys(
        argument,
        ['name', 'requestKey', 'required', 'type'],
        `registry.commands.${command.name}.arguments.${argument.name ?? 'unknown'}`,
      );
      assert(
        typeof argument.name === 'string'
          && argument.name.length > 0
          && typeof argument.required === 'boolean'
          && ['artifact-kind', 'string'].includes(argument.type),
        'CLI_ARGUMENT_INVALID',
        `${command.name} arguments must declare name, required, and supported type`,
      );
    }
    assert(
      command.arguments.every((argument) => (
        argument.requestKey === undefined
        || (typeof argument.requestKey === 'string' && argument.requestKey.length > 0)
      )),
      'CLI_ARGUMENT_INVALID',
      `${command.name} argument request keys must be non-empty strings`,
    );
    const operationRequestKeys = [
      ...command.arguments.map(({ name, requestKey }) => requestKey ?? name),
      ...command.options
        .filter((name) => !BASELINE_GLOBAL_OPTIONS.includes(name))
        .map((name) => optionsByName.get(name).requestKey ?? name),
    ].sort(compareText);
    assert(
      canonicalJson(operationRequestKeys)
        === canonicalJson(CATALOG_OPERATIONS[command.operation].requestKeys),
      'CLI_OPERATION_REQUEST_DRIFT',
      `${command.name} request keys must derive from ${command.operation}`,
    );
    assert(
      canonicalJson(Object.keys(command.tokenBudgets).sort(compareText)) === canonicalJson(DETAILS),
      'CLI_TOKEN_BUDGET_INVALID',
      `${command.name} must declare brief, compact, and full budgets`,
    );
    assert(
      command.budgetFixture && typeof command.budgetFixture === 'object'
        && !Array.isArray(command.budgetFixture),
      'CLI_TOKEN_BUDGET_INVALID',
      `${command.name} must declare its canonical budget fixture`,
    );
    for (const [detail, budget] of Object.entries(command.tokenBudgets)) {
      assert(
        Number.isInteger(budget) && budget > 0,
        'CLI_TOKEN_BUDGET_INVALID',
        `${command.name}.${detail} must be a positive integer`,
      );
    }
    const requestKeys = new Set([
      ...command.arguments.map(({ name }) => name),
      ...command.options.filter((name) => !BASELINE_GLOBAL_OPTIONS.includes(name)),
    ]);
    assert(
      Object.keys(command.budgetFixture).every((key) => requestKeys.has(key)),
      'CLI_TOKEN_BUDGET_INVALID',
      `${command.name} budget fixture contains an undeclared request field`,
    );
  }

  assert(unique(registry.commands.map(({ operation }) => operation)),
    'CLI_OPERATION_REFERENCE_INVALID', 'catalog operations must be mapped once');

  for (const unavailable of registry.unavailableCommands) {
    assertKeys(
      unavailable,
      ['name', 'earliestMilestone'],
      `registry.unavailableCommands.${unavailable.name ?? 'unknown'}`,
    );
    assert(
      typeof unavailable.earliestMilestone === 'string'
        && /^G\d+\.\d+$/u.test(unavailable.earliestMilestone),
      'CLI_COMMAND_SURFACE_DRIFT',
      `${unavailable.name} must declare an earliest milestone`,
    );
  }
  assert(
    unique(registry.unavailableCommands.map(({ name }) => name))
      && canonicalJson(registry.unavailableCommands.map(({ name }) => name).sort(compareText))
        === canonicalJson(UNAVAILABLE_COMMANDS),
    'CLI_COMMAND_SURFACE_DRIFT',
    'unavailable command names must match the locked command namespace',
  );

  assertKeys(registry.surfacePolicy, ['cli', 'mcp'], 'registry.surfacePolicy');
  assertKeys(
    registry.surfacePolicy.cli,
    ['effect', 'requiresConfirmation'],
    'registry.surfacePolicy.cli',
  );
  assertKeys(
    registry.surfacePolicy.mcp,
    ['available', 'effect', 'requiresConfirmation'],
    'registry.surfacePolicy.mcp',
  );

  assert(
    registry.commands.some(({ name }) => name === registry.bareJsonRecoveryCommand),
    'CLI_REGISTRY_INVALID',
    'bare JSON recovery command must be available',
  );
  assert(
    CLI_AVAILABLE === true
      && registry.surfacePolicy.cli.effect === 'read-only'
      && registry.surfacePolicy.cli.requiresConfirmation === false,
    'CLI_CAPABILITY_POLICY_INVALID',
    'baseline CLI must be available and read-only',
  );
  assert(
    registry.surfacePolicy.mcp.available === false,
    'CLI_CAPABILITY_POLICY_INVALID',
    'public MCP must remain unavailable in G0.3',
  );
  assert(
    registry.surfacePolicy.mcp.effect === 'read-only'
      && registry.surfacePolicy.mcp.requiresConfirmation === false,
    'CLI_CAPABILITY_POLICY_INVALID',
    'future MCP inputs must remain read-only and unavailable',
  );
  registry.surfacePolicy.cli.available = CLI_AVAILABLE;
  registry.unavailableCommands = registry.unavailableCommands.map((command) => ({
    ...command,
    capability: { available: false },
  }));
  return registry;
}

function helpFor(registry) {
  const lines = [
    `${registry.cli.name} ${registry.cli.version}`,
    registry.cli.description,
    '',
    'Usage: muxui <command> [arguments] [options]',
    '',
    'Commands:',
  ];
  for (const command of registry.commands) {
    const argumentsText = command.arguments
      .map((argument) => argument.required ? `<${argument.name}>` : `[${argument.name}]`)
      .join(' ');
    lines.push(`  ${command.name}${argumentsText ? ` ${argumentsText}` : ''}  ${command.summary}`);
  }
  lines.push('', 'Output: --json | --dense (human is the default)', 'Recovery: muxui --json');
  return `${lines.join('\n')}\n`;
}

function commandHelp(registry, command, optionsByName) {
  const argumentsText = command.arguments
    .map((argument) => argument.required ? `<${argument.name}>` : `[${argument.name}]`)
    .join(' ');
  const lines = [
    `Usage: muxui ${command.name}${argumentsText ? ` ${argumentsText}` : ''} [options]`,
    '',
    command.summary,
    '',
    'Options:',
  ];
  for (const name of command.options) {
    const option = optionsByName.get(name);
    const value = option.type === 'boolean' ? '' : ` <${option.name}>`;
    const choices = option.choices ? ` (${option.choices.join('|')})` : '';
    lines.push(`  ${option.flag}${value}${choices}`);
  }
  lines.push('', 'Examples:', ...command.examples.map((example) => `  ${example}`));
  return `${lines.join('\n')}\n`;
}

function inputSchema(command, optionsByName) {
  const properties = {};
  const required = [];
  for (const argument of command.arguments) {
    properties[argument.name] = { type: 'string' };
    if (argument.required) required.push(argument.name);
  }
  for (const name of command.options) {
    if (BASELINE_GLOBAL_OPTIONS.includes(name)) continue;
    const option = optionsByName.get(name);
    properties[name] = option.type === 'integer'
      ? { type: 'integer', minimum: option.minimum, maximum: option.maximum }
      : { type: 'string', ...(option.choices ? { enum: option.choices } : {}) };
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function manifestCommand(command, optionsByName, capability) {
  return {
    name: command.name,
    summary: command.summary,
    operation: command.operation,
    arguments: command.arguments,
    options: command.options.map((name) => optionsByName.get(name)),
    responseType: command.responseType,
    responseSchema: command.responseSchema,
    outputModes: ['human', 'json', 'dense'],
    tokenBudgets: command.tokenBudgets,
    budgetFixture: command.budgetFixture,
    examples: command.examples,
    capability,
  };
}

export function buildCommandProjections(input) {
  const registry = validateCommandRegistry(structuredClone(input));
  const optionsByName = optionMap(registry);
  const commands = registry.commands.map((command) => manifestCommand(
    command,
    optionsByName,
    registry.surfacePolicy.cli,
  ));
  const helpByCommand = Object.fromEntries(
    registry.commands.map((command) => [command.name, commandHelp(registry, command, optionsByName)]),
  );
  const parserMetadata = {
    cli: registry.cli,
    bareJsonRecoveryCommand: registry.bareJsonRecoveryCommand,
    globalOptions: registry.globalOptions,
    commands,
  };
  const cliManifest = getManifest({ detail: 'full' }).data.cli;
  const mcpInputSchemas = registry.commands.map((command) => ({
    name: command.name,
    available: false,
    operation: command.operation,
    inputSchema: inputSchema(command, optionsByName),
  }));
  const completionScript = [
    '# generated from the Mux UI command registry',
    '_muxui_complete() {',
    `  local commands="${registry.commands.map(({ name }) => name).join(' ')}"`,
    '  COMPREPLY=( $(compgen -W "$commands" -- "${COMP_WORDS[1]}") )',
    '}',
    'complete -F _muxui_complete muxui',
    '',
  ].join('\n');
  const responseTypes = [
    "import type { QueryResponseType } from '@muxui/schema/types';",
    '',
    ...registry.commands.map((command) => (
      `export type ${command.name[0].toUpperCase()}${command.name.slice(1)}ResponseType = Extract<QueryResponseType, ${JSON.stringify(command.responseType)}>;`
    )),
    '',
  ].join('\n');
  return {
    commandRegistry: registry,
    parserMetadata,
    helpText: helpFor(registry),
    helpByCommand,
    completionScript,
    cliManifest,
    mcpInputSchemas,
    responseTypes,
  };
}

export function commandSurfaceModule(projections) {
  return [
    `export const commandRegistry = Object.freeze(${canonicalJson(projections.commandRegistry)});`,
    `export const parserMetadata = Object.freeze(${canonicalJson(projections.parserMetadata)});`,
    `export const helpText = ${JSON.stringify(projections.helpText)};`,
    `export const helpByCommand = Object.freeze(${canonicalJson(projections.helpByCommand)});`,
    `export const completionScript = ${JSON.stringify(projections.completionScript)};`,
    `export const cliManifest = Object.freeze(${canonicalJson(projections.cliManifest)});`,
    `export const mcpInputSchemas = Object.freeze(${canonicalJson(projections.mcpInputSchemas)});`,
    '',
  ].join('\n');
}
