import { canonicalJson } from '@muxui/schema';
import { valid } from 'semver';
import {
  helpByCommand,
  helpText,
  parserMetadata,
} from '../generated/command-surface.mjs';
import { API_VERSION } from '@muxui/schema';
import { TOOLING_VERSION } from './version.mjs';

function usageError(ruleId, message, details, nextCommand = 'muxui --json') {
  return {
    apiVersion: API_VERSION,
    type: 'error',
    error: {
      code: 'MUXUI_QUERY_INVALID',
      ruleId,
      message,
      retryable: true,
      details,
      nextCommand: {
        command: nextCommand,
        effect: 'read-only',
        requiresConfirmation: false,
      },
    },
  };
}

function optionMap(command) {
  return new Map(command.options.map((option) => [option.flag, option]));
}

function outputMode(values) {
  if (values.json) return 'json';
  if (values.dense) return 'dense';
  return 'human';
}

function parseOptionValue(option, value) {
  if (option.type === 'integer') {
    if (!/^[0-9]+$/.test(value)) return { invalid: true };
    const parsed = Number(value);
    if (parsed < option.minimum || parsed > option.maximum) return { invalid: true };
    return { value: parsed };
  }
  if (option.choices && !option.choices.includes(value)) return { invalid: true };
  return { value };
}

export function parseCliArguments(args) {
  if (!Array.isArray(args) || args.some((value) => typeof value !== 'string')) {
    return { mode: 'human', error: usageError(
      'cli.arguments.array',
      'CLI arguments must be strings.',
      {},
    ) };
  }
  if (args.length === 0 || canonicalJson(args) === canonicalJson(['--help'])) {
    return {
      kind: 'help',
      mode: 'human',
      text: `${parserMetadata.cli.name} ${TOOLING_VERSION}\n${helpText}`,
    };
  }
  if (canonicalJson(args) === canonicalJson(['--json'])) {
    return { kind: 'command', command: 'manifest', mode: 'json', request: { detail: 'compact' } };
  }

  const requestedMode = args.includes('--json') ? 'json' : args.includes('--dense') ? 'dense' : 'human';

  const [commandName, ...tokens] = args;
  const command = parserMetadata.commands.find(({ name }) => name === commandName);
  if (!command) {
    return { mode: requestedMode, error: usageError(
      'cli.command.unknown',
      `Unknown or unavailable command ${JSON.stringify(commandName)}.`,
      { command: commandName },
    ) };
  }

  const options = optionMap(command);
  const values = Object.fromEntries(command.options.map((option) => [option.name, option.default]));
  const positionals = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const option = options.get(token);
    if (!option) {
      return { mode: requestedMode, error: usageError(
        'cli.option.unknown',
        `${commandName} does not declare option ${JSON.stringify(token)}.`,
        { command: commandName, option: token },
        `muxui ${commandName} --help`,
      ) };
    }
    if (option.type === 'boolean') {
      values[option.name] = true;
      continue;
    }
    const raw = tokens[index + 1];
    if (raw === undefined || raw.startsWith('--')) {
      return { mode: requestedMode, error: usageError(
        'cli.option.value',
        `${option.flag} requires a value.`,
        { command: commandName, option: option.name },
        `muxui ${commandName} --help`,
      ) };
    }
    index += 1;
    const parsed = parseOptionValue(option, raw);
    if (parsed.invalid) {
      return { mode: requestedMode, error: usageError(
        'cli.option.value',
        `${option.flag} received an invalid value.`,
        { command: commandName, option: option.name, value: raw },
        `muxui ${commandName} --help`,
      ) };
    }
    values[option.name] = parsed.value;
  }

  for (const option of command.options) {
    if (!values[option.name]) continue;
    for (const conflict of option.conflicts ?? []) {
      if (values[conflict]) {
        return { mode: 'json', error: usageError(
          'cli.option.conflict',
          `${option.flag} conflicts with --${conflict}.`,
          { command: commandName, options: [option.name, conflict].sort() },
          `muxui ${commandName} --help`,
        ) };
      }
    }
  }

  const mode = outputMode(values);
  if (values.help) return { kind: 'help', mode: 'human', text: helpByCommand[commandName] };
  if (Boolean(values['catalog-version']) !== Boolean(values['catalog-digest'])) {
    return { mode, error: usageError(
      'cli.resolution.cache-tuple',
      '--catalog-version and --catalog-digest must be provided together.',
      { command: commandName, fields: ['catalog-digest', 'catalog-version'] },
      `muxui ${commandName} --help`,
    ) };
  }
  if (
    values.project !== null
    && (
      values.project.startsWith('/')
      || /^[A-Za-z]:[\\/]/u.test(values.project)
      || values.project.split('/').includes('..')
      || !/^[A-Za-z0-9._/-]+$/u.test(values.project)
    )
  ) {
    return { mode, error: usageError(
      'cli.resolution.project-path',
      '--project must be a shell-safe relative path without parent traversal.',
      { command: commandName, fields: ['project'] },
      `muxui ${commandName} --help`,
    ) };
  }
  if (
    values['catalog-version'] !== null
    && (
      valid(values['catalog-version']) === null
      || !/^sha256:[a-f0-9]{64}$/u.test(values['catalog-digest'])
    )
  ) {
    return { mode, error: usageError(
      'cli.resolution.cache-identity',
      'Cached catalog selection requires one exact SemVer and SHA-256 digest.',
      { command: commandName, fields: ['catalog-digest', 'catalog-version'] },
      `muxui ${commandName} --help`,
    ) };
  }
  const requiredCount = command.arguments.filter(({ required }) => required).length;
  if (positionals.length < requiredCount || positionals.length > command.arguments.length) {
    return { mode, error: usageError(
      'cli.argument.count',
      `${commandName} received the wrong number of arguments.`,
      { command: commandName, received: positionals.length },
      `muxui ${commandName} --help`,
    ) };
  }

  const request = {};
  command.arguments.forEach((argument, index) => {
    if (positionals[index] !== undefined) request[argument.name] = positionals[index];
  });
  for (const option of command.options) {
    if (['catalog-digest', 'catalog-version', 'dense', 'help', 'json', 'project'].includes(option.name)) {
      continue;
    }
    request[option.requestKey ?? option.name] = values[option.name];
  }
  return {
    kind: 'command',
    command: commandName,
    mode,
    request,
    resolution: {
      project: values.project,
      cache: values['catalog-version'] === null ? null : {
        version: values['catalog-version'],
        digest: values['catalog-digest'],
      },
    },
  };
}
