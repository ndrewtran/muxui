// E-BL1-09: the BL1 platform, release, and negative-boundary audit.
//
//   node tests/evidence/bl1/boundary-audit.mjs [--base=<rev>] [--head=<rev>] [--offline]
//
// Compares the pre-BL1 base with `head` and prints one JSON report; the exit code is 1 when a
// check fails. Every check reads git objects at `base` and `head`, except three observations:
// the live CLI (run only when `head` is the clean checked-out revision), the npm registry
// (`npm view`), and GitHub deployments and Pages (`gh api`). The last two are read-only
// observations at the time they run. `--offline` skips them and the report says so; a
// deployment that cannot be observed narrows the claim to "no deployment configuration added".
//
// `negativeControls` proves each check can fail: git controls run a check over a range or a
// head from this repository's history that is known to break it, and function controls feed
// a pure predicate a synthetic input. `tooling/audits/repository-policy/test/evidence-integrity.test.mjs`
// asserts every control, and the capture tool retains their results.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from '../../../tooling/audits/repository-policy/src/canonical-json.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const evidenceRoot = 'tests/evidence/bl1';
const repository = 'ndrewtran/muxui';

// The last main commit before the BL1 implementation PRs (#223 onward). Decision 0026 (#221) and
// GridList grid layout with Virtualizer grid mode (#222) are already in it.
export const preBl1Base = 'b53a05ab55f12696aaf443ffdefb832b4ad2380b';
// The last BL1 implementation merge (#229); close-out commits sit on top of it.
export const bl1MergeRevision = '670cb1880350e62d19f30a09914b6eb6dadef9a4';

/**
 * A change to `packages/react` that landed between the base and the last BL1 merge but is not a
 * BL1 pull request. The audit allows exactly this commit and file, and states the change so it
 * is never read as "@muxui/react unchanged".
 */
export const nonBl1ReactChanges = [{
  pullRequest: 227,
  commit: '5302eeb528588e53beb89a6617e85a05dce24aa1',
  path: 'packages/react/src/supplemental/styles.css',
  description: 'fix(react): use light tokens by default in Sidebar. It flips Sidebar\'s default token mapping (neutral-100 to neutral-10 and the matching foreground, border, and hover steps), and adds @scope light-scheme overrides, color-mix() hover fills, and forced-colors rules. That is a visible change to the default appearance of the shipped ./styles.css, with no class name, custom property, export, or version change.',
}];

// What the close-out may change: retained evidence and its tools, decision records, the evidence integrity test, and the
// one authoring test assertion that gives E-BL1-01 its unknown-field owner.
const closeoutPrefixes = [
  'tests/evidence/',
  'decisions/',
  'tooling/audits/repository-policy/test/evidence-integrity.test.mjs',
  'packages/tooling/test/pattern-authoring.test.mjs',
];
const expectedCliCommands = ['manifest', 'list', 'search', 'get'];
// Commands a reader might expect that BL1 does not provide. `plan` is declared explicitly unavailable.
const probedCommands = ['plan', 'install', 'add', 'init', 'registry', 'scaffold', 'create', 'migrate'];
const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides'];

const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const resolveRevision = (revision) => git('rev-parse', `${revision}^{commit}`).trim();
const show = (revision, path) => git('show', `${revision}:${path}`);
const exists = (revision, path) => spawnSync('git', ['cat-file', '-e', `${revision}:${path}`], { cwd: repositoryRoot }).status === 0;
const jsonAt = (revision, path) => (exists(revision, path) ? JSON.parse(show(revision, path)) : null);
const lines = (text) => text.split('\n').filter(Boolean);
const names = (base, head, ...paths) => lines(git('diff', '--name-only', base, head, '--', ...paths));
const statuses = (base, head, ...paths) => lines(git('diff', '--name-status', base, head, '--', ...paths)).map((line) => {
  const [status, ...rest] = line.split('\t');
  return { status, path: rest.at(-1) };
});
const blob = (revision, path) => git('rev-parse', `${revision}:${path}`).trim();
const sorted = (values) => [...values].sort();
const sameJson = (left, right) => canonicalJson(left) === canonicalJson(right);
const isAncestor = (ancestor, descendant) => spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repositoryRoot }).status === 0;
const excludeTests = ':(exclude)packages/react/test';

function addedLines(base, head, path) {
  const added = [];
  let line = 0;
  for (const row of git('diff', '-U0', '--no-color', base, head, '--', path).split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(row);
    if (hunk) {
      line = Number(hunk[1]);
    } else if (row.startsWith('+') && !row.startsWith('+++')) {
      added.push({ line, text: row.slice(1) });
      line += 1;
    }
  }
  return added;
}

const classNames = (css) => sorted(new Set(css.match(/\.muxui-[A-Za-z0-9_-]+/gu) ?? []));
const declaredProperties = (css) => sorted(new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/gu)].map(([, name]) => name)));

// ---- Pure predicates: each returns the problems it finds, and an empty list means it holds. ----

// Hosting, deployment, and workflow configuration by name.
const hostingPaths = /(?:^|\/)(?:netlify\.toml|vercel\.json|wrangler\.(?:toml|jsonc?)|firebase\.json|fly\.toml|render\.yaml|Procfile|app\.yaml|serverless\.ya?ml|staticwebapp\.config\.json|CNAME|_headers|_redirects|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.vercel\/.*|\.netlify\/.*|\.github\/workflows\/.*)$/u;

// Naming and structure words (`accessible name`, `ARIA`) are not assistive-technology claims, so they are not terms here.
const assistiveTerm = String.raw`(?:screen[- ]?readers?|NVDA|JAWS|VoiceOver|TalkBack|Narrator|Orca|assistive[- ]technolog(?:y|ies)|WCAG|Section\s*508|EN\s*301\s*549|ADA|keyboard users|blind|low[- ]vision|disabilit\w+)`;
const claimVerb = String.raw`(?:supports?|supported|supporting|compatible|compatibility|works?|working|tested|verified|certified|certif\w+|conforms?|conformant|conformance|complian\w+|comply|complies|meets?|met|passes|passing|accessible|friendly|ready|optimi[sz]ed|designed|built|ensures?|guarantees?|fully)`;
/** Heuristic patterns for a support, testing, or conformance claim; a negation is not exempted, so a hit is a question for a human. Each name is a leg of the check. */
const atClaimPatterns = [
  { name: 'claimVerbBeforeTerm', expression: new RegExp(String.raw`\b${claimVerb}\b[^.\n]{0,70}\b${assistiveTerm}\b`, 'iu') },
  { name: 'termBeforeClaimWord', expression: new RegExp(String.raw`\b${assistiveTerm}\b[^.\n]{0,40}\b(?:support\w*|compatib\w+|complian\w+|conform\w+|certif\w+|tested|verified|passes|passing|friendly|ready|ensured|guaranteed)\b`, 'iu') },
  { name: 'fullyAccessible', expression: /\b(?:fully|completely|entirely|100%)\s+accessible\b/iu },
  { name: 'accessibleTo', expression: /\baccessible\s+(?:to|for|with|by)\b/iu },
  { name: 'wcagLevel', expression: /\bWCAG\s*\d(?:\.\d)?(?:\s*(?:level|conformance))?\s*(?:A{1,3}|AA|AAA)\b/iu },
];
/** Lines that mention an assistive-technology term; structural descriptions, listed for the reviewer. */
const assistiveMention = /assistive|screen[- ]?reader|VoiceOver|NVDA|JAWS|TalkBack|WCAG/iu;

/** The names of the claim patterns a line matches. */
export function atClaims(text) {
  return atClaimPatterns.filter(({ expression }) => expression.test(text)).map(({ name }) => name);
}

/** The legs on which an `npm view` observation differs from the recorded R1 exit read-back. */
export function registryProblems(observed, expected) {
  return ['distTags', 'integrity', 'shasum', 'versions', 'versionTimes'].filter((key) => !sameJson(observed[key], expected[key]));
}

/** Problems with the CLI surface, each on one leg: the command set, a capability's effect, a capability's availability. */
export function cliSurfaceProblems({ commands, capabilities }) {
  const problems = [];
  if (!sameJson(commands, expectedCliCommands)) problems.push({ leg: 'commandSet', message: `the CLI declares ${commands.join(', ')}, not ${expectedCliCommands.join(', ')}` });
  for (const { id, effect, availability } of capabilities) {
    if (effect !== 'read-only') problems.push({ leg: 'capabilityEffect', message: `${id} has effect ${effect}` });
    if (/plan|install|registry|scaffold/u.test(id) && availability === 'available') problems.push({ leg: 'capabilityAvailability', message: `${id} is available` });
  }
  return problems;
}

/** Problems in a GitHub deployments and Pages observation, each on one leg. An unobserved site is not a problem, and not a pass either. */
export function deploymentProblems(observation, since) {
  if (!observation.observed) return [];
  const problems = [];
  const recent = observation.deployments.items.filter(({ createdAt }) => Date.parse(createdAt) > Date.parse(since));
  if (recent.length > 0) problems.push({ leg: 'noRecentDeployments', message: `${recent.length} deployments were created after ${since}` });
  if (observation.pages.configured) problems.push({ leg: 'noPagesSite', message: 'GitHub Pages is configured for the repository' });
  return problems;
}

/** A pattern may target web.react only (Decision 0026). */
export function platformProblems(patternPlatforms) {
  const others = patternPlatforms.filter((platform) => platform !== 'web.react');
  return others.length === 0 ? [] : [{ leg: 'patternsReactOnly', message: `patterns target ${others.join(', ')}, not only web.react` }];
}

/** The legs on which two versions of a stylesheet differ: its .muxui-* class names, and its custom property declarations. */
export function stylesheetProblems(before, after) {
  return [
    ...(sameJson(classNames(before), classNames(after)) ? [] : ['classNamesUnchanged']),
    ...(sameJson(declaredProperties(before), declaredProperties(after)) ? [] : ['customPropertiesUnchanged']),
  ];
}

/** Problems with workspace package manifests, each on one leg. `baseScripts` maps a manifest path to its scripts before BL1. */
export function packageProblems(manifests, baseScripts = {}) {
  const problems = [];
  for (const { path, name, private: isPrivate, publishConfig, scripts = {} } of manifests) {
    if (isPrivate !== true) problems.push({ leg: 'allPrivate', message: `${name} is not private` });
    if (publishConfig !== undefined) problems.push({ leg: 'noPublishConfig', message: `${name} has a publishConfig` });
    for (const [script, command] of Object.entries(scripts)) {
      if (baseScripts[path]?.[script] !== command && /\b(?:publish|deploy|dist-tag|wrangler|netlify|vercel|gh-pages)\b/u.test(`${script} ${command}`)) {
        problems.push({ leg: 'noPublishScripts', message: `${name} gained the script ${script}` });
      }
    }
  }
  return problems;
}

/** An Astro configuration line that sets a site, base, adapter, or output, or names a hosting adapter. */
export const isAstroDeploymentSetting = (text) => /\b(?:site|base|adapter|output)\s*:|@astrojs\/(?:netlify|vercel|cloudflare|node)/u.test(text);

/** `plan` must be declared unavailable in the command registry. */
export function planDeclaredProblems(unavailableDeclared) {
  return unavailableDeclared.some(({ name }) => name === 'plan') ? [] : [{ leg: 'planDeclaredUnavailable', message: 'plan is not declared unavailable' }];
}

/** Every probed command must be rejected as an unknown command with exit code 2. */
export function probeProblems(probes) {
  return probes.filter(({ exitCode, ruleId }) => exitCode !== 2 || ruleId !== 'cli.command.unknown')
    .map(({ command }) => ({ leg: 'liveCliProbes', message: `${command} is not rejected as an unknown command` }));
}

function ghApi(path) {
  const result = spawnSync('gh', ['api', path], { cwd: repositoryRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', GH_PAGER: 'cat' } });
  return { status: result.error ? null : result.status, stdout: result.stdout ?? '', stderr: (result.error?.message ?? result.stderr ?? '').trim() };
}

/** A read-only GitHub observation: every deployment the repository lists, and whether a Pages site exists. */
export function observeDeployments() {
  const listed = ghApi(`repos/${repository}/deployments?per_page=100`);
  if (listed.status !== 0) {
    return { observed: false, reason: `gh api deployments failed: ${listed.stderr.split('\n')[0].slice(0, 160) || 'no output'}` };
  }
  const items = JSON.parse(listed.stdout).map(({ id, environment, sha, created_at: createdAt }) => ({ id, environment, sha, createdAt }));
  const pages = ghApi(`repos/${repository}/pages`);
  let configured;
  if (pages.status === 0) configured = true;
  else if (/HTTP 404/u.test(pages.stderr)) configured = false;
  else return { observed: false, reason: `gh api pages failed: ${pages.stderr.split('\n')[0].slice(0, 160) || 'no output'}` };
  return {
    observed: true,
    repository,
    observedAt: new Date().toISOString(),
    deployments: {
      total: items.length,
      truncatedAt100: items.length >= 100,
      environments: sorted(new Set(items.map(({ environment }) => environment))),
      items: items.sort((left, right) => (left.createdAt < right.createdAt ? -1 : 1)),
    },
    pages: { configured },
  };
}

/** The registry as `npm view` reports it now. Read-only. */
function observeRegistry() {
  const result = spawnSync('npm', ['view', '@muxui/react', '--json'], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) return { observed: null, failure: `npm view @muxui/react exited ${result.status}: ${result.stderr.trim().split('\n').at(-1)}` };
  const view = JSON.parse(result.stdout);
  return {
    observed: {
      distTags: view['dist-tags'],
      integrity: view.dist?.integrity ?? null,
      shasum: view.dist?.shasum ?? null,
      versions: view.versions,
      versionTimes: Object.fromEntries(Object.entries(view.time ?? {}).filter(([key]) => key !== 'created' && key !== 'modified')),
    },
  };
}

function recordedRegistry() {
  const { view } = JSON.parse(readFileSync(resolve(repositoryRoot, 'tests/evidence/r1-exit/artifacts/registry-observation.json'), 'utf8'));
  return {
    distTags: view.distTags,
    integrity: view.integrity,
    shasum: view.shasum,
    versions: view.versions,
    versionTimes: Object.fromEntries(Object.entries(view.time).filter(([key]) => key !== 'created' && key !== 'modified')),
  };
}

function runMuxui(args) {
  const result = spawnSync(process.execPath, ['packages/tooling/bin/muxui.mjs', ...args], { cwd: repositoryRoot, encoding: 'utf8' });
  return { exitCode: result.status, stdout: result.stdout };
}

/** Whether the working tree is `head` with nothing changed outside the evidence root, so the live CLI is the CLI at `head`. */
function checkedOutAt(head) {
  if (resolveRevision('HEAD') !== head) return false;
  return lines(git('status', '--porcelain=v1', '--untracked-files=all')).every((line) => line.slice(3).startsWith(`${evidenceRoot}/`));
}

// ---- The checks. Each is `{ id, legs, claim, run(context) -> { legs, observations, claim? } }`. ----
// A leg is one independent condition of a check, true, false, or null when it could not be evaluated.
// A check passes when no leg is false, and a negative control names the legs it expects to fail.

const checks = [
  {
    id: 'react-package-manifest',
    legs: ['manifestUnchanged'],
    claim: '@muxui/react has the same package.json (version, exports, dependencies, files) before and after BL1.',
    run({ baseRevision, headRevision }) {
      const before = jsonAt(baseRevision, 'packages/react/package.json');
      const after = jsonAt(headRevision, 'packages/react/package.json');
      return {
        legs: { manifestUnchanged: blob(baseRevision, 'packages/react/package.json') === blob(headRevision, 'packages/react/package.json') },
        observations: {
          version: { base: before.version, head: after.version },
          exportSubpaths: sorted(Object.keys(after.exports)),
          packageJsonBlob: blob(headRevision, 'packages/react/package.json'),
        },
      };
    },
  },
  {
    id: 'react-source-files',
    legs: ['bl1CommitsTouchNoReactSource', 'onlyKnownCommits', 'onlyKnownPaths'],
    claim: 'No BL1 pull request changed a non-test file of packages/react. Across the whole range, outside packages/react/test, the only change is the pinned non-BL1 Sidebar change.',
    run({ baseRevision, headRevision, mergeRevision }) {
      const known = nonBl1ReactChanges.map((change) => ({ ...change, sha: resolveRevision(change.commit) }));
      const knownShas = new Set(known.map(({ sha }) => sha));
      const inRange = new Set(lines(git('rev-list', `${baseRevision}..${headRevision}`)));
      // Pull requests are first-parent commits up to the last BL1 merge; the pinned non-BL1 ones are not BL1.
      const bl1Commits = isAncestor(mergeRevision, headRevision) && isAncestor(baseRevision, mergeRevision)
        ? lines(git('rev-list', '--first-parent', '--reverse', `${baseRevision}..${mergeRevision}`)).filter((sha) => !knownShas.has(sha))
        : [];
      const bl1Touching = bl1Commits.filter((sha) => names(`${sha}^`, sha, 'packages/react', excludeTests).length > 0);
      const touching = lines(git('log', '--format=%H', `${baseRevision}..${headRevision}`, '--', 'packages/react', excludeTests));
      const unknown = touching.filter((sha) => !knownShas.has(sha));
      const changedPaths = names(baseRevision, headRevision, 'packages/react', excludeTests);
      const present = known.filter(({ sha }) => inRange.has(sha));
      const knownPaths = present.map(({ path }) => path);
      const unexplained = changedPaths.filter((path) => !knownPaths.includes(path));
      const observations = {
        bl1PullRequestCommits: bl1Commits.map((sha) => ({ commit: sha.slice(0, 8), subject: git('log', '-1', '--format=%s', sha).trim(), nonTestReactFiles: names(`${sha}^`, sha, 'packages/react', excludeTests) })),
        nonTestChangesInRange: changedPaths,
        testFilesInRange: statuses(baseRevision, headRevision, 'packages/react/test').map(({ status, path }) => `${status} ${path}`),
        unexplainedCommits: unknown.map((sha) => sha.slice(0, 8)),
        unexplainedPaths: unexplained,
      };
      // Printed only when the change exists in the range.
      if (present.length > 0) {
        observations.nonBl1Changes = present.map(({ pullRequest, commit, path, description }) => ({
          pullRequest,
          commit,
          path,
          subject: git('log', '-1', '--format=%s', commit).trim(),
          description,
          bl1: false,
        }));
        observations.note = 'The pre-BL1 base is not the package the BL1 records ran against: the change above landed between the base and the last BL1 merge, so BL1 evidence validates the package after it.';
      }
      return { legs: { bl1CommitsTouchNoReactSource: bl1Touching.length === 0, onlyKnownCommits: unknown.length === 0, onlyKnownPaths: unexplained.length === 0 }, observations };
    },
  },
  {
    id: 'react-stylesheet-names',
    legs: ['classNamesUnchanged', 'customPropertiesUnchanged'],
    claim: 'The stylesheet that changed adds and removes no .muxui-* class name and no custom property declaration: its declared names are the same before and after.',
    run({ baseRevision, headRevision }) {
      const path = 'packages/react/src/supplemental/styles.css';
      const baseCss = show(baseRevision, path);
      const headCss = show(headRevision, path);
      const changed = blob(baseRevision, path) !== blob(headRevision, path);
      const observations = {
        path,
        stylesheetBytesChanged: changed,
        classNames: classNames(headCss).length,
        declaredCustomProperties: declaredProperties(headCss).length,
        commits: lines(git('log', '--format=%h %s', `${baseRevision}..${headRevision}`, '--', path)),
      };
      if (changed) {
        const [added, removed] = git('diff', '--numstat', baseRevision, headRevision, '--', path).trim().split('\t');
        Object.assign(observations, { linesAdded: Number(added), linesRemoved: Number(removed) });
      }
      const failing = stylesheetProblems(baseCss, headCss);
      return {
        legs: { classNamesUnchanged: !failing.includes('classNamesUnchanged'), customPropertiesUnchanged: !failing.includes('customPropertiesUnchanged') },
        observations,
      };
    },
  },
  {
    id: 'no-dependency-change',
    legs: ['dependenciesUnchanged', 'lockfileAndWorkspaceUnchanged'],
    claim: 'No dependency, devDependency, peerDependency, or override changed in any package.json, and the lockfile and workspace files are unchanged.',
    run({ baseRevision, headRevision }) {
      const manifests = names(baseRevision, headRevision, '*package.json').filter((path) => !path.includes('node_modules'));
      const dependencyChanges = [];
      for (const path of manifests) {
        const before = jsonAt(baseRevision, path) ?? {};
        const after = jsonAt(headRevision, path) ?? {};
        for (const field of dependencyFields) if (!sameJson(before[field] ?? {}, after[field] ?? {})) dependencyChanges.push({ path, field });
      }
      const lockfileChanges = names(baseRevision, headRevision, 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.node-version');
      return {
        legs: { dependenciesUnchanged: dependencyChanges.length === 0, lockfileAndWorkspaceUnchanged: lockfileChanges.length === 0 },
        observations: { manifestsChanged: manifests, dependencyChanges, lockfileChanges },
      };
    },
  },
  {
    id: 'versions-follow-decision-0026',
    legs: ['onlyDecidedVersionsChanged'],
    claim: 'Only @muxui/schema, @muxui/catalog, and @muxui/tooling changed version (Decision 0026 item 10), and @muxui/react did not.',
    run({ baseRevision, headRevision }) {
      const allowed = new Set(['@muxui/catalog', '@muxui/schema', '@muxui/tooling']);
      const versionChanges = [];
      for (const path of names(baseRevision, headRevision, '*package.json').filter((candidate) => !candidate.includes('node_modules'))) {
        const before = jsonAt(baseRevision, path);
        const after = jsonAt(headRevision, path);
        if (after !== null && (before?.version ?? null) !== (after.version ?? null)) versionChanges.push({ package: after.name, from: before?.version ?? null, to: after.version ?? null });
      }
      return { legs: { onlyDecidedVersionsChanged: versionChanges.every(({ package: name }) => allowed.has(name)) }, observations: { versionChanges } };
    },
  },
  {
    id: 'packages-stay-private',
    legs: ['allPrivate', 'noPublishConfig', 'noPublishScripts'],
    claim: 'Every workspace package, @muxui/react included, is private, and none has a publishConfig or gained a publish or deploy script.',
    run({ baseRevision, headRevision }) {
      const manifests = lines(git('ls-tree', '-r', '--name-only', headRevision))
        .filter((path) => /(?:^|\/)package\.json$/u.test(path) && !path.includes('node_modules') && !path.includes('/fixtures/'))
        .map((path) => ({ path, ...jsonAt(headRevision, path) }));
      const baseScripts = Object.fromEntries(manifests.map(({ path }) => [path, jsonAt(baseRevision, path)?.scripts ?? {}]));
      const problems = packageProblems(manifests, baseScripts);
      const holds = (leg) => !problems.some((problem) => problem.leg === leg);
      return {
        legs: { allPrivate: holds('allPrivate'), noPublishConfig: holds('noPublishConfig'), noPublishScripts: holds('noPublishScripts') },
        observations: { workspacePackagesChecked: manifests.length, problems },
      };
    },
  },
  {
    id: 'no-workflow-or-hosting-config',
    legs: ['workflowsUnchanged', 'noHostingFiles', 'noAstroDeploymentSettings'],
    claim: 'BL1 added or changed no workflow, no hosting or deployment file, and no Astro site, base, adapter, or output setting.',
    run({ baseRevision, headRevision }) {
      const workflowChanges = names(baseRevision, headRevision, '.github');
      const hostingFilesAdded = statuses(baseRevision, headRevision).filter(({ status, path }) => status !== 'D' && hostingPaths.test(path)).map(({ path }) => path);
      const astroDeploymentSettingsAdded = exists(headRevision, 'apps/docs/astro.config.mjs')
        ? addedLines(baseRevision, headRevision, 'apps/docs/astro.config.mjs').filter(({ text }) => isAstroDeploymentSetting(text))
        : [];
      return {
        legs: { workflowsUnchanged: workflowChanges.length === 0, noHostingFiles: hostingFilesAdded.length === 0, noAstroDeploymentSettings: astroDeploymentSettingsAdded.length === 0 },
        observations: { workflowChanges, hostingFilesAdded, astroDeploymentSettingsAdded },
      };
    },
  },
  {
    id: 'no-deployment',
    legs: ['noRecentDeployments', 'noPagesSite'],
    claim: 'GitHub lists no deployment created since the pre-BL1 base and no Pages site (observed read-only). Where this cannot be observed the claim is only that no deployment configuration was added, which no-workflow-or-hosting-config checks.',
    run({ baseRevision, offline, deployments }) {
      const since = git('log', '-1', '--format=%cI', baseRevision).trim();
      const unobserved = { noRecentDeployments: null, noPagesSite: null };
      if (offline) return { legs: unobserved, claim: 'No deployment configuration was added (deployments were not observed: offline).', observations: { observed: false, reason: 'offline', since } };
      const observation = deployments();
      if (!observation.observed) {
        return { legs: unobserved, claim: 'No deployment configuration was added (deployments could not be observed).', observations: { ...observation, since } };
      }
      const problems = deploymentProblems(observation, since);
      return {
        legs: { noRecentDeployments: !problems.some(({ leg }) => leg === 'noRecentDeployments'), noPagesSite: !problems.some(({ leg }) => leg === 'noPagesSite') },
        claim: `GitHub lists no deployment created since the pre-BL1 base and no Pages site (observed read-only at ${observation.observedAt}; ${observation.deployments.total} deployments listed in total, all earlier).`,
        observations: { ...observation, since, problems },
      };
    },
  },
  {
    id: 'registry-unchanged',
    legs: ['registryReadable', 'distTags', 'integrity', 'shasum', 'versions', 'versionTimes'],
    claim: 'The npm registry still shows only @muxui/react@0.1.0-rc.1 with the R1 exit dist-tags, integrity, and publish time.',
    run({ offline, registry }) {
      const unobserved = { registryReadable: null, distTags: null, integrity: null, shasum: null, versions: null, versionTimes: null };
      if (offline) return { legs: unobserved, observations: { skipped: 'offline' } };
      const { observed, failure } = registry();
      if (observed === null) return { legs: { ...unobserved, registryReadable: false }, observations: { failure } };
      const expected = recordedRegistry();
      const differing = registryProblems(observed, expected);
      return {
        legs: { registryReadable: true, distTags: !differing.includes('distTags'), integrity: !differing.includes('integrity'), shasum: !differing.includes('shasum'), versions: !differing.includes('versions'), versionTimes: !differing.includes('versionTimes') },
        observations: { observed, expectedFrom: 'tests/evidence/r1-exit/artifacts/registry-observation.json (the R1 exit registry read-back)', expected, differing },
      };
    },
  },
  {
    id: 'no-assistive-technology-claim',
    legs: atClaimPatterns.map(({ name }) => name),
    claim: 'No line BL1 added to a catalog record, docs or Storybook source, package source or readme, or the root readme claims support, testing, or conformance for a screen reader, assistive technology, or WCAG (Decision 0022). The scan is a heuristic over added lines.',
    run({ baseRevision, headRevision }) {
      // Where a support claim would reach a reader. Authority text (strategy, decisions, evidence) carries negations and is not scanned.
      const scanned = /^(?:catalog\/|apps\/|docs\/|README\.md$|packages\/[^/]+\/(?:README\.md|src\/|NOTICE))/u;
      const skipped = /(?:^|\/)(?:test|tests|generated|fixtures|node_modules)\//u;
      const files = statuses(baseRevision, headRevision).filter(({ status, path }) => status !== 'D' && scanned.test(path) && !skipped.test(path) && !/\.test\.[cm]?[jt]sx?$/u.test(path)).map(({ path }) => path);
      const claims = [];
      const mentions = [];
      for (const path of files) {
        for (const { line, text } of addedLines(baseRevision, headRevision, path)) {
          const hit = atClaims(text);
          if (hit.length > 0) claims.push({ path, line, patterns: hit, text: text.trim().slice(0, 200) });
          else if (assistiveMention.test(text)) mentions.push({ path, line, text: text.trim().slice(0, 200) });
        }
      }
      return {
        legs: Object.fromEntries(atClaimPatterns.map(({ name }) => [name, !claims.some(({ patterns }) => patterns.includes(name))])),
        observations: { filesScanned: files.length, claims, mentions, mentionNote: 'Mentions are structural descriptions (what the markup exposes), listed for the independent content review; they are not support claims.' },
      };
    },
  },
  {
    id: 'plan-install-registry-scaffold-unavailable',
    legs: ['commandSet', 'capabilityEffect', 'capabilityAvailability', 'planDeclaredUnavailable', 'liveCliProbes'],
    claim: 'The CLI and the capability manifest expose only manifest, list, search, and get, all read-only; plan, init, migrate, doctor, and validate are declared unavailable, and install, add, registry, scaffold, and create are unknown commands.',
    run({ headRevision }) {
      const registry = jsonAt(headRevision, 'packages/tooling/command-registry.json');
      const capabilities = lines(git('ls-tree', '--name-only', headRevision, 'catalog/capabilities/')).map((path) => jsonAt(headRevision, path))
        .map(({ id, availability, policy }) => ({ id, availability, effect: policy.effect }));
      const commands = registry.commands.map(({ name }) => name);
      const problems = cliSurfaceProblems({ commands, capabilities });
      const unavailableDeclared = registry.unavailableCommands.map(({ name, earliestMilestone }) => ({ name, earliestMilestone }));
      const holds = (leg, found) => !found.some((problem) => problem.leg === leg);
      const planDeclared = holds('planDeclaredUnavailable', planDeclaredProblems(unavailableDeclared));
      const staticLegs = {
        commandSet: holds('commandSet', problems),
        capabilityEffect: holds('capabilityEffect', problems),
        capabilityAvailability: holds('capabilityAvailability', problems),
        planDeclaredUnavailable: planDeclared,
      };
      const observations = { registryCommands: commands, capabilities, unavailableDeclared, problems };
      // The live CLI is the CLI at `head` only when the checked-out tree is `head`.
      if (!checkedOutAt(headRevision)) {
        return { legs: { ...staticLegs, liveCliProbes: null }, observations: { ...observations, liveCli: { run: false, reason: 'head is not the clean checked-out revision' } } };
      }
      const manifest = JSON.parse(runMuxui(['manifest', '--detail', 'full', '--json']).stdout);
      const liveCommands = manifest.data.cli.commands.map(({ name }) => name);
      const liveUnavailable = manifest.data.cli.unavailableCommands.map(({ name, capability }) => ({ name, available: capability.available }));
      const probes = probedCommands.map((name) => {
        const { exitCode, stdout } = runMuxui([name, '--json']);
        const error = JSON.parse(stdout).error;
        return { command: name, exitCode, code: error?.code ?? null, ruleId: error?.ruleId ?? null };
      });
      const liveProblems = cliSurfaceProblems({
        commands: liveCommands,
        capabilities: manifest.data.capabilities.map(({ id, availability, policy }) => ({ id, availability, effect: policy.effect })),
      });
      const livePlanDeclared = liveUnavailable.some(({ name, available }) => name === 'plan' && available === false);
      const probeFailures = probeProblems(probes);
      return {
        legs: {
          commandSet: staticLegs.commandSet && holds('commandSet', liveProblems),
          capabilityEffect: staticLegs.capabilityEffect && holds('capabilityEffect', liveProblems),
          capabilityAvailability: staticLegs.capabilityAvailability && holds('capabilityAvailability', liveProblems),
          planDeclaredUnavailable: planDeclared && livePlanDeclared,
          liveCliProbes: probeFailures.length === 0,
        },
        observations: { ...observations, liveProblems, liveCli: { run: true, manifestCommands: liveCommands, manifestUnavailable: liveUnavailable, probes, artifactKinds: manifest.data.artifactKinds } },
      };
    },
  },
  {
    id: 'no-new-component-token-capability-or-platform',
    legs: ['catalogRecordsUnchanged', 'patternsReactOnly'],
    claim: 'BL1 added or changed no component, token, capability, or React family record, and every pattern targets web.react only.',
    run({ baseRevision, headRevision }) {
      const changedCatalogRecords = names(baseRevision, headRevision, 'catalog/components', 'catalog/tokens', 'catalog/capabilities', 'catalog/react-r1-0', 'catalog/react-r1-5', 'catalog/react-r1-6');
      const patternPlatforms = sorted(new Set(lines(git('ls-tree', '-r', '--name-only', headRevision, 'catalog/patterns'))
        .filter((path) => path.endsWith('/artifact.json')).flatMap((path) => jsonAt(headRevision, path).platforms)));
      return {
        legs: { catalogRecordsUnchanged: changedCatalogRecords.length === 0, patternsReactOnly: platformProblems(patternPlatforms).length === 0 },
        observations: {
          changedCatalogRecords,
          patternPlatforms,
          strategyFilesChanged: names(baseRevision, headRevision, 'strategy'),
          guideFilesChanged: names(baseRevision, headRevision, 'catalog/guides'),
        },
      };
    },
  },
  {
    id: 'closeout-scope',
    legs: ['descendsFromCloseoutBase', 'hasChange', 'onlyAllowedPaths'],
    claim: 'Commits after the last BL1 merge change only retained evidence and its tools, decision records, the evidence integrity test, and the authoring test that gives E-BL1-01 its unknown-field owner, and there is at least one such change.',
    run({ closeoutBase, headRevision }) {
      const descends = isAncestor(closeoutBase, headRevision);
      const changed = descends ? names(closeoutBase, headRevision) : [];
      const outside = changed.filter((path) => !closeoutPrefixes.some((prefix) => path === prefix || path.startsWith(prefix)));
      return {
        // A range with no change would pass vacuously, so it fails; a base that is not an ancestor leaves the other legs unevaluated.
        legs: { descendsFromCloseoutBase: descends, hasChange: descends ? changed.length > 0 : null, onlyAllowedPaths: descends ? outside.length === 0 : null },
        observations: { closeoutBase: closeoutBase.slice(0, 8), descendsFromCloseoutBase: descends, changedPaths: changed, pathsOutsideAllowedPrefixes: outside },
      };
    },
  },
];

export const checkIds = checks.map(({ id }) => id);
/** The legs each check declares. */
export const checkLegs = Object.fromEntries(checks.map(({ id, legs }) => [id, legs]));

/**
 * Runs the checks (or only those in `only`) and returns `{ pass, base, head, checks }`, each check with its legs.
 * `closeoutBase: null` skips the close-out scope check, for a capture after a block is added.
 * `mergeRevision` is the last BL1 merge, and `observers` replaces the live registry and deployment reads, for tests.
 */
export function auditBoundary({ base = preBl1Base, head = 'HEAD', offline = false, only, closeoutBase = bl1MergeRevision, mergeRevision = bl1MergeRevision, observers = {} } = {}) {
  const baseRevision = resolveRevision(base);
  const headRevision = resolveRevision(head);
  const context = {
    baseRevision,
    headRevision,
    mergeRevision: resolveRevision(mergeRevision),
    closeoutBase: closeoutBase === null ? null : resolveRevision(closeoutBase),
    offline,
    registry: observers.registry ?? observeRegistry,
    deployments: observers.deployments ?? observeDeployments,
  };
  const selected = checks.filter(({ id }) => (only === undefined || only.includes(id)) && !(id === 'closeout-scope' && closeoutBase === null));
  const results = selected.map(({ id, legs: declared, claim, run }) => {
    const { legs, observations, claim: observedClaim } = run(context);
    if (!sameJson(sorted(Object.keys(legs)), sorted(declared))) throw new Error(`BL1_AUDIT_LEGS: ${id} returned legs ${Object.keys(legs).join(', ')}, not ${declared.join(', ')}`);
    return { id, claim: observedClaim ?? claim, pass: Object.values(legs).every((value) => value !== false), legs, observations };
  });
  return {
    schema: 'muxui-bl1-boundary-audit-v1',
    base: { revision: baseRevision, subject: git('log', '-1', '--format=%s', baseRevision).trim() },
    head: { revision: headRevision, lastBl1Merge: context.mergeRevision },
    pass: results.every(({ pass }) => pass),
    checks: results,
  };
}

// ---- Negative controls: a check that cannot fail proves nothing. ----

const oldRegistry = {
  distTags: { latest: '0.1.0-rc.1', next: '0.1.0-rc.1' },
  integrity: 'sha512-a',
  shasum: 'a',
  versions: ['0.1.0-rc.1'],
  versionTimes: { '0.1.0-rc.1': '2026-10-04T13:05:33.917Z' },
};
const changedRegistryField = {
  distTags: { latest: '0.1.0-rc.2', next: '0.1.0-rc.1' },
  integrity: 'sha512-b',
  shasum: 'b',
  versions: ['0.1.0-rc.1', '0.1.0-rc.2'],
  versionTimes: { '0.1.0-rc.1': '2026-10-09T00:00:00.000Z' },
};
const readOnlyCapability = { id: 'muxui:capability:query-baseline', availability: 'available', effect: 'read-only' };
const emptyObservation = { observed: true, deployments: { items: [] }, pages: { configured: false } };
const since = '2026-10-07T00:00:00+11:00';
const afterBase = { id: 1, environment: 'production', sha: 'a', createdAt: '2026-10-08T00:00:00Z' };
const legsOf = (problems) => sorted(new Set(problems.map(({ leg }) => leg)));
const claimSamples = {
  claimVerbBeforeTerm: ['Tested with NVDA and VoiceOver.', 'Supports assistive technology.'],
  termBeforeClaimWord: ['Screen reader compatible.', 'WCAG conformance verified.'],
  fullyAccessible: ['Fully accessible to screen readers.'],
  accessibleTo: ['This block is accessible to keyboard users.'],
  wcagLevel: ['Meets WCAG 2.2 AA.', 'WCAG 2.1 AA compliant.'],
};
const notClaims = ['The check marks are decorative SVG hidden from assistive technology.', 'The toggle group is a labelled group of buttons.', 'Keyboard focus follows the visual order.', 'The GridList carries the accessible name, so pass an aria-label that names the collection.'];
const commit = {
  pr207: '07d3d9d35889a045480842528726f4c3bc96f6d4',
  reactVersion: 'aab5116341f53d7f31c5a00ee7d3ac953a936ca6',
  pr149: '4c9636b8e9c645c6815a8a2b106515524fa67108',
  pr201: '548019a8e7215f5f23f41a76165e511bd4ca5d57',
  pr213: '5773276b8c050f927d29d3a8f237cfc29e465bba',
  pr221: 'd370455359467597ba6ebe222e3ad7401118f9cb',
  pr222: 'b53a05ab55f12696aaf443ffdefb832b4ad2380b',
  pr229: '670cb1880350e62d19f30a09914b6eb6dadef9a4',
};

/**
 * Git controls run one check over history known to break it, and name the legs that must fail; the legs they do
 * not name must hold. Function controls give a pure predicate input that fails exactly the named legs, and input it
 * must accept. `description` names the commit or the input.
 */
export const negativeControls = [
  { id: 'manifest-changed', kind: 'git', check: 'react-package-manifest', failingLegs: ['manifestUnchanged'], description: '#207 changed the @muxui/react manifest', base: `${commit.pr207}^`, head: commit.pr207 },
  { id: 'dependency-changed', kind: 'git', check: 'no-dependency-change', failingLegs: ['dependenciesUnchanged', 'lockfileAndWorkspaceUnchanged'], description: '#207 pinned a dependency and changed the lockfile', base: `${commit.pr207}^`, head: commit.pr207 },
  { id: 'react-version-changed', kind: 'git', check: 'versions-follow-decision-0026', failingLegs: ['onlyDecidedVersionsChanged'], description: 'aab51163 changed the @muxui/react version', base: `${commit.reactVersion}^`, head: commit.reactVersion },
  { id: 'package-not-private', kind: 'git', check: 'packages-stay-private', failingLegs: ['allPrivate'], description: 'at aab51163 @muxui/react was not private', base: `${commit.reactVersion}^`, head: commit.reactVersion },
  { id: 'react-source-changed', kind: 'git', check: 'react-source-files', failingLegs: ['onlyKnownCommits', 'onlyKnownPaths'], description: '#222 changed the GridList and Virtualizer sources in packages/react', base: commit.pr221, head: commit.pr222 },
  {
    id: 'bl1-commit-changed-react-source',
    kind: 'git',
    check: 'react-source-files',
    failingLegs: ['bl1CommitsTouchNoReactSource', 'onlyKnownCommits', 'onlyKnownPaths'],
    description: 'with #222 treated as the last BL1 merge, a BL1 pull request changed packages/react',
    base: commit.pr221,
    head: commit.pr222,
    mergeRevision: commit.pr222,
  },
  { id: 'stylesheet-class-names-changed', kind: 'git', check: 'react-stylesheet-names', failingLegs: ['classNamesUnchanged'], description: '#201 changed class names in the React stylesheet', base: `${commit.pr201}^`, head: commit.pr201 },
  { id: 'stylesheet-names-and-properties-changed', kind: 'git', check: 'react-stylesheet-names', failingLegs: ['classNamesUnchanged', 'customPropertiesUnchanged'], description: '#149 changed class names and custom properties in the React stylesheet', base: `${commit.pr149}^`, head: commit.pr149 },
  { id: 'stylesheet-custom-property-added', kind: 'function', check: 'react-stylesheet-names', failingLegs: ['customPropertiesUnchanged'], description: 'a declared custom property is rejected on its own leg, an unchanged stylesheet is accepted', reject: () => sorted(stylesheetProblems('.muxui-a { color: red; }', '.muxui-a { --muxui-x: 1; color: red; }')), accepts: () => stylesheetProblems('.muxui-a { color: red; }', '.muxui-a { color: blue; }').length === 0 },
  { id: 'workflow-changed', kind: 'git', check: 'no-workflow-or-hosting-config', failingLegs: ['workflowsUnchanged', 'noHostingFiles'], description: '#213 changed the publish workflow', base: `${commit.pr213}^`, head: commit.pr213 },
  { id: 'catalog-records-changed', kind: 'git', check: 'no-new-component-token-capability-or-platform', failingLegs: ['catalogRecordsUnchanged'], description: '#222 changed the GridList and Virtualizer catalog records', base: commit.pr221, head: commit.pr222 },
  { id: 'closeout-outside-allowed-paths', kind: 'git', check: 'closeout-scope', failingLegs: ['onlyAllowedPaths'], description: 'from #222 to the last BL1 merge, files outside evidence and decisions changed', base: commit.pr222, head: commit.pr229, closeoutBase: commit.pr222 },
  { id: 'closeout-vacuous', kind: 'git', check: 'closeout-scope', failingLegs: ['hasChange'], description: 'a range with no close-out change must not pass vacuously', base: commit.pr222, head: commit.pr229, closeoutBase: commit.pr229 },
  { id: 'closeout-not-an-ancestor', kind: 'git', check: 'closeout-scope', failingLegs: ['descendsFromCloseoutBase'], description: 'a close-out base that is not an ancestor of the head', base: commit.pr221, head: commit.pr222, closeoutBase: commit.pr229 },
  ...['distTags', 'integrity', 'shasum', 'versions', 'versionTimes'].map((leg) => ({
    id: `registry-${leg}`,
    kind: 'function',
    check: 'registry-unchanged',
    failingLegs: [leg],
    description: `a changed ${leg} is rejected on that leg only, and the recorded read-back is accepted`,
    reject: () => registryProblems({ ...oldRegistry, [leg]: changedRegistryField[leg] }, oldRegistry),
    accepts: () => registryProblems(oldRegistry, oldRegistry).length === 0,
  })),
  { id: 'deployment-after-base', kind: 'function', check: 'no-deployment', failingLegs: ['noRecentDeployments'], description: 'a deployment created after the base is rejected, an empty observation is accepted', reject: () => legsOf(deploymentProblems({ ...emptyObservation, deployments: { items: [afterBase] } }, since)), accepts: () => deploymentProblems(emptyObservation, since).length === 0 },
  { id: 'pages-configured', kind: 'function', check: 'no-deployment', failingLegs: ['noPagesSite'], description: 'a configured Pages site is rejected', reject: () => legsOf(deploymentProblems({ ...emptyObservation, pages: { configured: true } }, since)), accepts: () => deploymentProblems(emptyObservation, since).length === 0 },
  ...Object.entries(claimSamples).map(([leg, samples]) => ({
    id: `claim-${leg}`,
    kind: 'function',
    check: 'no-assistive-technology-claim',
    failingLegs: [leg],
    description: `claim-shaped lines are flagged on the ${leg} pattern, and structural descriptions are not`,
    reject: () => (samples.every((text) => atClaims(text).includes(leg)) ? [leg] : []),
    accepts: () => notClaims.every((text) => atClaims(text).length === 0),
  })),
  { id: 'cli-extra-command', kind: 'function', check: 'plan-install-registry-scaffold-unavailable', failingLegs: ['commandSet'], description: 'an added plan or install command is rejected, the shipped surface is accepted', reject: () => legsOf([...cliSurfaceProblems({ commands: [...expectedCliCommands, 'plan'], capabilities: [readOnlyCapability] }), ...cliSurfaceProblems({ commands: [...expectedCliCommands, 'install'], capabilities: [readOnlyCapability] })]), accepts: () => cliSurfaceProblems({ commands: expectedCliCommands, capabilities: [readOnlyCapability] }).length === 0 },
  { id: 'cli-write-capability', kind: 'function', check: 'plan-install-registry-scaffold-unavailable', failingLegs: ['capabilityEffect'], description: 'a write-effect capability is rejected', reject: () => legsOf(cliSurfaceProblems({ commands: expectedCliCommands, capabilities: [{ ...readOnlyCapability, effect: 'project-write' }] })), accepts: () => cliSurfaceProblems({ commands: expectedCliCommands, capabilities: [readOnlyCapability] }).length === 0 },
  { id: 'cli-available-plan', kind: 'function', check: 'plan-install-registry-scaffold-unavailable', failingLegs: ['capabilityAvailability'], description: 'an available plan or install capability is rejected', reject: () => legsOf(cliSurfaceProblems({ commands: expectedCliCommands, capabilities: [{ ...readOnlyCapability, id: 'muxui:capability:plan' }] })), accepts: () => cliSurfaceProblems({ commands: expectedCliCommands, capabilities: [readOnlyCapability] }).length === 0 },
  { id: 'publish-config', kind: 'function', check: 'packages-stay-private', failingLegs: ['noPublishConfig'], description: 'a publishConfig is rejected, a private package is accepted', reject: () => legsOf(packageProblems([{ path: 'a/package.json', name: 'a', private: true, publishConfig: { access: 'public' } }])), accepts: () => packageProblems([{ path: 'a/package.json', name: 'a', private: true, scripts: { check: 'node test.mjs' } }]).length === 0 },
  { id: 'publish-script', kind: 'function', check: 'packages-stay-private', failingLegs: ['noPublishScripts'], description: 'a new publish script is rejected, an unchanged one is accepted', reject: () => legsOf(packageProblems([{ path: 'a/package.json', name: 'a', private: true, scripts: { release: 'npm publish' } }], { 'a/package.json': {} })), accepts: () => packageProblems([{ path: 'a/package.json', name: 'a', private: true, scripts: { release: 'npm publish' } }], { 'a/package.json': { release: 'npm publish' } }).length === 0 },
  { id: 'astro-deployment-setting', kind: 'function', check: 'no-workflow-or-hosting-config', failingLegs: ['noAstroDeploymentSettings'], description: 'a site, base, adapter, or hosting import line is flagged, a plain integration line is not', reject: () => (["site: 'https://example.com',", 'output: \'server\',', "import netlify from '@astrojs/netlify';"].every(isAstroDeploymentSetting) ? ['noAstroDeploymentSettings'] : []), accepts: () => !isAstroDeploymentSetting('integrations: [react()],') },
  { id: 'registry-unreadable', kind: 'function', check: 'registry-unchanged', failingLegs: ['registryReadable'], description: 'a registry that cannot be read fails that leg, with the other legs unevaluated', reject: () => { const [result] = auditBoundary({ offline: false, only: ['registry-unchanged'], observers: { registry: () => ({ observed: null, failure: 'unreachable' }) } }).checks; return sorted(Object.entries(result.legs).filter(([, value]) => value === false).map(([leg]) => leg)); }, accepts: () => true },
  { id: 'plan-not-declared-unavailable', kind: 'function', check: 'plan-install-registry-scaffold-unavailable', failingLegs: ['planDeclaredUnavailable'], description: 'a registry that does not declare plan unavailable is rejected, one that does is accepted', reject: () => legsOf(planDeclaredProblems([{ name: 'init' }])), accepts: () => planDeclaredProblems([{ name: 'plan' }]).length === 0 },
  { id: 'probe-accepted-command', kind: 'function', check: 'plan-install-registry-scaffold-unavailable', failingLegs: ['liveCliProbes'], description: 'a probed command the CLI runs is rejected, an unknown-command rejection is accepted', reject: () => legsOf(probeProblems([{ command: 'plan', exitCode: 0, ruleId: null }])), accepts: () => probeProblems([{ command: 'plan', exitCode: 2, ruleId: 'cli.command.unknown' }]).length === 0 },
  { id: 'pattern-platform', kind: 'function', check: 'no-new-component-token-capability-or-platform', failingLegs: ['patternsReactOnly'], description: 'a pattern that targets another platform is rejected, web.react only is accepted', reject: () => legsOf(platformProblems(['web.html', 'web.react'])), accepts: () => platformProblems(['web.react']).length === 0 && platformProblems([]).length === 0 },
];

/** The legs of each check that no control fails on its own, because history or a predicate provides no failing input for them. */
export function legsWithoutControl() {
  const covered = new Map();
  for (const { check, failingLegs } of negativeControls) covered.set(check, new Set([...(covered.get(check) ?? []), ...failingLegs]));
  return Object.fromEntries(Object.entries(checkLegs)
    .map(([id, legs]) => [id, legs.filter((leg) => !(covered.get(id) ?? new Set()).has(leg))])
    .filter(([, legs]) => legs.length > 0));
}

/** The check ids no control covers; empty when every check can be shown to fail. */
export const checksWithoutControl = () => checkIds.filter((id) => !negativeControls.some(({ check }) => check === id));

/**
 * Runs every control and returns, for each, the legs it expected to fail and the legs that did. A control
 * is sound when exactly the expected legs fail, and a function control also accepts its good input.
 */
export function runNegativeControls() {
  return negativeControls.map((control) => {
    const { id, check, kind, description, failingLegs } = control;
    const expected = sorted(failingLegs);
    if (kind === 'function') {
      const observed = sorted(control.reject());
      return { id, check, kind, description, expectedFailingLegs: expected, failingLegs: observed, rejected: sameJson(observed, expected), accepted: control.accepts() === true };
    }
    const audit = auditBoundary({ base: control.base, head: control.head, closeoutBase: control.closeoutBase, mergeRevision: control.mergeRevision, offline: true, only: [check] });
    const [result] = audit.checks;
    const observed = sorted(Object.entries(result.legs).filter(([, value]) => value === false).map(([leg]) => leg));
    return {
      id,
      check,
      kind,
      description,
      range: { base: control.base, head: control.head, ...(control.closeoutBase === undefined ? {} : { closeoutBase: control.closeoutBase }), ...(control.mergeRevision === undefined ? {} : { mergeRevision: control.mergeRevision }) },
      expectedFailingLegs: expected,
      failingLegs: observed,
      rejected: result.pass === false && sameJson(observed, expected),
      accepted: null,
    };
  });
}

if (process.argv[1] === import.meta.filename) {
  const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const report = auditBoundary({ base: option('base'), head: option('head'), offline: process.argv.includes('--offline') });
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error(`E-BL1-09 failed: ${report.checks.filter(({ pass }) => !pass).map(({ id }) => id).join(', ')}`);
    process.exitCode = 1;
  }
}
