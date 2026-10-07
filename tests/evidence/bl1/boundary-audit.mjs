// E-BL1-09: the BL1 platform, release, and negative-boundary audit.
//
//   node tests/evidence/bl1/boundary-audit.mjs [--base=<rev>] [--head=<rev>] [--offline]
//
// Compares the pre-BL1 base with `head` and prints one JSON report; the exit code is 1 when a
// check fails. The git checks are deterministic. The registry check reads `npm view`
// (read-only, no publish or dist-tag command) and is an observation at the time it runs, so
// `--offline` skips it and the report says so. The capture tool never uses `--offline`.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from '../../../tooling/audits/repository-policy/src/canonical-json.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
// The last main commit before the BL1 implementation PRs (#223 onward). Decision 0026 and
// GridList grid layout with Virtualizer grid mode are already in it.
export const preBl1Base = 'b53a05ab';
// The last BL1 implementation merge (#229); close-out commits sit on top of it.
export const bl1MergeRevision = '670cb188';

const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const resolveRevision = (revision) => git('rev-parse', `${revision}^{commit}`).trim();
const show = (revision, path) => git('show', `${revision}:${path}`);
const names = (base, head, ...paths) => git('diff', '--name-only', base, head, '--', ...paths).split('\n').filter(Boolean);
const statuses = (base, head, ...paths) => git('diff', '--name-status', base, head, '--', ...paths).split('\n').filter(Boolean).map((line) => {
  const [status, ...rest] = line.split('\t');
  return { status, path: rest.at(-1) };
});
const blob = (revision, path) => git('rev-parse', `${revision}:${path}`).trim();
const json = (revision, path) => JSON.parse(show(revision, path));
const sorted = (values) => [...values].sort();
const sameJson = (left, right) => canonicalJson(left) === canonicalJson(right);

/** Paths a close-out commit on top of the last BL1 merge may touch. */
const closeoutPrefixes = ['tests/evidence/', 'decisions/', 'tooling/audits/repository-policy/test/evidence-integrity.test.mjs'];

// Hosting, deployment, and workflow configuration by name.
const hostingPaths = /(?:^|\/)(?:netlify\.toml|vercel\.json|wrangler\.(?:toml|jsonc?)|firebase\.json|fly\.toml|render\.yaml|Procfile|app\.yaml|serverless\.ya?ml|staticwebapp\.config\.json|CNAME|_headers|_redirects|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.vercel\/.*|\.netlify\/.*|\.github\/workflows\/.*)$/u;

/** Lines BL1 added that read as an assistive-technology support claim. A negation belongs in authority text, not here. */
const atClaimPatterns = [
  /\b(?:supports?|supported by|compatible with|works? with|tested (?:with|on)|verified (?:with|on)|certified|conforms? to|conformant|compliant with|passes)\b[^.\n]{0,60}\b(?:screen[- ]?readers?|NVDA|JAWS|VoiceOver|TalkBack|assistive[- ]technolog(?:y|ies)|WCAG|Section 508)/iu,
  /\b(?:WCAG|ARIA)\b[^.\n]{0,40}\b(?:compliant|conformant|conforms|certified)\b/iu,
  /\b(?:screen[- ]?reader|assistive[- ]technology|a11y|accessibility)[- ](?:tested|verified|certified|compliant|friendly|compatible)\b/iu,
];
const atMention = /assistive|screen[- ]?reader|VoiceOver|NVDA|JAWS|TalkBack|WCAG/iu;
// Product surfaces: where a support claim would reach a reader. Authority text carries negations and is not claim-scanned.
const productSurface = /^(?:catalog\/(?:patterns|guides)\/|apps\/docs\/(?:src\/|README\.md)|apps\/react-storybook\/README\.md)/u;

function addedLines(base, head, path) {
  const lines = [];
  let line = 0;
  for (const row of git('diff', '-U0', '--no-color', base, head, '--', path).split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(row);
    if (hunk) {
      line = Number(hunk[1]);
    } else if (row.startsWith('+') && !row.startsWith('+++')) {
      lines.push({ line, text: row.slice(1) });
      line += 1;
    }
  }
  return lines;
}

const classNames = (css) => sorted(new Set(css.match(/\.muxui-[A-Za-z0-9_-]+/gu) ?? []));
const declaredProperties = (css) => sorted(new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/gu)].map(([, name]) => name)));
const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides'];

function manifestVersion(revision, path) {
  return json(revision, path).version ?? null;
}

function runMuxui(args) {
  const result = spawnSync(process.execPath, ['packages/tooling/bin/muxui.mjs', ...args], { cwd: repositoryRoot, encoding: 'utf8' });
  return { exitCode: result.status, stdout: result.stdout };
}

/** The registry as `npm view` reports it now, compared with the R1 exit observation. Read-only. */
function observeRegistry() {
  const recorded = JSON.parse(readFileSync(resolve(repositoryRoot, 'tests/evidence/r1-exit/artifacts/registry-observation.json'), 'utf8')).view;
  const result = spawnSync('npm', ['view', '@muxui/react', '--json'], { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    return { pass: false, observed: null, failure: `npm view @muxui/react exited ${result.status}: ${result.stderr.trim().split('\n').at(-1)}` };
  }
  const view = JSON.parse(result.stdout);
  const versionTimes = Object.keys(view.time ?? {}).filter((key) => key !== 'created' && key !== 'modified');
  const observed = {
    distTags: view['dist-tags'],
    integrity: view.dist?.integrity ?? null,
    shasum: view.dist?.shasum ?? null,
    versions: view.versions,
    versionTimes: Object.fromEntries(versionTimes.map((key) => [key, view.time[key]])),
  };
  const expected = {
    distTags: recorded.distTags,
    integrity: recorded.integrity,
    shasum: recorded.shasum,
    versions: recorded.versions,
    versionTimes: Object.fromEntries(Object.entries(recorded.time).filter(([key]) => key !== 'created' && key !== 'modified')),
  };
  return {
    pass: sameJson(observed, expected),
    observed,
    expectedFrom: 'tests/evidence/r1-exit/artifacts/registry-observation.json (the R1 exit registry read-back)',
    expected,
  };
}

/** Runs every E-BL1-09 check and returns `{ pass, base, head, checks }`. */
export function auditBoundary({ base = preBl1Base, head = 'HEAD', offline = false } = {}) {
  const baseRevision = resolveRevision(base);
  const headRevision = resolveRevision(head);
  const mergeRevision = resolveRevision(bl1MergeRevision);
  const checks = [];
  const check = (id, claim, pass, observations) => checks.push({ id, claim, pass, observations });

  // 1. @muxui/react: package manifest.
  const reactManifest = { base: json(baseRevision, 'packages/react/package.json'), head: json(headRevision, 'packages/react/package.json') };
  check(
    'react-package-manifest',
    '@muxui/react has the same package.json (version, exports, dependencies, files) before and after BL1.',
    blob(baseRevision, 'packages/react/package.json') === blob(headRevision, 'packages/react/package.json'),
    {
      version: { base: reactManifest.base.version, head: reactManifest.head.version },
      exportSubpaths: sorted(Object.keys(reactManifest.head.exports)),
      packageJsonBlob: blob(headRevision, 'packages/react/package.json'),
    },
  );

  // 2. @muxui/react: source, outside tests.
  const reactChanges = statuses(baseRevision, headRevision, 'packages/react').filter(({ path }) => !path.startsWith('packages/react/test/'));
  const reactTests = statuses(baseRevision, headRevision, 'packages/react/test').map(({ status, path }) => `${status} ${path}`);
  check(
    'react-source-files',
    'Outside packages/react/test, BL1 changed one file of packages/react and added or removed none: the Sidebar stylesheet fix (#227). No module under src/ that defines an export changed.',
    reactChanges.length === 1 && reactChanges[0].status === 'M' && reactChanges[0].path === 'packages/react/src/supplemental/styles.css',
    { changedOutsideTests: reactChanges, testFiles: reactTests },
  );

  // 3. @muxui/react: the stylesheet adds no class name and no custom property declaration.
  const stylesheet = 'packages/react/src/supplemental/styles.css';
  const baseCss = show(baseRevision, stylesheet);
  const headCss = show(headRevision, stylesheet);
  const numstat = git('diff', '--numstat', baseRevision, headRevision, '--', stylesheet).trim().split('\t');
  check(
    'react-stylesheet-names',
    'The stylesheet that changed adds and removes no .muxui-* class name and no custom property declaration. Its declared names are the same before and after.',
    sameJson(classNames(baseCss), classNames(headCss)) && sameJson(declaredProperties(baseCss), declaredProperties(headCss)),
    {
      path: stylesheet,
      linesAdded: Number(numstat[0]),
      linesRemoved: Number(numstat[1]),
      classNames: classNames(headCss).length,
      declaredCustomProperties: declaredProperties(headCss).length,
      commits: git('log', '--format=%h %s', `${baseRevision}..${headRevision}`, '--', stylesheet).trim().split('\n'),
      note: 'The shipped stylesheet bytes changed (existing Sidebar rules), so the packed @muxui/react is not byte-identical to the pre-BL1 base. That is a styling fix, not an API, export, or version change.',
    },
  );

  // 4. Dependencies and lockfile.
  const manifests = names(baseRevision, headRevision, '*package.json').filter((path) => !path.includes('node_modules'));
  const dependencyChanges = [];
  const versionChanges = [];
  for (const path of manifests) {
    const before = json(baseRevision, path);
    const after = json(headRevision, path);
    for (const field of dependencyFields) {
      if (!sameJson(before[field] ?? {}, after[field] ?? {})) dependencyChanges.push({ path, field });
    }
    if (before.version !== after.version) versionChanges.push({ package: after.name, from: before.version, to: after.version });
  }
  const lockfileChanges = names(baseRevision, headRevision, 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.node-version');
  check(
    'no-dependency-change',
    'No dependency, devDependency, peerDependency, or override changed in any package.json, and the lockfile and workspace files are unchanged.',
    dependencyChanges.length === 0 && lockfileChanges.length === 0,
    { manifestsChanged: manifests, dependencyChanges, lockfileChanges },
  );
  const versionAllowed = new Set(['@muxui/catalog', '@muxui/schema', '@muxui/tooling']);
  check(
    'versions-follow-decision-0026',
    'Only @muxui/schema, @muxui/catalog, and @muxui/tooling changed version (Decision 0026 item 10), and @muxui/react did not.',
    versionChanges.every(({ package: name }) => versionAllowed.has(name)),
    { versionChanges },
  );

  // 5. Packages stay private; nothing new publishes.
  const allManifests = git('ls-tree', '-r', '--name-only', headRevision).split('\n').filter((path) => /(?:^|\/)package\.json$/u.test(path) && !path.includes('node_modules') && !path.includes('/fixtures/'));
  const packages = allManifests.map((path) => ({ path, ...json(headRevision, path) }));
  const publishable = packages.filter(({ private: isPrivate }) => isPrivate !== true).map(({ name, path }) => ({ name, path }));
  const publishScripts = [];
  for (const path of manifests) {
    const before = json(baseRevision, path).scripts ?? {};
    const after = json(headRevision, path).scripts ?? {};
    for (const [name, script] of Object.entries(after)) {
      if (before[name] !== script && /\b(?:publish|deploy|dist-tag|wrangler|netlify|vercel|gh-pages)\b/u.test(`${name} ${script}`)) publishScripts.push({ path, name });
    }
  }
  const publishConfig = packages.filter((manifest) => manifest.publishConfig !== undefined).map(({ name }) => name);
  check(
    'packages-stay-private',
    'Every workspace package, @muxui/react included, is private; no package gained a publish or deploy script, and none has a publishConfig.',
    publishable.length === 0 && publishScripts.length === 0 && publishConfig.length === 0,
    { workspacePackagesChecked: packages.length, nonPrivatePackages: publishable.map(({ name }) => name), publishScripts, packagesWithPublishConfig: publishConfig },
  );

  // 6. No workflow or hosting configuration was added or changed.
  const workflowChanges = names(baseRevision, headRevision, '.github');
  const hostingAdded = statuses(baseRevision, headRevision).filter(({ status, path }) => status !== 'D' && hostingPaths.test(path)).map(({ path }) => path);
  const astroConfig = addedLines(baseRevision, headRevision, 'apps/docs/astro.config.mjs').filter(({ text }) => /\b(?:site|base|adapter|output)\s*:|@astrojs\/(?:netlify|vercel|cloudflare|node)/u.test(text));
  check(
    'no-workflow-or-hosting-config',
    'BL1 added or changed no workflow, no hosting or deployment file, and no Astro site, base, adapter, or output setting.',
    workflowChanges.length === 0 && hostingAdded.length === 0 && astroConfig.length === 0,
    { workflowChanges, hostingFilesAdded: hostingAdded, astroDeploymentSettingsAdded: astroConfig },
  );

  // 7. Registry: nothing published, retagged.
  const registry = offline ? { pass: true, skipped: 'offline' } : observeRegistry();
  check(
    'registry-unchanged',
    'The npm registry still shows only @muxui/react@0.1.0-rc.1 with the R1 exit dist-tags, integrity, and publish time.',
    registry.pass,
    registry,
  );

  // 8. No assistive-technology support claim on a product surface.
  const surfaceFiles = statuses(baseRevision, headRevision).filter(({ status, path }) => status !== 'D' && productSurface.test(path)).map(({ path }) => path);
  const claims = [];
  const mentions = [];
  for (const path of surfaceFiles) {
    for (const { line, text } of addedLines(baseRevision, headRevision, path)) {
      if (atClaimPatterns.some((pattern) => pattern.test(text))) claims.push({ path, line, text: text.trim().slice(0, 200) });
      else if (atMention.test(text)) mentions.push({ path, line, text: text.trim().slice(0, 200) });
    }
  }
  check(
    'no-assistive-technology-claim',
    'No line BL1 added to a catalog pattern, guide, docs page, or Storybook readme claims support, testing, or conformance for a screen reader, assistive technology, or WCAG (Decision 0022).',
    claims.length === 0,
    { filesScanned: surfaceFiles.length, claims, mentions, mentionNote: 'Mentions are structural descriptions (what the markup exposes), listed for the independent content review; they are not support claims.' },
  );

  // 9. plan, install, registry, and consumer scaffold are absent from the CLI and the manifest.
  const manifestResponse = JSON.parse(runMuxui(['manifest', '--detail', 'full', '--json']).stdout);
  const commandNames = manifestResponse.data.cli.commands.map(({ name }) => name);
  const capabilities = manifestResponse.data.capabilities.map(({ id, availability, policy }) => ({ id, availability, effect: policy.effect }));
  const unavailable = ['plan', 'install', 'add', 'init', 'registry', 'scaffold', 'create', 'migrate'].map((name) => {
    const { exitCode, stdout } = runMuxui([name, '--json']);
    const error = JSON.parse(stdout).error;
    return { command: name, exitCode, code: error?.code ?? null, ruleId: error?.ruleId ?? null };
  });
  const registryCommands = json(headRevision, 'packages/tooling/command-registry.json').commands.map(({ name }) => name);
  check(
    'plan-install-registry-scaffold-unavailable',
    'The CLI and the capability manifest expose only manifest, list, search, and get, all read-only. plan, install, add, init, registry, scaffold, create, and migrate are rejected as unknown commands.',
    sameJson(commandNames, ['manifest', 'list', 'search', 'get']) && sameJson(registryCommands, ['manifest', 'list', 'search', 'get'])
      && capabilities.every(({ effect }) => effect === 'read-only')
      && unavailable.every(({ exitCode, ruleId }) => exitCode === 2 && ruleId === 'cli.command.unknown'),
    {
      manifestCommands: commandNames,
      registryCommands,
      capabilities,
      unavailableCommands: unavailable,
      artifactKinds: manifestResponse.data.artifactKinds,
      note: 'scaffoldPattern and scaffoldComponent are maintainer authoring functions in @muxui/tooling for canonical source, not CLI commands and not a consumer scaffold.',
    },
  );

  // 10. No new component, token, capability, or non-React platform.
  const catalogChanges = names(baseRevision, headRevision, 'catalog/components', 'catalog/tokens', 'catalog/capabilities', 'catalog/react-r1-0', 'catalog/react-r1-5', 'catalog/react-r1-6');
  const patternPlatforms = sorted(new Set(git('ls-tree', '-r', '--name-only', headRevision, 'catalog/patterns').split('\n')
    .filter((path) => path.endsWith('/artifact.json')).flatMap((path) => json(headRevision, path).platforms)));
  check(
    'no-new-component-token-capability-or-platform',
    'BL1 added or changed no component, token, capability, or React family record, and every pattern targets web.react only.',
    catalogChanges.length === 0 && sameJson(patternPlatforms, ['web.react']),
    { changedCatalogRecords: catalogChanges, patternPlatforms, strategyFilesChanged: names(baseRevision, headRevision, 'strategy'), guideFilesChanged: names(baseRevision, headRevision, 'catalog/guides') },
  );

  // 11. Close-out commits on top of the last BL1 merge touch only evidence, decisions, and their verifier test.
  const isDescendant = spawnSync('git', ['merge-base', '--is-ancestor', mergeRevision, headRevision], { cwd: repositoryRoot }).status === 0;
  const closeoutChanges = isDescendant ? names(mergeRevision, headRevision) : [];
  const outside = closeoutChanges.filter((path) => !closeoutPrefixes.some((prefix) => path === prefix || path.startsWith(prefix)));
  check(
    'closeout-scope',
    `Commits after the last BL1 merge (${bl1MergeRevision}) change only retained evidence, decision records, and the evidence verifier test.`,
    isDescendant && outside.length === 0,
    { descendsFromLastBl1Merge: isDescendant, pathsOutsideAllowedPrefixes: outside, changedPathCount: closeoutChanges.length },
  );

  return {
    schema: 'muxui-bl1-boundary-audit-v1',
    base: { revision: baseRevision, subject: git('log', '-1', '--format=%s', baseRevision).trim() },
    head: { revision: headRevision, lastBl1Merge: mergeRevision },
    pass: checks.every(({ pass }) => pass),
    checks,
  };
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
