import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadPolicy, normalizePath } from './policy.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';

export const STORYBOOK_AUDIT_MODES = Object.freeze({
  FULL: 'full',
  SKIP_HEAVY: 'skip-heavy',
});

const repositoryRoot = resolve(
  process.env.MUXUI_TASK_REPOSITORY_ROOT ?? resolve(import.meta.dirname, '../../../..'),
);

function uniqueSorted(paths) {
  return [...new Set(paths.map((path) => normalizePath(path)).filter(Boolean))].sort();
}

function matchesPath(path, patterns) {
  return patterns.some((pattern) => {
    const normalized = normalizePath(pattern);
    return normalized.endsWith('/')
      ? path.startsWith(normalized)
      : path === normalized;
  });
}

function localDependencies(manifest) {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  }).filter((name) => name.startsWith('@muxui/'));
}

/**
 * Resolve the package inputs that can flow into the Storybook package from
 * the workspace manifests. This keeps package ownership in package.json
 * rather than duplicating a dependency registry in the audit policy.
 */
export function storybookDependencyPaths(packages, packageName) {
  return storybookDependencyGraph(packages, packageName).paths;
}

function storybookDependencyGraph(packages, packageName) {
  const byName = new Map(packages.map((item) => [item.name, item]));
  const seen = new Set([packageName]);
  const queue = [packageName];
  let complete = byName.has(packageName);
  while (queue.length > 0) {
    const current = byName.get(queue.shift());
    if (!current) continue;
    for (const dependency of localDependencies(current.manifest)) {
      if (!byName.has(dependency)) {
        complete = false;
        continue;
      }
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      queue.push(dependency);
    }
  }
  return {
    complete,
    paths: packages
      .filter(({ name }) => seen.has(name))
      .map(({ path }) => normalizePath(path))
      .sort(),
  };
}

function selectionConfig(policy) {
  const config = policy.storybookAuditSelection;
  if (!config || config.schemaVersion !== 1 || typeof config.package !== 'string') {
    return null;
  }
  if (!Array.isArray(config.fullInputPrefixes)
    || !Array.isArray(config.fullInputPaths)
    || !Array.isArray(config.safeUnrelatedPrefixes)
    || !Array.isArray(config.forceFullEvents)) {
    return null;
  }
  return config;
}

export function selectStorybookAudits({
  changedPaths,
  diffAvailable = true,
  diffReason = null,
  event = 'pull_request',
  force = false,
  policy,
  packages,
}) {
  const config = selectionConfig(policy);
  const changed = uniqueSorted(changedPaths ?? []);
  const dependency = config ? storybookDependencyGraph(packages ?? [], config.package) : { complete: false, paths: [] };
  let mode = STORYBOOK_AUDIT_MODES.FULL;
  let reason;
  if (!config) {
    reason = 'selection policy is missing or invalid';
  } else if (!dependency.complete) {
    reason = 'Storybook workspace dependency graph is missing an expected package';
  } else if (force || config.forceFullEvents.includes(event)) {
    mode = STORYBOOK_AUDIT_MODES.FULL;
    reason = force ? 'force-run requested' : `${event} requires full coverage`;
  } else if (!diffAvailable) {
    reason = diffReason ?? 'changed-path diff is unavailable';
  } else if (changed.length === 0) {
    reason = 'no changed paths; full coverage is the safe default';
  } else {
    const relevant = changed.filter((path) => (
      matchesPath(path, config.fullInputPrefixes)
      || matchesPath(path, config.fullInputPaths)
      || matchesPath(path, dependency.paths.map((dependencyPath) => `${dependencyPath}/`))
    ));
    if (relevant.length > 0) {
      reason = `relevant inputs changed: ${relevant.join(', ')}`;
    } else if (changed.every((path) => matchesPath(path, config.safeUnrelatedPrefixes))) {
      mode = STORYBOOK_AUDIT_MODES.SKIP_HEAVY;
      reason = `only safe unrelated inputs changed: ${changed.join(', ')}`;
    } else {
      reason = `unmapped input changed: ${changed.join(', ')}`;
    }
  }
  return {
    mode,
    full: mode === STORYBOOK_AUDIT_MODES.FULL,
    reason,
    changedPaths: changed,
    dependencyPaths: dependency.paths.sort(),
    heavyAudits: mode === STORYBOOK_AUDIT_MODES.FULL
      ? ['a11y-families', 'manager-colours']
      : [],
  };
}

function runGit(repositoryRootPath, args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRootPath,
    encoding: 'buffer',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      reason: result.error?.message ?? `git ${args.join(' ')} exited with ${result.status ?? 'unknown status'}`,
      bytes: Buffer.alloc(0),
    };
  }
  return { ok: true, reason: null, bytes: result.stdout };
}

function parseNulPaths(bytes) {
  return bytes.toString('utf8').split('\0').filter(Boolean);
}

export function collectChangedPaths({
  repositoryRoot: repositoryRootPath,
  baseRef,
  runGitCommand = runGit,
}) {
  if (!baseRef) {
    return { available: false, paths: [], reason: 'base ref is not configured' };
  }
  const verified = runGitCommand(repositoryRootPath, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  if (!verified.ok) {
    return { available: false, paths: [], reason: `base ref ${baseRef} is unavailable` };
  }

  const commands = [
    ['diff', '--name-only', '-z', '--no-renames', `${baseRef}...HEAD`],
    ['diff', '--name-only', '-z', '--no-renames'],
    ['diff', '--cached', '--name-only', '-z', '--no-renames'],
    ['ls-files', '--others', '--exclude-standard', '-z'],
  ];
  const paths = [];
  for (const command of commands) {
    const result = runGitCommand(repositoryRootPath, command);
    if (!result.ok) {
      return { available: false, paths: [], reason: result.reason };
    }
    paths.push(...parseNulPaths(result.bytes));
  }
  return { available: true, paths: uniqueSorted(paths), reason: null };
}

function eventFromEnvironment() {
  return process.env.MUXUI_STORYBOOK_AUDIT_EVENT
    ?? process.env.GITHUB_EVENT_NAME
    ?? 'pull_request';
}

function baseRefFromEnvironment() {
  if (process.env.MUXUI_BASE_REF) return process.env.MUXUI_BASE_REF;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  return 'origin/main';
}

export async function resolveStorybookAuditSelection({
  repositoryRoot: repositoryRootPath = repositoryRoot,
  baseRef = baseRefFromEnvironment(),
  event = eventFromEnvironment(),
  force = process.env.MUXUI_STORYBOOK_AUDIT_FORCE === '1',
  runGitCommand = runGit,
} = {}) {
  const [policy, packages] = await Promise.all([
    loadPolicy(repositoryRootPath),
    discoverWorkspacePackages(repositoryRootPath),
  ]);
  const diff = collectChangedPaths({ repositoryRoot: repositoryRootPath, baseRef, runGitCommand });
  return selectStorybookAudits({
    changedPaths: diff.paths,
    diffAvailable: diff.available,
    diffReason: diff.reason,
    event,
    force,
    policy,
    packages,
  });
}

function githubOutput(selection) {
  return [
    `mode=${selection.mode}`,
    `full=${selection.full ? 'true' : 'false'}`,
    `reason=${selection.reason.replace(/[\r\n]/gu, ' ')}`,
    `changed_count=${selection.changedPaths.length}`,
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const selection = await resolveStorybookAuditSelection();
  const format = process.argv.includes('--github-output') ? 'github-output' : 'text';
  if (format === 'github-output') {
    process.stdout.write(`${githubOutput(selection)}\n`);
  } else {
    process.stdout.write(
      `[storybook-audit] mode=${selection.mode} changed=${selection.changedPaths.length} ${selection.reason}\n`,
    );
    if (selection.changedPaths.length > 0) {
      process.stdout.write(`${selection.changedPaths.join('\n')}\n`);
    }
  }
}
