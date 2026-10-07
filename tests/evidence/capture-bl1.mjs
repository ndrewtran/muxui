// BL1 retained evidence: E-BL1-01 to E-BL1-11 for the shipped seed blocks (the poster grid,
// the marketing hero, the pricing plans, and the account settings).
//
//   node tests/evidence/capture-bl1.mjs [--capture-timestamp=<ISO-8601 UTC>] [--content-review=<review record>]
//
// Run it from the exact committed implementation revision with a clean worktree (only
// tests/evidence/bl1 may differ). It runs every proof below, refuses to write when one fails,
// and rewrites the artifacts, records, validation excerpts, visual captures, validation
// summary, and index under tests/evidence/bl1:
//
//   E-BL1-01  schema and compiler fixtures          E-BL1-07  surface-parity matrix
//   E-BL1-02  authoring fixtures                    E-BL1-08  generation identity and catalog digest
//   E-BL1-03  packed typecheck, SSR, hydration      E-BL1-09  platform, release, and boundary audit
//   E-BL1-04  Storybook audits, cross-engine tests  E-BL1-10  content scan and independent review
//   E-BL1-05  docs check (check-blocks)             E-BL1-11  catalog regression baseline
//   E-BL1-06  width-preset captures and overflow
//
// `--content-review` names the independent reviewer's E-BL1-10 record. The first capture
// sanitizes it and retains it under artifacts/; a later capture without the flag reuses the
// retained file, which must still match its recorded digest. A proof tool is bound by its
// bytes and by the last commit that changed it, and must already be committed.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from '../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { hasUnsanitizedEvidenceOutput } from '../../tooling/audits/repository-policy/src/evidence-verify.mjs';
import { patternVariantExamples } from '../../tooling/audits/repository-policy/src/pattern-variants.mjs';
import { pageWidths, toolbarPresets } from '../../apps/docs/src/lib/block-presets.ts';
import { auditBoundary, preBl1Base } from './bl1/boundary-audit.mjs';
import { scanBlockContent } from './bl1/content-scan.mjs';
import { parseTestReport, runProof, sanitizeOutput, sanitizationRules } from './bl1/proof-run.mjs';
import {
  compileBundle,
  isPatternSource,
  loadThresholds,
  measureRegression,
  regressionFailures,
  repositoryRoot,
  thresholdsPath,
} from './bl1/regression.mjs';
import { normalizationRule, surfaceParityMatrix } from './bl1/surface-parity.mjs';
import { createCatalogApi } from '../../packages/catalog/src/index.mjs';

const root = 'tests/evidence/bl1';
const captureTool = 'tests/evidence/capture-bl1.mjs';
const helperTools = ['regression.mjs', 'proof-run.mjs', 'boundary-audit.mjs', 'content-scan.mjs', 'surface-parity.mjs'].map((name) => `${root}/${name}`);
const authority = 'strategy/milestone-roadmap.md: BL1 Blocks showcase (Decision 0026)';
// The catalogDigest pinned by packages/tooling/test/goldens/manifest-brief.txt at the BL1-A2 head 68f6f9f8,
// the last commit before any shipped pattern.
const a2CatalogDigest = 'sha256:ab0998dfb2f51aa572e77f16e5d5f80982242a5c5df4aac16d66b1390bbc9671';
const a2Commit = '68f6f9f8fdf462229a57f99d7675058eb8b2394d';
const reviewArtifactPath = `${root}/artifacts/E-BL1-10-content-review.md`;
const pageWidthDecision = 'decisions/0026-amendment-01-page-width-presets.md';

const captureTimestamp = process.argv.find((argument) => argument.startsWith('--capture-timestamp='))?.split('=')[1]
  ?? new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
const reviewInput = process.argv.find((argument) => argument.startsWith('--content-review='))?.slice('--content-review='.length);
const command = (executable, args) => execFileSync(executable, args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const tail = (id) => id.slice(id.lastIndexOf(':') + 1);

const inRoot = (line) => line.slice(3).startsWith(`${root}/`);
const dirty = command('git', ['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean).filter((line) => !inRoot(line));
if (dirty.length > 0) throw new Error(`EVIDENCE_DIRTY_WORKTREE: commit the implementation first; changed: ${dirty.join(', ')}`);

const sourceRevision = command('git', ['rev-parse', 'HEAD']);
const sourceTree = command('git', ['rev-parse', 'HEAD^{tree}']);

function chromeVersion() {
  for (const candidate of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) {
    if (!candidate || !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim();
  }
  return null;
}
const playwrightCache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), 'Library/Caches/ms-playwright');
const environment = {
  architecture: process.arch,
  browsers: {
    chrome: chromeVersion(),
    playwrightBuilds: existsSync(playwrightCache) ? readdirSync(playwrightCache).filter((name) => /^(?:chromium|firefox|webkit)/u.test(name)).sort() : [],
    playwrightCore: JSON.parse(await readFile(join(repositoryRoot, 'apps/scale/package.json'), 'utf8')).devDependencies['playwright-core'],
  },
  node: process.version,
  pnpm: command('pnpm', ['--version']),
  runnerOs: `macOS ${command('sw_vers', ['-productVersion'])}`,
};

// ---- Proof runner: every command runs once, must exit 0, and leaves a sanitized excerpt. ----
const excerpts = [];
const validationResults = [];
function prove(label, spec, { observed = [] } = {}) {
  const result = runProof(spec);
  if (result.exitCode !== 0) {
    throw new Error(`BL1_PROOF_FAILED: ${result.command} exited ${result.exitCode}\n${result.output.split('\n').slice(-60).join('\n')}`);
  }
  const report = parseTestReport(result.output);
  if (report.summary.fail > 0 || report.results.some(({ outcome }) => outcome === 'fail')) throw new Error(`BL1_PROOF_FAILED: ${result.command} reported a failing test`);
  const text = result.output.endsWith('\n') ? result.output : `${result.output}\n`;
  const excerpt = { path: `${root}/validation/${label}.txt`, sha256: sha256(text) };
  excerpts.push({ ...excerpt, text });
  validationResults.push({ command: result.command, exitState: 0, observedAssertions: observed.map((id) => ({ id, value: excerpt.sha256 })) });
  return {
    ...result,
    report,
    ref: { command: result.command, exitCode: 0, tests: report.summary, excerpt, rawOutput: result.rawOutput },
  };
}
const passed = (proof, prefix) => proof.report.results.filter(({ depth, name, outcome }) => depth === 0 && outcome === 'pass' && name.startsWith(prefix)).map(({ name }) => name);
function requirePassed(proof, names) {
  const ran = new Set(proof.report.results.filter(({ outcome }) => outcome === 'pass').map(({ name }) => name));
  const missing = names.filter((name) => !ran.has(name));
  if (missing.length > 0) throw new Error(`BL1_TEST_MISSING: ${missing.join('; ')} did not pass in ${proof.command}`);
}
async function requireSource(file, snippets) {
  const text = await readFile(join(repositoryRoot, file), 'utf8');
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  if (missing.length > 0) throw new Error(`BL1_FIXTURE_MISSING: ${file} no longer holds ${missing.join('; ')}`);
}

// ---- Catalog facts every proof is checked against. ----
const [first, second] = [await compileBundle(), await compileBundle()];
const patterns = first.bundle.artifacts.filter(({ kind }) => kind === 'pattern');
const variants = await patternVariantExamples(repositoryRoot);
if (patterns.length === 0 || variants.length === 0) throw new Error('BL1_NO_PATTERN: the catalog compiles no pattern');
const patternSlugs = patterns.map(({ id }) => tail(id));
const storyIds = variants.map(({ patternSlug, variantSlug }) => `muxui-block-${patternSlug}--${variantSlug}`);
const groupOf = new Map(patterns.map(({ id, group }) => [tail(id), group]));

// ---- E-BL1-08: repeated generation is a no-op, and the digest moves only for the added sources. ----
if (first.bytes !== second.bytes) throw new Error('E-BL1-08: two compiles of the same sources differ');
const withoutPatterns = await compileBundle((entry) => !isPatternSource(entry));
if (withoutPatterns.bundle.catalogDigest !== a2CatalogDigest) {
  throw new Error(`E-BL1-08: the catalog without patterns has digest ${withoutPatterns.bundle.catalogDigest}, not the BL1-A2 digest ${a2CatalogDigest}`);
}
const manifest = JSON.parse(await readFile(join(repositoryRoot, 'packages/catalog/catalog-sources.json'), 'utf8'));
const addedEntries = manifest.records.filter(isPatternSource).map(({ family, path }) => ({ family, path }));
const baseIds = new Set(withoutPatterns.bundle.artifacts.map(({ id }) => id));
const addedIds = first.bundle.artifacts.map(({ id }) => id).filter((id) => !baseIds.has(id));
const added = new Set(addedIds);
const addedRelations = first.bundle.relations.filter(({ source, target }) => added.has(source) || added.has(target));
const strip = ({ catalogDigest: _digest, sourceRevision: _revision, ...bundle }) => bundle;
const remainder = strip(structuredClone(first.bundle));
remainder.artifacts = remainder.artifacts.filter(({ id }) => !added.has(id));
remainder.relations = remainder.relations.filter(({ source, target }) => !added.has(source) && !added.has(target));
remainder.searchIndex = remainder.searchIndex.filter(({ id }) => !added.has(id));
if (canonicalJson(remainder) !== canonicalJson(strip(withoutPatterns.bundle))) {
  throw new Error('E-BL1-08: the catalog differs from the BL1-A2 catalog by more than the added sources');
}
const generationCheck = prove('E-BL1-08-generate-check', { command: 'pnpm', args: ['generate:check'] });
const identity = /independent clean checkouts ([0-9a-f]{40}) generated identical projections with clean worktrees \((sha256:[0-9a-f]{64})\)/u.exec(generationCheck.output);
if (!identity || identity[1] !== sourceRevision) throw new Error('E-BL1-08: pnpm generate:check did not report identical generation at the source revision');
validationResults.find(({ command: ran }) => ran === 'pnpm generate:check').observedAssertions = [{ id: 'generation-identity', value: identity[2] }];

// ---- E-BL1-11: the baseline for the seed set, held to the thresholds committed before capture. ----
const thresholds = await loadThresholds();
const api = createCatalogApi(first.bundle);
const measured = measureRegression({ api, baselineApi: createCatalogApi(withoutPatterns.bundle), thresholds });
const failures = regressionFailures(measured, thresholds);
if (failures.length > 0) throw new Error(`E-BL1-11: the seed set breaks its thresholds:\n${failures.join('\n')}`);
// A query the pattern ranks below first stays visible as a weakness, not a pass.
const knownDiscoveryWeaknesses = thresholds.discovery.queries.filter(({ knownWeakness }) => knownWeakness !== undefined).map(({ query, expectedId, knownWeakness }) => ({
  query,
  expectedId,
  rank: measured.discovery.queries.find((candidate) => candidate.query === query).rank,
  weakness: knownWeakness,
}));
const weaknessSummary = knownDiscoveryWeaknesses.map(({ query, rank }) => `the query "${query}" ranks the pattern at ${rank}, not first`).join('; ');
const regressionTests = prove('E-BL1-11-regression-test', { command: process.execPath, args: ['--test', 'packages/tooling/test/pattern-regression.test.mjs'] }, { observed: ['regression-test'] });

// ---- E-BL1-01 and E-BL1-07/08 catalog tests: one run of the schema and catalog pattern fixtures. ----
const schemaTests = prove('E-BL1-01-schema-and-compiler-fixtures', {
  command: process.execPath,
  args: ['--test', 'packages/schema/test/pattern.test.mjs', 'packages/catalog/test/pattern-catalog.test.mjs'],
}, { observed: ['schema-and-compiler-fixtures'] });
const closedSchema = 'E-BL1-01 negative: the closed schema names the earliest owner for each record error';
const artifactGraph = 'E-BL1-01 negative: the artifact graph names the pattern field that owns each error';
const undeclaredImport = 'E-BL1-01 negative: a variant importing an undeclared component names pattern.participants and its source';
const schemaFile = 'packages/schema/test/pattern.test.mjs';
const catalogFile = 'packages/catalog/test/pattern-catalog.test.mjs';
// Each required negative fixture, the test that runs it, and the case it is in.
const requiredNegatives = [
  { negative: 'an unknown field', file: schemaFile, test: closedSchema, case: "label: 'unknown field'", assertedDiagnostic: 'MUXUI_SCHEMA_INVALID at $/layout: is an unknown field' },
  { negative: 'a category outside the enum', file: schemaFile, test: closedSchema, case: "label: 'category outside the enum'", assertedDiagnostic: 'MUXUI_SCHEMA_INVALID at $/category: must be one of; owner pattern-contract' },
  { negative: 'an unknown participant', file: schemaFile, test: artifactGraph, case: "label: 'unknown participant'", assertedDiagnostic: 'MUXUI_RELATION_INVALID at $/participants/0/component: the component does not exist; owner pattern-contract' },
  { negative: 'a variant example importing an undeclared Mux component', file: catalogFile, test: undeclaredImport, case: 'imports Button, which pattern\\.participants does not declare', assertedDiagnostic: 'MUXUI_RELATION_INVALID at $/participants with the variant source and line; owner pattern-contract' },
  { negative: 'a missing variant example', file: schemaFile, test: artifactGraph, case: "label: 'missing variant example'", assertedDiagnostic: 'MUXUI_RELATION_INVALID at $/variants/0/example: the example does not exist; owner pattern-contract' },
  { negative: 'a duplicate variant example', file: schemaFile, test: closedSchema, case: "label: 'duplicate variant in one pattern'", assertedDiagnostic: 'MUXUI_SCHEMA_INVALID at $/variants/1/example: listed more than once; owner pattern-contract' },
  { negative: 'a duplicate variant example (listed by a second pattern)', file: schemaFile, test: artifactGraph, case: "label: 'variant listed by a second pattern'", assertedDiagnostic: 'MUXUI_RELATION_INVALID at $/variants/0/example: already a variant of another pattern; owner pattern-contract' },
  { negative: 'a pattern with no variants', file: schemaFile, test: closedSchema, case: "label: 'no variants'", assertedDiagnostic: 'MUXUI_SCHEMA_INVALID at $/variants: at least 1 items; owner pattern-contract' },
];
for (const file of [schemaFile, catalogFile]) await requireSource(file, requiredNegatives.filter((entry) => entry.file === file).map(({ case: snippet }) => snippet));
requirePassed(schemaTests, [...new Set(requiredNegatives.map(({ test }) => test))]);
const positiveFixtures = [
  'E-BL1-01: a valid pattern and its variant example validate and derive one example-of edge',
  'E-BL1-01: the fixture pattern compiles with derived group, revision, and exact variant source',
];
requirePassed(schemaTests, positiveFixtures);

// ---- E-BL1-02: authoring support. ----
const authoringTests = prove('E-BL1-02-authoring-fixtures', { command: process.execPath, args: ['--test', 'packages/tooling/test/pattern-authoring.test.mjs'] }, { observed: ['authoring-fixtures'] });
const authoringCapabilities = [
  ['scaffold round-trips through validation and compilation', /scaffold/u],
  ['semantic diff covers patterns and variant examples', /semantic diff/u],
  ['revision explainer covers patterns and variant examples', /revision/u],
  ['affected closure reaches a pattern from its variants', /affected closure/u],
  ['source-linked diagnostics cover patterns and variant examples', /diagnosed/u],
].map(([capability, expression]) => {
  const tests = passed(authoringTests, 'E-BL1-02').filter((name) => expression.test(name));
  if (tests.length === 0) throw new Error(`E-BL1-02: no passing authoring test for: ${capability}`);
  return { capability, tests };
});

// ---- E-BL1-03: packed typecheck, SSR, and hydration per variant. ----
const packedProof = prove('E-BL1-03-packed-ssr-and-hydration', { command: 'pnpm', args: ['--filter', '@muxui/repository-policy', 'run', 'proof:pattern-variants'] }, { observed: ['packed-ssr-and-hydration'] });
const variantLine = /^\[E-BL1-03\] (\S+): packed SSR (\d+) bytes with (\d+) rows, hydrated without mismatch to (\d+) rows(?: \(console: (.*)\))?$/u;
const packedVariants = packedProof.output.split('\n').map((line) => variantLine.exec(line)).filter(Boolean).map(([, id, markupBytes, serverRows, hydratedRows, consoleError]) => ({
  id, markupBytes: Number(markupBytes), serverRows: Number(serverRows), hydratedRows: Number(hydratedRows), consoleErrors: consoleError === undefined ? [] : [consoleError],
}));
if (canonicalJson(packedVariants.map(({ id }) => id).sort()) !== canonicalJson(variants.map(({ variantId }) => variantId).sort())) {
  throw new Error(`E-BL1-03: the packed proof covered ${packedVariants.map(({ id }) => id).join(', ')}, not every catalog variant`);
}
if (packedVariants.some(({ consoleErrors, markupBytes }) => consoleErrors.length > 0 || markupBytes === 0)) throw new Error('E-BL1-03: a variant logged a console error or rendered nothing');
const byId = (id) => packedVariants.find((variant) => variant.id === id);
if (byId('muxui:example:poster-grid-css-grid')?.serverRows !== 12 || byId('muxui:example:poster-grid-css-grid')?.hydratedRows !== 12) throw new Error('E-BL1-03: the CSS-grid poster grid must render and hydrate 12 rows');
const virtualizedRows = byId('muxui:example:poster-grid-virtualized');
if (!(virtualizedRows?.hydratedRows >= 1 && virtualizedRows.hydratedRows <= 999)) throw new Error('E-BL1-03: the virtualized poster grid must hydrate a window of rows');
const typecheckTest = 'packed @muxui/react declarations typecheck every current catalog example';
const typecheckProof = prove('E-BL1-03-packed-declarations-typecheck', {
  command: process.execPath,
  args: ['--test', `--test-name-pattern=${typecheckTest}`, 'packages/react/test/catalog-examples-types.test.mjs'],
}, { observed: ['packed-declarations-typecheck'] });
requirePassed(typecheckProof, [typecheckTest]);
await requireSource('packages/react/test/catalog-examples-types.test.mjs', ['patternVariantExamples', 'variants.length > 0']);

// ---- E-BL1-04: Storybook audits per Block page, and cross-engine browser tests. ----
const storybook = prove('E-BL1-04-storybook-block-pages', {
  command: 'pnpm',
  args: ['--filter', '@muxui/react-storybook', 'run', 'check:scoped'],
  env: { MUXUI_STORYBOOK_AUDIT_PROOF: 'component', MUXUI_STORYBOOK_FAMILIES: patternSlugs.join(',') },
}, { observed: ['storybook-block-pages'] });
const a11yLine = /\[storybook-a11y\] partial component proof: .* \((\d+) pages, light\+dark, /u.exec(storybook.output);
if (!a11yLine || Number(a11yLine[1]) !== storyIds.length) throw new Error(`E-BL1-04: the axe audit covered ${a11yLine?.[1] ?? 'no'} pages, not the ${storyIds.length} variant pages`);
requirePassed(storybook, ['selected Mux UI React Storybook pages are axe-clean in light and dark', 'selected Storybook pages paint only canonical Mux colours in light and dark']);
const paintByPage = storyIds.map((id) => {
  const schemes = ['light', 'dark'].map((scheme) => {
    const line = new RegExp(`^ℹ ${scheme}/${id}: (\\d+) visible elements, (\\d+) paint occurrences$`, 'mu').exec(storybook.output);
    if (!line) throw new Error(`E-BL1-04: the colour audit has no ${scheme} result for ${id}`);
    return [scheme, { visibleElements: Number(line[1]), paintOccurrences: Number(line[2]) }];
  });
  return { page: id, ...Object.fromEntries(schemes) };
});

const browserTests = ['pattern-poster-grid', 'pattern-marketing-hero', 'pattern-pricing-plans', 'pattern-account-settings'].map((name) => `test/browser/${name}.test.mjs`);
const engines = ['chromium', 'firefox', 'webkit'];
const crossEngine = prove('E-BL1-04-cross-engine-browser-tests', {
  command: process.execPath,
  args: ['--test', '--test-concurrency=1', ...browserTests],
  cwd: 'packages/react',
  env: { MUXUI_BROWSER_ENGINES: engines.join(',') },
}, { observed: ['cross-engine-browser-tests'] });
const engineResults = engines.flatMap((engine) => crossEngine.report.results
  .filter(({ depth, name, outcome }) => depth === 0 && outcome === 'pass' && name.endsWith(` in ${engine}`))
  .map(({ name }) => ({ engine, test: name.slice(0, -` in ${engine}`.length) })));
if (engineResults.length !== browserTests.length * engines.length) throw new Error(`E-BL1-04: ${engineResults.length} engine runs passed, not ${browserTests.length * engines.length}`);
// Spec output prints a test's subtests before its own line, so subtests attach to the next depth-0 result.
const behaviourRuns = [];
let pendingSubtests = [];
for (const { depth, name, outcome } of crossEngine.report.results) {
  if (depth === 0) {
    behaviourRuns.push({ run: name, outcome, subtests: pendingSubtests });
    pendingSubtests = [];
  } else if (depth === 1) {
    pendingSubtests.push(name);
  }
}

// ---- E-BL1-05 and E-BL1-06: the docs check, then the built site in a browser. ----
const docsCheck = prove('E-BL1-05-docs-check', { command: 'pnpm', args: ['--filter', '@muxui/docs', 'run', 'check'] }, { observed: ['docs-check'] });
const blocksLine = /^Blocks contract passed: (\d+) patterns? in the rail and gallery, (\d+) variant pages? with exact-source Code views and canonical preview routes, (\d+) component pages with only component-bound examples, (\d+) with "Used in blocks"\.$/mu.exec(docsCheck.output);
if (!blocksLine) throw new Error('E-BL1-05: the docs check did not print the Blocks contract report');
if (Number(blocksLine[1]) !== patterns.length || Number(blocksLine[2]) !== variants.length) throw new Error(`E-BL1-05: the Blocks contract covered ${blocksLine[1]} patterns and ${blocksLine[2]} variants, not ${patterns.length} and ${variants.length}`);

const captureDirectory = await mkdtemp(join(tmpdir(), 'muxui-bl1-captures-'));
let visual;
try {
  const docsBrowser = prove('E-BL1-06-docs-browser-captures', {
    command: 'pnpm',
    args: ['--filter', '@muxui/scale', 'run', 'check:browser:docs'],
    env: { MUXUI_BLOCKS_CAPTURE_DIR: captureDirectory },
  }, { observed: ['docs-browser-captures'] });
  const overflowRaw = await readFile(join(captureDirectory, 'overflow-report.json'));
  const overflowReport = JSON.parse(overflowRaw);
  const themes = ['light', 'dark'];
  const presetKeys = [...toolbarPresets.map(({ width }) => String(width)), 'full'];
  // Every variant at every toolbar preset in both themes; every marketing variant at every page width in both themes.
  const expected = variants.flatMap(({ patternSlug, variantSlug }) => themes.flatMap((theme) => [
    ...presetKeys.map((preset) => ({ kind: 'preset', block: patternSlug, variant: variantSlug, theme, key: preset, file: `${patternSlug}--${variantSlug}--${theme}--preset-${preset}.png` })),
    ...(groupOf.get(patternSlug) === 'marketing' ? pageWidths.map((width) => ({ kind: 'page-width', block: patternSlug, variant: variantSlug, theme, key: String(width), file: `${patternSlug}--${variantSlug}--${theme}--page-${width}.png` })) : []),
  ]));
  const files = (await readdir(captureDirectory)).filter((name) => name.endsWith('.png')).sort();
  if (canonicalJson(files) !== canonicalJson(expected.map(({ file }) => file).sort())) {
    throw new Error(`E-BL1-06: the captures differ from the expected set\nexpected ${expected.length}, found ${files.length}`);
  }
  const measurements = overflowReport.measurements;
  if (canonicalJson(overflowReport.pageWidths) !== canonicalJson([...pageWidths]) || measurements.length !== expected.length) throw new Error('E-BL1-06: the overflow report does not cover every capture');
  const overflowing = measurements.filter(({ overflowX }) => overflowX !== false);
  if (overflowing.length > 0) throw new Error(`E-BL1-06: ${overflowing.length} captures overflow horizontally`);
  const captures = [];
  for (const entry of expected) {
    const bytes = await readFile(join(captureDirectory, entry.file));
    if (bytes.subarray(1, 4).toString() !== 'PNG') throw new Error(`E-BL1-06: ${entry.file} is not a PNG`);
    const measurement = measurements.find((candidate) => candidate.kind === entry.kind && candidate.block === entry.block && candidate.variant.split('/').at(-2) === entry.variant
      && candidate.theme === entry.theme && String(candidate.preset ?? candidate.pageWidth) === entry.key);
    if (!measurement) throw new Error(`E-BL1-06: no overflow measurement for ${entry.file}`);
    captures.push({
      path: `${root}/captures/${entry.file}`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      pixels: { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) },
      kind: entry.kind,
      block: entry.block,
      variant: entry.variant,
      theme: entry.theme,
      [entry.kind === 'preset' ? 'preset' : 'pageWidth']: entry.key,
      clientWidth: measurement.clientWidth,
      scrollWidth: measurement.scrollWidth,
      overflowX: measurement.overflowX,
      data: bytes,
    });
  }
  visual = {
    captures,
    overflowReport: { sha256: sha256(overflowRaw), measurements: measurements.length, overflowing: 0, pageWidths: overflowReport.pageWidths },
    expected: { variants: variants.length, themes: themes.length, toolbarPresets: presetKeys, pageWidths: [...pageWidths], marketingVariants: variants.filter(({ patternSlug }) => groupOf.get(patternSlug) === 'marketing').map(({ variantId }) => variantId) },
    proof: docsBrowser.ref,
    browserTests: docsBrowser.report.results.filter(({ depth, outcome }) => depth === 0 && outcome === 'pass').map(({ name }) => name),
  };
} finally {
  await rm(captureDirectory, { recursive: true, force: true });
}

// ---- E-BL1-07: surface parity. ----
const parityTests = prove('E-BL1-07-parity-tests', {
  command: process.execPath,
  args: ['--test', 'packages/tooling/test/pattern-cli.test.mjs', 'apps/docs/test/blocks-loader.test.mjs'],
}, { observed: ['parity-tests'] });
const matrix = await surfaceParityMatrix();
for (const group of ['list', 'participant filter', 'search', 'get pattern', 'get variant example', 'used in', 'component examples', 'errors']) {
  if (!matrix.rows.some((row) => row.group === group)) throw new Error(`E-BL1-07: the matrix has no ${group} row`);
}
if (matrix.patterns.length !== patterns.length || matrix.variants.length !== variants.length) throw new Error('E-BL1-07: the matrix does not cover every pattern and variant');

// ---- E-BL1-09: platform, release, and negative-boundary audit. ----
const boundary = auditBoundary({ base: preBl1Base, head: 'HEAD' });
if (!boundary.pass) throw new Error(`E-BL1-09: ${boundary.checks.filter(({ pass }) => !pass).map(({ id }) => id).join(', ')} failed`);
// The same audit must fail over the range that did change @muxui/react (GridList grid layout, #222).
const negativeControl = auditBoundary({ base: 'd3704553', head: preBl1Base, offline: true });
const negativeFailures = negativeControl.checks.filter(({ pass }) => !pass).map(({ id }) => id);
if (!['react-source-files', 'no-new-component-token-capability-or-platform'].every((id) => negativeFailures.includes(id))) {
  throw new Error('E-BL1-09: the audit did not reject the range that changed @muxui/react and the catalog');
}

// ---- E-BL1-10: the content scan and the independent review. ----
const contentTests = prove('E-BL1-10-content-rule-tests', {
  command: process.execPath,
  args: ['--test', 'packages/catalog/test/pattern-content.test.mjs', 'packages/tooling/test/pattern-content-diagnostics.test.mjs'],
}, { observed: ['content-rule-tests'] });
const contentScan = await scanBlockContent();
if (contentScan.failures.length > 0) throw new Error(`E-BL1-10: ${contentScan.failures.join('; ')}`);
if (contentScan.variantSources !== variants.length) throw new Error('E-BL1-10: the content scan did not read every variant source');

const reviewedRevision = '670cb1880350e62d19f30a09914b6eb6dadef9a4';
const reviewedBlockTree = command('git', ['rev-parse', `${reviewedRevision}:catalog/patterns`]);
if (command('git', ['rev-parse', 'HEAD:catalog/patterns']) !== reviewedBlockTree) {
  throw new Error('E-BL1-10: catalog/patterns differs from the tree the independent reviewer read; the review no longer applies');
}
let review;
if (reviewInput !== undefined) {
  const raw = await readFile(reviewInput, 'utf8');
  const text = sanitizeOutput(raw);
  if (hasUnsanitizedEvidenceOutput(text, repositoryRoot)) throw new Error('E-BL1-10: the review record is not disclosable after sanitization');
  review = { rawSha256: sha256(raw), rawBytes: Buffer.byteLength(raw), pathReplacements: raw.split(repositoryRoot).length - 1, text };
} else {
  const previous = JSON.parse(await readFile(join(repositoryRoot, root, 'artifacts/E-BL1-10.json'), 'utf8')).observations.review;
  const text = await readFile(join(repositoryRoot, reviewArtifactPath), 'utf8');
  if (sha256(text) !== previous.artifact.sha256) throw new Error('E-BL1-10: the retained review no longer matches its recorded digest');
  review = { rawSha256: previous.raw.sha256, rawBytes: previous.raw.bytes, pathReplacements: previous.sanitization.pathReplacements, text };
}
if (!review.text.includes(reviewedRevision) || !review.text.includes('## Overall verdict') || !review.text.includes('**Pass.**')) {
  throw new Error('E-BL1-10: the review record does not state a pass at the reviewed revision');
}
for (const slug of patternSlugs) if (!review.text.includes(slug)) throw new Error(`E-BL1-10: the review record does not cover ${slug}`);
const reviewAdvisories = [
  { id: 'A1', file: 'catalog/patterns/poster-grid/examples/react/virtualized.tsx', line: 11, summary: 'A card is titled "A Disabled Sample Title" but only every eleventh card is disabled, and disabled cards carry other titles. Misleading demonstration copy, not a content-rule breach.' },
  { id: 'A2', file: 'catalog/patterns/pricing-plans/artifact.json', line: 62, summary: 'The accessibility note "heading navigation ... include it" is the closest wording to an assistive-technology behaviour statement and could be softened. It claims no support.' },
  { id: 'A3', file: 'catalog/patterns/marketing-hero/artifact.json, catalog/patterns/pricing-plans/artifact.json, catalog/patterns/account-settings/artifact.json', line: null, summary: 'The "Mux has no X" lines in the unsupported lists go stale once that component is admitted.' },
];

// ---- No proof may have changed a tracked or untracked file outside this root, or moved HEAD. ----
const strayChanges = command('git', ['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean).filter((line) => !inRoot(line));
if (strayChanges.length > 0 || command('git', ['rev-parse', 'HEAD']) !== sourceRevision) {
  throw new Error(`EVIDENCE_PROOFS_CHANGED_WORKTREE: ${strayChanges.join(', ') || 'HEAD moved'}`);
}

// ---- Write everything, replacing the earlier capture. ----
const artifacts = {
  'E-BL1-01': {
    evidenceKind: 'pattern-schema-and-compiler-fixtures',
    claim: 'The pattern schema is closed and a valid record compiles. Each of the seven required negative fixtures fails with a diagnostic that names the earliest owner.',
    observations: {
      proof: schemaTests.ref,
      testFiles: [schemaFile, catalogFile],
      positiveFixtures,
      requiredNegatives: requiredNegatives.map((entry) => ({ ...entry, outcome: 'pass' })),
      fixtureTests: passed(schemaTests, 'E-BL1-01'),
    },
  },
  'E-BL1-02': {
    evidenceKind: 'pattern-authoring-fixtures',
    claim: 'The pattern kind has authoring support: a scaffold round-trips through validation and compilation, and semantic diff, revision explainer, affected closure, and source-linked diagnostics cover patterns and variant examples.',
    observations: {
      proof: authoringTests.ref,
      testFile: 'packages/tooling/test/pattern-authoring.test.mjs',
      capabilities: authoringCapabilities,
      authoringTests: passed(authoringTests, 'E-BL1-02'),
    },
  },
  'E-BL1-03': {
    evidenceKind: 'packed-consumer-per-variant',
    claim: `Every variant example (${variants.length}) typechecks against the packed @muxui/react declarations and passes packed SSR and hydration. The CSS-grid poster grid renders 12 rows on the server and hydrates 12; the virtualized poster grid renders an empty shell on the server by design and hydrates a window of rows once measured.`,
    observations: {
      ssrAndHydration: { proof: packedProof.ref, variants: packedVariants },
      typecheck: { proof: typecheckProof.ref, test: typecheckTest, enumeratesVariantsFrom: 'tooling/audits/repository-policy/src/pattern-variants.mjs', variantSources: variants.map(({ variantId, source }) => ({ id: variantId, source })) },
      rowProof: [
        { id: 'muxui:example:poster-grid-css-grid', expected: { serverRows: [12, 12], hydratedRows: [12, 12] }, observed: { serverRows: byId('muxui:example:poster-grid-css-grid').serverRows, hydratedRows: byId('muxui:example:poster-grid-css-grid').hydratedRows } },
        { id: 'muxui:example:poster-grid-virtualized', expected: { hydratedRows: [1, 999] }, observed: { serverRows: virtualizedRows.serverRows, hydratedRows: virtualizedRows.hydratedRows } },
      ],
    },
  },
  'E-BL1-04': {
    evidenceKind: 'storybook-audits-and-cross-engine-browser-tests',
    claim: `Every variant example passes light and dark axe and colour audits through its generated Storybook page (${storyIds.length} pages), and the four block browser tests pass in Chromium, Firefox, and WebKit.`,
    observations: {
      storybook: {
        proof: storybook.ref,
        selection: { families: patternSlugs, pages: storyIds },
        axe: { test: 'selected Mux UI React Storybook pages are axe-clean in light and dark', pages: storyIds.length, schemes: ['light', 'dark'], violationsAllowed: 0 },
        colours: { test: 'selected Storybook pages paint only canonical Mux colours in light and dark', pages: paintByPage },
      },
      browser: {
        proof: crossEngine.ref,
        engines,
        files: browserTests.map((file) => `packages/react/${file}`),
        engineRuns: engineResults,
        behaviourRuns,
        note: 'The keyboard, focus, and state assertions are the subtests of each run, one run per block and engine.',
      },
    },
  },
  'E-BL1-05': {
    evidenceKind: 'docs-check-report',
    claim: `Every enabled pattern (${patterns.length}) appears in the Blocks rail and opens its block, each preview route loads its canonical example, and each Code view equals the example source bytes (${variants.length} variant pages).`,
    observations: {
      proof: docsCheck.ref,
      script: 'apps/docs/scripts/check-blocks.mjs',
      report: blocksLine[0],
      counts: { patterns: Number(blocksLine[1]), variantPages: Number(blocksLine[2]), componentPages: Number(blocksLine[3]), componentPagesWithUsedIn: Number(blocksLine[4]) },
      testRuns: docsCheck.report.summary,
      browserBehaviour: { description: 'the docs browser test exercises the rail, filters, presets, handle, theme, views, and copy on the built site', proof: visual.proof, tests: visual.browserTests },
    },
  },
  'E-BL1-06': {
    evidenceKind: 'visual-captures-and-overflow-report',
    claim: `Each of ${variants.length} variants is captured at every toolbar width preset in light and dark, and each of ${visual.expected.marketingVariants.length} marketing variants at every page-width preset (${pageWidths.join('/')}), with no horizontal overflow in any of the ${visual.captures.length} captures.`,
    observations: {
      decision: { path: pageWidthDecision, pageWidths: [...pageWidths], toolbarPresets: [...toolbarPresets.map(({ width }) => width), 'full'], owner: 'apps/docs/src/lib/block-presets.ts' },
      proof: visual.proof,
      expected: visual.expected,
      overflowReport: visual.overflowReport,
      retention: 'The captures are retained in the repository as PNG files, listed with their digests in the index. They are synthetic demonstration content rendered from committed sources.',
      captures: visual.captures.map(({ data: _data, ...capture }) => capture),
    },
  },
  'E-BL1-07': {
    evidenceKind: 'surface-parity-matrix',
    claim: 'The API, CLI JSON, human, and dense output, and the site loader return the same normalized response for pattern list, search, and get, for the participant filter, and for the derived "used in" view, and component pages list only component-bound examples.',
    observations: {
      proof: parityTests.ref,
      catalogTests: passed(schemaTests, 'E-BL1-07'),
      matrix: { tool: `${root}/surface-parity.mjs`, normalization: normalizationRule, ...matrix },
    },
  },
  'E-BL1-08': {
    evidenceKind: 'catalog-generation-identity',
    claim: 'Repeated generation is a no-op, and the catalog digest changes only for the added sources.',
    observations: {
      catalogDigest: first.bundle.catalogDigest,
      catalogVersion: first.bundle.catalogVersion,
      repeatedCompile: { compiles: 2, bytesIdentical: true },
      baseline: {
        description: 'the catalog compiled from the manifest without the added entries',
        catalogDigest: withoutPatterns.bundle.catalogDigest,
        pinnedBy: `packages/tooling/test/goldens/manifest-brief.txt at the BL1-A2 head ${a2Commit}`,
        equalsPinnedDigest: true,
      },
      addedSources: {
        manifestEntries: addedEntries,
        artifacts: addedIds,
        relations: addedRelations,
        remainderIdenticalToBaseline: true,
      },
      generationIdentity: { command: 'pnpm generate:check', digest: identity[2], checkoutRevision: identity[1], proof: generationCheck.ref },
      catalogTest: passed(schemaTests, 'E-BL1-08'),
    },
  },
  'E-BL1-09': {
    evidenceKind: 'platform-release-and-negative-boundary-audit',
    claim: '@muxui/react has no API, export, or version change across the BL1 merges (its shipped stylesheet changed by the Sidebar fix #227, with no class name or custom property declaration added). Nothing is published, retagged, or deployed. No assistive-technology support claim is made. plan, install, registry, and consumer scaffold are unavailable.',
    observations: {
      tool: `${root}/boundary-audit.mjs`,
      audit: boundary,
      negativeControl: {
        description: 'The same audit over the range that did change @muxui/react and the catalog (GridList grid layout, #222) must fail.',
        base: 'd3704553',
        head: preBl1Base,
        failedChecks: negativeFailures,
      },
    },
  },
  'E-BL1-10': {
    evidenceKind: 'content-scan-and-independent-review',
    claim: 'Variant example sources and assets contain no external URL or remote asset and no literal colour value, and every asset that is not Mux-authored has a license and disclosure record (the blocks have no asset files). An independent review finds no third-party brand logo or mark, no real person\'s name or likeness, and only generic Mux-authored copy in each block.',
    observations: {
      scan: { tool: `${root}/content-scan.mjs`, ...contentScan, contentRuleTests: { proof: contentTests.ref } },
      review: {
        artifact: { path: reviewArtifactPath, sha256: sha256(review.text) },
        raw: { bytes: review.rawBytes, retained: false, sha256: review.rawSha256 },
        sanitization: { rule: 'the record is retained verbatim except that the reviewer\'s worktree path, the repository root, is rewritten to <repo> so no local path enters evidence', pathReplacements: review.pathReplacements },
        reviewer: 'an independent read-only reviewer agent (Claude Sonnet 5.5), not one of the authoring agents, as stated in the retained record',
        reviewedRevision,
        reviewedCatalogPatternsTree: reviewedBlockTree,
        reviewedTreeIsCaptureTree: 'catalog/patterns has the same git tree at the reviewed revision and at the source revision, so the reviewed block sources are the sources scanned here',
        verdict: 'pass',
        blocks: patternSlugs,
        limits: 'The reviewer read the sources and rules; it did not run the compiler scanner, the tests, or the docs site. The scanner and the tests ran above.',
        advisories: reviewAdvisories,
        advisoryDisposition: 'Not fixed in this close-out: changing a block source would invalidate the reviewed revision. They are optional follow-ups for a later block change and are not a failed finding.',
      },
    },
  },
  'E-BL1-11': {
    evidenceKind: 'catalog-regression-baseline',
    claim: `The seed set stays within the regression thresholds committed before capture, after ${thresholds.provenance.revisedAfterFirstMeasurement.length} of ${thresholds.discovery.queries.length} discovery expectations were revised following a first measurement. Known discovery weakness: ${weaknessSummary}.`,
    observations: {
      seedSet: thresholds.seedSet,
      thresholds: { path: thresholdsPath, sha256: sha256(await readFile(join(repositoryRoot, thresholdsPath))) },
      measured,
      knownDiscoveryWeaknesses,
      failures,
      regressionTest: regressionTests.ref,
    },
  },
};

// The capture directory is replaced whole; git history keeps the earlier capture.
for (const directory of ['artifacts', 'records', 'validation', 'captures']) await rm(join(repositoryRoot, root, directory), { recursive: true, force: true });
for (const directory of ['artifacts', 'records', 'validation', 'captures']) await mkdir(join(repositoryRoot, root, directory), { recursive: true });
async function write(path, value) {
  const text = typeof value === 'string' ? value : canonicalJson(value);
  if (hasUnsanitizedEvidenceOutput(text, repositoryRoot)) throw new Error(`EVIDENCE_UNSANITIZED: ${path}`);
  await writeFile(join(repositoryRoot, path), text);
  return { path, sha256: sha256(text) };
}

// A proof tool is bound by its bytes and by the last commit that changed it; it must already be committed.
async function proofToolIdentity(path) {
  const bytes = await readFile(join(repositoryRoot, path));
  const committed = execFileSync('git', ['show', `HEAD:${path}`], { cwd: repositoryRoot, encoding: 'buffer' });
  if (!committed.equals(bytes)) throw new Error(`EVIDENCE_PROOF_TOOL_UNCOMMITTED: ${path} must match HEAD`);
  const revision = command('git', ['log', '-1', '--format=%H', '--', path]);
  return { path, revision, sha256: sha256(bytes), tree: command('git', ['rev-parse', `${revision}^{tree}`]) };
}
const proofTool = await proofToolIdentity(captureTool);
const proofTools = [proofTool, ...await Promise.all(helperTools.map(proofToolIdentity))];
const captureProcedure = `node ${captureTool} --capture-timestamp=${captureTimestamp}${reviewInput === undefined ? '' : ' --content-review=<independent review record>'}`;

const validationRefs = [];
for (const { path, text } of excerpts) validationRefs.push(await write(path, text));
const captureRefs = [];
for (const { path, data } of visual.captures) {
  await writeFile(join(repositoryRoot, path), data);
  captureRefs.push({ path, sha256: sha256(data) });
}
const reviewRef = await write(reviewArtifactPath, review.text);
const artifactRefs = {};
for (const [assertionId, { evidenceKind, claim, observations }] of Object.entries(artifacts)) {
  artifactRefs[assertionId] = await write(`${root}/artifacts/${assertionId}.json`, {
    assertionId, captureTimestamp, claim, environment, evidenceKind, observations, outcome: 'pass',
    schema: 'muxui-evidence-artifact-v1', sourceRevision, sourceTree,
  });
}
const validation = await write(`${root}/verification.json`, {
  captureProcedure,
  captureTimestamp,
  environment,
  proofTool,
  proofTools,
  results: validationResults,
  sanitizationRules,
  schema: 'muxui-evidence-validation-v1',
  sourceRevision,
  sourceTree,
});

const nonClaims = [
  'No assistive-technology support claim (Decision 0022): the automated axe and colour audits and the keyboard, focus, and state browser tests are the whole of the accessibility proof, and manual and assistive-technology review of a block stays deferred to S1.0.',
  'No publication, no deployment, no public docs surface, and no claim on SCOPE-PRODUCT-003, SCOPE-SURFACE-EXPLORER-WEB, or E-P2.3-01 to E-P2.3-05.',
  'No claim about muxui plan, an install command, a registry, a consumer scaffold, project writes, or a non-React block.',
  'These records prove the BL1 assertions for the shipped blocks at this source revision. They do not set a milestone status; that is tracker state outside the repository.',
];
const extraNonClaims = {
  'E-BL1-03': ['The virtualized poster grid renders an empty shell on the server by design; its rows are proved after a measured hydration, and by the browser test (E-BL1-04).'],
  'E-BL1-06': ['The captures judge horizontal overflow and give a visual record; they are not a pixel-regression baseline and not a responsive-support claim for any consumer page.'],
  'E-BL1-09': ['The shipped @muxui/react stylesheet changed after the pre-BL1 base (the Sidebar fix #227), so the packed package is not byte-identical to it. No API, export, or version changed.'],
  'E-BL1-10': ['The independent review is a read of the block sources and rules at the reviewed revision, advisory input to the human acceptance, and not a legal clearance of any brand, likeness, or license.'],
  'E-BL1-11': [`No claim that discovery by category term works: ${weaknessSummary}, a known weakness this baseline records and does not pass as a first-ranked result.`],
};
const retentionPolicy = 'Content-addressed Git records retained in default-branch history';
const records = [];
for (const [assertionId, { evidenceKind, claim }] of Object.entries(artifacts)) {
  records.push({
    assertionId,
    ...await write(`${root}/records/${assertionId}.json`, {
      activeExceptionRefs: [],
      advisoryRefs: [],
      artifact: artifactRefs[assertionId],
      assertionId,
      basis: `${assertionId} under ${authority}`,
      captureTimestamp,
      claim,
      command: captureProcedure,
      disclosureClass: 'public-sanitized',
      environment,
      evidenceKind,
      executedIdentityBasis: 'declared equal to the source revision and tree because the capture ran there from a clean worktree; not observed separately',
      executedRevision: sourceRevision,
      executedTree: sourceTree,
      expiry: 'Retained as the BL1 acceptance evidence for the shipped blocks at this commit; a later block adds its own measurement and review rather than editing this record',
      milestone: 'BL1',
      nonClaims: [...nonClaims, ...(extraNonClaims[assertionId] ?? [])],
      outcome: 'pass',
      owner: 'ndrewtran',
      proofTool,
      retentionPolicy,
      schema: 'muxui-evidence-record-v1',
      sourceRevision,
      sourceTree,
      validation,
    }),
  });
}
await write(`${root}/index.json`, {
  artifacts: [
    { path: thresholdsPath, sha256: artifacts['E-BL1-11'].observations.thresholds.sha256 },
    reviewRef,
    ...Object.values(artifactRefs),
    ...validationRefs,
    ...captureRefs,
  ].sort((left, right) => (left.path < right.path ? -1 : 1)),
  authority,
  captureTimestamp,
  disclosureClass: 'public-sanitized',
  evidenceHead: {
    reason: 'the index digest is the content address; the retaining commit follows capture',
    status: 'not-applicable',
  },
  milestone: 'BL1',
  owner: 'ndrewtran',
  records,
  retentionPolicy,
  schema: 'muxui-evidence-index-v1',
  sourceRevision,
  sourceTree,
  validation,
});
console.log(`[evidence] captured BL1 E-BL1-01 to E-BL1-11 at ${sourceRevision}`);
