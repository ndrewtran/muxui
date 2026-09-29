import * as catalogApi from '@muxui/catalog';
import { validateFamily } from '@muxui/schema';
import { commandRegistry } from '../generated/command-surface.mjs';
import { parseCliArguments } from './parser.mjs';
import { resolvePnpmProjectCatalog } from './pnpm-adapter.mjs';
import { renderDense, renderHuman, renderJson } from './renderers.mjs';

const EXIT_CODES = {
  MUXUI_QUERY_INVALID: 2,
  MUXUI_QUERY_API_VERSION_UNSUPPORTED: 2,
  MUXUI_CURSOR_INVALID: 3,
  MUXUI_QUERY_PAGE_ENVELOPE_TOO_LARGE: 3,
  MUXUI_QUERY_PAGE_ENTRY_TOO_LARGE: 3,
  MUXUI_ARTIFACT_NOT_FOUND: 4,
  MUXUI_PROJECT_NOT_FOUND: 10,
  MUXUI_CATALOG_NOT_DECLARED: 11,
  MUXUI_CATALOG_NOT_INSTALLED: 12,
  MUXUI_CATALOG_DECLARATION_DRIFT: 13,
  MUXUI_CATALOG_INTEGRITY_MISMATCH: 14,
  MUXUI_CATALOG_RESOLUTION_AMBIGUOUS: 15,
  MUXUI_CATALOG_INCOMPATIBLE: 16,
};

function requestWithout(request, keys) {
  return Object.fromEntries(Object.entries(request).filter(([key]) => !keys.includes(key)));
}

export function executeCommand(command, request, api = catalogApi) {
  const definition = commandRegistry.commands.find(({ name }) => name === command);
  if (!definition) throw new Error(`CLI_COMMAND_UNDECLARED: ${command}`);
  const operation = api[definition.operation];
  if (typeof operation !== 'function') {
    throw new Error(`CLI_OPERATION_UNAVAILABLE: ${definition.operation}`);
  }
  const argumentNames = definition.arguments.map(({ name }) => name);
  const operationRequest = requestWithout(request, argumentNames);
  for (const argument of definition.arguments) {
    operationRequest[argument.requestKey ?? argument.name] = request[argument.name];
  }
  const response = operation(operationRequest);
  const responseType = response.type ?? response.responseType;
  if (
    responseType !== 'error'
    && responseType !== definition.responseType
    && !(command === 'get' && responseType === 'artifact.detail.section-page')
  ) {
    throw new Error(
      `CLI_RESPONSE_TYPE_DRIFT: ${command} expected ${definition.responseType}, got ${responseType}`,
    );
  }
  return response;
}

function diagnostics(response) {
  if (response.type === 'error') return [response.error];
  return response.warnings ?? response.diagnostics ?? [];
}

export function assertSafeDiagnostics(response) {
  for (const diagnostic of diagnostics(response)) {
    const next = diagnostic.nextCommand;
    if (next && next.effect !== 'read-only' && next.requiresConfirmation !== true) {
      throw new Error(
        `CLI_UNSAFE_NEXT_COMMAND: ${next.effect} suggestions must require confirmation`,
      );
    }
  }
  return response;
}

function enrichDiagnostic(response, command) {
  if (response.type !== 'error' || response.error.nextCommand) return response;
  const nextCommand = response.error.code === 'MUXUI_ARTIFACT_NOT_FOUND'
    ? `muxui search ${JSON.stringify(response.error.details.id ?? '')} --json`
    : `muxui ${command} --help`;
  const enriched = structuredClone(response);
  enriched.error.nextCommand = {
    command: nextCommand,
    effect: 'read-only',
    requiresConfirmation: false,
  };
  validateFamily('query-envelope', enriched);
  return enriched;
}

function render(response, mode) {
  if (mode === 'json') return renderJson(response);
  if (mode === 'dense') return renderDense(response);
  return renderHuman(response);
}

export function runCli(args) {
  const parsed = parseCliArguments(args);
  if (parsed.kind === 'help') return { stdout: parsed.text, stderr: '', exitCode: 0 };
  const projectResolution = parsed.error ? null : resolvePnpmProjectCatalog({
    ...parsed.resolution,
    artifact: parsed.command === 'get' ? parsed.request['id-or-alias'] : null,
    platform: parsed.request.platform ?? null,
    filterBindings: ['list', 'search'].includes(parsed.command),
    queryApiVersion: parsed.request.queryApiVersion ?? null,
  });
  const response = assertSafeDiagnostics(
    parsed.error
      ?? (projectResolution.type === 'error'
        ? projectResolution
        : enrichDiagnostic(
          executeCommand(parsed.command, parsed.request, projectResolution.api),
          parsed.command,
        )),
  );
  const text = render(response, parsed.mode);
  const exitCode = response.type === 'error' ? (EXIT_CODES[response.error.code] ?? 1) : 0;
  if (response.type === 'error' && parsed.mode === 'human') {
    return { stdout: '', stderr: text, exitCode };
  }
  return { stdout: text, stderr: '', exitCode };
}
