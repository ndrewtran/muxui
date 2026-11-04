// Roadmap "P2.1 Public package graph and portfolio release": retain E-P2.1-01 to E-P2.1-06 for the first portfolio
// release (@muxui/schema, @muxui/catalog, @muxui/tooling, and @muxui/react), published through
// .github/workflows/npm-publish.yml and already retained as the R1 exit route of its React candidate.
//
//   node tests/evidence/capture-p2.1.mjs --version=<0.1.0-rc.N> --capture-timestamp=<ISO-8601 UTC> <phase>...
//
// The records bind to what already ran; nothing of the release is rerun, apart from the published-run phase below, which
// installs and runs the released packages at capture time. The R1 exit route of the candidate
// (tests/evidence/r1-exit-<version>) names the main CI run, the dry run, and the publish run, and is read, not recaptured.
//
//   --evidence             main CI's jobs for the release commit (sanitized excerpts of the tests this capture cites),
//                          a read-only registry read-back of every package of the set, the npm-publish environment's
//                          secret count, and a published-run phase: the four released packages installed from the public
//                          registry into a clean project and run through their own muxui bin (E-P2.1-02). Needs read access
//                          to GitHub and the registry, and runs pnpm install and the installed bin.
//     --after-ci-run=<id>:<attempt>
//                          the pull request CI run, after the release commit, whose tooling job ran the one test added
//                          after the release (E-P2.1-02, installed catalog tamper). It is bound to the tree it ran,
//                          and capture checks that the resolver source is unchanged since the release.
//     --publish-approval=<text> --publish-approval-date=<YYYY-MM-DD>
//                          the exact authorization to publish, as Andrew gave it in chat (Decision 0028 item 6).
//                          Decision 0033 removed the environment approval, so hosted data cannot show it; it is
//                          recorded as reported by the capture operator.
//   --review=<file> --review-revision=<sha>
//                          the independent release-integrity review (activation packet), retained as a Markdown
//                          record bound to the full revision the reviewer read, as the BL1 reviews are. Records are
//                          rebuilt with it; without it each record says the review is pending.
//
// Each phase is separate and re-runnable. Every run rebuilds the records, index, and README from verification.json in
// memory and replaces the route, or leaves it untouched on failure. A record never claims P2.1 is complete, or a stable,
// support, or assistive-technology property. `--rehearsal --out=<dir>` writes elsewhere from an uncommitted tool.
import { createHash } from 'node:crypto';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, promisify } from 'node:util';
import { canonicalJson } from '../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { isolatedPackageManagerEnvironment } from '../../tooling/audits/repository-policy/src/release-proof.mjs';
import { assertDisclosable, findStep, sanitizationRules, sanitize } from './capture-r1-exit.mjs';
import { reviewVerdict, verdictPasses } from './bl1/capture-support.mjs';
import { sanitizePaths } from './bl1/proof-run.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const repository = 'ndrewtran/muxui';
const root = 'tests/evidence/p2.1';
const captureTool = 'tests/evidence/capture-p2.1.mjs';
const roadmap = 'strategy/milestone-roadmap.md';
const authority = `${roadmap}: P2.1 Public package graph and portfolio release`;
const registry = 'https://registry.npmjs.org/';
const ciWorkflowPath = '.github/workflows/ci.yml';
const environmentName = 'npm-publish';
// npm lists this version beside the first release of each new package (observed in the 4 November 2026 publish); it is no
// release candidate, and capture accepts it only as a version with no provenance that no dist-tag points at.
export const placeholderVersion = '0.0.0-stage';
const reviewPath = `${root}/artifacts/release-integrity-review.md`;
const timestamped = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z /u;
const content = (line) => line.replace(timestamped, '');
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

// The only text excluded from a dense budget count: the `-rc.N` suffix of an `X.Y.Z-rc.N` version, while a package is a prerelease
// (Roadmap E-P2.1-02, amended after the release). Any other text, including other uses of `rc`, still counts.
const rcSuffix = /(\d+\.\d+\.\d+)-rc\.\d+/gu;
export const withoutRcSuffixes = (text) => text.replace(rcSuffix, '$1');

export class P2CaptureError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new P2CaptureError(code, message);
};

export const routeOf = (version) => (version === '0.1.0-rc.1' ? 'tests/evidence/r1-exit' : `tests/evidence/r1-exit-${version}`);

// ---------------------------------------------------------------------------
// What each assertion is read as, and the retained evidence behind each part.
//
// A part is one clause of the Roadmap assertion. Its state is `shown` (every cited line demonstrates the clause as the
// Roadmap writes it), `limited` (the cited lines demonstrate a narrower or indirect form, and `note` says how),
// `not-met` (the retained lines show the clause is not met as written), `not-shown` (nothing retained addresses it), or
// `not-applicable` (the clause has nothing to apply to at the source revision, which the capture checks and the note says).
// A record passes only when every part that applies is shown. Evidence is resolved against the retained excerpts at capture, and
// capture fails when a cited test or line is not there, so a citation never outlives the log it names.

const policy = 'tooling/audits/repository-policy/test';
const tooling = 'packages/tooling/test';
const test = (job, file, title) => ({ kind: 'test', job, file, title });
const logLine = (source, pattern) => ({ kind: 'log', source, pattern });
// The packed CLI tests pack the checkout at the release commit with the source manifests' versions, not the published rcs.
const sourceVersion = (job, file, title) => ({ ...test(job, file, title), scope: 'source-version tuple: packed from the release commit at the source manifests\' versions, not the published release candidates' });
// Checks of the published-run phase (`observePublishedTuple`) that a part rests on.
const publishedChecks = (...checks) => ({ kind: 'published', checks });
// A test title is `version effects: <fixture>` for every SemVer corpus case; capture lists them from the fixtures.
const versionEffects = { kind: 'corpus', job: 'policy', file: `${policy}/release-effects.test.mjs`, fixtures: `${policy}/fixtures/version-effects`, prefix: 'version effects: ' };

const releaseSet = `${policy}/release-set.test.mjs`;
const manifestTests = `${policy}/release-manifest.test.mjs`;
const effectsTests = `${policy}/release-effects.test.mjs`;
const publication = `${policy}/npm-publication.test.mjs`;
const packedCli = `${tooling}/packed-cli.test.mjs`;
const negotiation = `${tooling}/query-negotiation.test.mjs`;
const resolverTests = `${tooling}/local-resolver.test.mjs`;

/** The parts of every assertion; `release` holds the portfolio's package names, versions, and digests (see `claimsFor`). */
function claimsFor(release) {
  const { packages, manifestDigest } = release;
  const others = packages.filter(({ name }) => name !== '@muxui/react');
  const label = ({ name, version }) => `${name}@${version}`;
  const dryRun = (pattern) => logLine('dryRun', pattern);
  const exact = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u');
  const publishedAll = `Candidate verified: ${packages.map((entry) => `${label(entry)} ${entry.integrity}`).join(', ')}`;
  const setLine = `P2.1 set consumer: ${packages.length} tarballs installed together, `;
  return {
    'E-P2.1-01': {
      parts: [
        {
          part: 'The three new tarballs are audited against their declared public entries, files allowlist, carried manifest fields (engines included), dependency sources, and sibling edges, and @muxui/react is audited the same way inside the same preparation.',
          state: 'shown',
          evidence: [
            test('policy', releaseSet, 'E-P2.1-01 every candidate manifest passes the pack audit: public entries, allowed edges, rc ranges, no scripts'),
            dryRun(exact(`P2.1 packed and audited ${others.map(label).join(', ')}`)),
            dryRun(new RegExp(`^R1 exit release preparation passed for ${packages.map(label).join(', ').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')};`, 'u')),
          ],
        },
        {
          part: 'The four tarballs install together from their packed artifacts, every public entry imports, and each tarball publishes as a dry run without lifecycle hooks or a registry write.',
          state: 'shown',
          evidence: [
            dryRun(new RegExp(`^${setLine.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\d+ entries imported and \\d+ resolved, \\d+ descriptor bindings export their members$`, 'u')),
            dryRun(exact(`R1 exit npm publish dry-run passed for ${packages.map(({ name }) => name).join(', ')} without lifecycle hooks or registry mutation`)),
          ],
        },
        {
          part: 'Negative fixtures: a leaked compiler or authoring entry, a workspace: dependency, an unlisted dependency, and a tokens dependency each fail, and only a registry range passes.',
          state: 'shown',
          evidence: [
            test('policy', releaseSet, 'E-P2.1-01 negative: a leaked compiler or authoring entry fails'),
            test('policy', releaseSet, 'E-P2.1-01 negative: a workspace specifier, an unlisted dependency, and a tokens dependency each fail'),
            test('policy', releaseSet, 'E-P2.1-01 negative: a dependency that installs from anywhere but the registry, or at another range than the source declares, fails'),
            test('policy', releaseSet, 'E-P2.1-01 an allowlist, not a blacklist: only a registry range or dist-tag passes, even when the source declares the same'),
          ],
        },
      ],
      limits: [
        '@muxui/react\'s pack audit prints no line of its own; its pass rests on the dry run\'s release preparation completing for the whole set.',
        'Supported engines are checked as the carried `engines` field, equal to the source manifest; no tarball is installed or run on another Node version. Types are held by the exports and files the audit allows; there is no separate declaration check.',
      ],
    },
    'E-P2.1-02': {
      parts: [
        {
          part: 'Pack-time descriptor audit: every descriptor binding names a member its module exports, and only there; the audit stays able to fail, and the manifest verifier requires the descriptor at its pointer.',
          state: 'shown',
          evidence: [
            test('policy', releaseSet, 'E-P2.1-02 the pack-time descriptor audit finds every binding\'s member in its module, and only there'),
            test('policy', releaseSet, 'E-P2.1-02 negative: an export identity needs exactly one #, a plain member, and a module of the package'),
            test('policy', manifestTests, 'E-P2.1-02 the verifier requires the catalog\'s renderer descriptor at its pointer, with its id and sidecar, and one-member export identities'),
            dryRun(new RegExp(`^${setLine.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\d+ entries imported and \\d+ resolved, \\d+ descriptor bindings export their members$`, 'u')),
          ],
        },
        {
          part: 'The resolver and the packed muxui binary read the React descriptor and catalog from the installed tarballs, never the source tree, and list, search, and get discover and retrieve the React tuple.',
          state: 'shown',
          note: 'Rests on the published-run phase: the four released packages installed from the public registry, at their exact versions and the release manifest\'s integrity, into a clean project outside the checkout, and run through their own muxui bin. The source-version tests are supporting only.',
          evidence: [
            publishedChecks('registry-install', 'installed-not-source', 'release-identity', 'discovery-runs', 'installed-local-resolution'),
            sourceVersion('tooling', packedCli, 'E-P2.1-02 the muxui bin and every package it reads are the installed tarballs'),
            sourceVersion('tooling', packedCli, 'E-P2.1-02 list, search, and get discover and retrieve the installed React tuple'),
          ],
        },
        {
          part: 'Golden human, JSON, and dense output for the discovery baseline.',
          state: 'shown',
          note: 'The goldens hold the source-version tuple\'s output and are compared to the source-version run only. They are not compared to the published output, which carries other versions.',
          evidence: [sourceVersion('tooling', packedCli, 'E-P2.1-02 discovery output matches the packed goldens in human, JSON, and dense modes')],
        },
        {
          part: 'The human, JSON, and dense renderings normalize to the same response as the catalog API.',
          state: 'shown',
          note: 'Checked on the published tuple at every command and detail level: each rendering parsed by the installed parser equals the response the installed catalog API and project resolver build for the same request.',
          evidence: [
            publishedChecks('modes-normalize'),
            sourceVersion('tooling', packedCli, 'E-P2.1-02 human, JSON, and dense output normalize to the catalog API response'),
          ],
        },
        {
          part: 'Full-detail `get --platform web.react --dense` is inside its 3072-token ceiling, and its brief and compact detail inside their budgets, counted without the tokens of `-rc.N` version suffixes while a package is a prerelease.',
          state: 'shown',
          note: (phase) => `Judged against the row as amended after the release (Decision 0032, "Amendment"), which names the 3072-token ceiling and leaves \`-rc.N\` suffix tokens out of budget counts while a package is a prerelease; the row at the source revision named only "its token budget". Measured on the published tuple with the installed countTokens and the installed registry's budgets, raw and without the suffixes: ${phase.denseGetSummary}. The test at the source revision pins the same ceiling and passed in the release commit's CI.`,
          evidence: [
            publishedChecks('dense-get-react'),
            sourceVersion('tooling', packedCli, 'E-P2.1-02 dense output stays inside every locked token budget'),
            { kind: 'roadmap-amendment', id: 'E-P2.1-02', ceilingConstant: { file: packedCli, name: 'WEB_REACT_GET_FULL_REGRESSION_CEILING' } },
          ],
        },
        {
          part: 'Dense output is inside its token budget for the registry\'s budget fixtures (manifest, list, search, and get) at every detail level, counted without the tokens of `-rc.N` version suffixes while a package is a prerelease.',
          state: 'shown',
          note: (phase) => `Measured on the published tuple with the installed countTokens and the installed registry's budgets, raw and without the suffixes: ${phase.denseFixtureSummary}. ${phase.rawOverBudget === '' ? 'The exclusion of `-rc.N` suffix tokens was added to the Roadmap row after the release.' : `The exclusion of \`-rc.N\` suffix tokens was added to the Roadmap row after the release, because the published rc exceeded a budget as the row first wrote it (${phase.rawOverBudget}).`} The source-version test passed in the release commit's CI against the source-version tuple, where the versions carry no \`-rc.N\` suffix.`,
          evidence: [
            publishedChecks('dense-budget-fixtures'),
            sourceVersion('tooling', packedCli, 'E-P2.1-02 dense output stays inside every locked token budget'),
          ],
        },
        {
          part: 'An invalid request returns a structured error with a stable code and a read-only nextCommand, and each capability P2.1 does not enable is explicitly unavailable in the manifest.',
          state: 'shown',
          evidence: [
            publishedChecks('invalid-requests', 'unavailable-commands'),
            sourceVersion('tooling', packedCli, 'E-P2.1-02 invalid requests return structured errors with stable codes and a read-only nextCommand'),
            sourceVersion('tooling', packedCli, 'E-P2.1-02 the manifest reports the commands P2.1 does not enable as unavailable'),
          ],
        },
        {
          part: 'A descriptor the resolver rejects makes get fail with its typed error.',
          state: 'shown',
          note: 'A negative fixture on the source-version install. The published tooling is built from the same commit (its installed package.json gitHead is the source revision), and the published phase does not repeat the negative.',
          evidence: [sourceVersion('tooling', packedCli, 'E-P2.1-02 an installed descriptor the resolver rejects makes get fail with MUXUI_CATALOG_INCOMPATIBLE')],
        },
        {
          part: 'SCOPE-TRUST-CACHE-PROVENANCE: the resolver rejects catalog bytes whose integrity or provenance sidecar does not match, with MUXUI_CATALOG_INTEGRITY_MISMATCH.',
          state: 'shown',
          note: 'The case inside the packed-tuple install, where the muxui binary reads the catalog, is a test added after the release commit; it passed in a later pull request CI run, with the resolver source unchanged since the release (see the later run in the execution block and the limits). The other tests ran at the release commit: they reject a changed provenance value in the resolver corpus, a changed byte in an explicit cache copy, and an installed catalog package whose identity or bundle is superseded or malformed.',
          evidence: [
            sourceVersion('toolingAfter', packedCli, 'E-P2.1-02 an installed catalog whose bytes differ from its provenance sidecar makes get fail with MUXUI_CATALOG_INTEGRITY_MISMATCH'),
            test('tooling', resolverTests, 'E-G0.4 resolver verifies provenance material instead of trusting fixture flags'),
            test('tooling', resolverTests, 'E-G0.4 pnpm adapter admits only an exact verified cache tuple'),
            test('tooling', negotiation, 'E-P2.1-05 an installed catalog that lists a malformed query API version fails integrity'),
          ],
        },
        {
          part: 'SCOPE-THEME-PLATFORM-SAFETY: descriptor bindings carry their platform-safety requirement-set digests, and the resolver rejects a descriptor whose digests differ from the catalog\'s.',
          state: 'shown',
          evidence: [
            test('tooling', resolverTests, 'E-G1.0-07 resolver rejects a weakened platform-safety requirement digest'),
            test('tooling', resolverTests, 'E-G1.0-04 compatibility rejects one changed native profile digest'),
          ],
        },
        {
          part: 'SCOPE-QUALITY-GENERATOR-CONTRACT: the React descriptor generator stays under generate:check.',
          state: 'shown',
          evidence: [logLine('dryRun', new RegExp(`^\\[E-G0\\.0-04\\] independent clean checkouts ${release.sourceRevision} generated identical projections with clean worktrees \\(sha256:[0-9a-f]{64}\\)$`, 'u'))],
        },
      ],
      limits: [
        'The packed-tuple tests (the goldens, the descriptor and catalog tamper negatives, and the other source-version runs) pack the checkout at the release commit with the source manifests\' versions, not the published release candidates. Release preparation does not run the muxui binary against the candidate; the published-run phase did, after the release.',
      ],
    },
    'E-P2.1-03': {
      parts: [
        {
          part: 'One release manifest correlates the whole tuple (packages, catalog, contracts, descriptors, the React compatibility profile, evidence, exceptions, publication, rollback) and verifies each digest by recomputing it.',
          state: 'shown',
          evidence: [
            test('policy', manifestTests, 'E-P2.1-03 one manifest correlates the tuple: packages, catalog, contracts, descriptors, profile, evidence, rollback'),
            test('policy', manifestTests, 'E-P2.1-03 the catalog bundle is recomputed: an emptied bundle under the old declared digest is rejected'),
            test('policy', manifestTests, 'E-P2.1-03 contracts, evidence, exceptions, publication, and rollback are recomputed, not trusted'),
            test('policy', manifestTests, 'E-P2.1-03 the retained evidence is bound to the committed bytes, and must be committed'),
            test('policy', manifestTests, 'E-P2.1-03 the react correlation block is recomputed from the tarballs and the committed sources, not trusted'),
            logLine('dryRun', new RegExp(`^Prepared candidate set .*; release manifest ${manifestDigest.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')};`, 'u')),
            logLine('publishPrepare', /^Candidate @muxui\/schema@/u),
            logLine('publish', exact(publishedAll)),
          ],
        },
        {
          part: 'Every package the release publishes is built from the release commit, and the first portfolio release publishes all four.',
          state: 'shown',
          evidence: [
            test('policy', manifestTests, 'E-P2.1-03 the verifier rejects a published package built from another commit'),
            { kind: 'route', field: 'portfolio-roles' },
          ],
        },
        {
          part: 'The verifier rejects repacked bytes under the same version, a package missing from the tuple, a reused package whose recorded digest is not the record of the release that published it, and a reused package whose compatibility no longer holds.',
          state: 'shown',
          evidence: [
            test('policy', manifestTests, 'E-P2.1-03 the verifier rejects repacked bytes under the same version'),
            test('policy', manifestTests, 'E-P2.1-03 the verifier rejects a package missing from the tuple'),
            test('policy', manifestTests, 'E-P2.1-03 a reused package is the record of the release that published it, field for field and byte for byte'),
            test('policy', manifestTests, 'E-P2.1-03 a reused package must still be compatible with the new tuple'),
          ],
        },
        {
          part: 'SCOPE-QUALITY-COMPAT-PROFILE: the release manifest correlates the digest of the React compatibility and evidence profile the packed @muxui/react exports, so the published tuple names the profile it was proved against.',
          state: 'shown',
          evidence: [
            test('policy', manifestTests, 'E-P2.1-03 one manifest correlates the tuple: packages, catalog, contracts, descriptors, profile, evidence, rollback'),
            test('policy', manifestTests, 'E-P2.1-03 the react correlation block is recomputed from the tarballs and the committed sources, not trusted'),
          ],
        },
        {
          part: 'SCOPE-QUALITY-GENERATOR-CONTRACT: two preparations of one commit give one manifest digest with stable ordering no wall-clock field in its canonical preimage, and independent clean checkouts generate identical projections.',
          state: 'shown',
          evidence: [
            test('policy', manifestTests, 'E-P2.1-03 two preparations of one commit and tuple give one manifest digest, whatever ran and when'),
            logLine('dryRun', new RegExp(`^\\[E-G0\\.0-04\\] independent clean checkouts ${release.sourceRevision} generated identical projections with clean worktrees \\(sha256:[0-9a-f]{64}\\)$`, 'u')),
          ],
        },
      ],
      limits: [
        'Reuse is modeled and tested only: the first portfolio release has no reused package and no prior manifest.',
        'The repeated-preparation digest is shown by the fixture test. The dry run prepared this commit once, and the publish run promoted its candidate instead of preparing again, so no second real preparation is retained.',
      ],
    },
    'E-P2.1-04': {
      parts: [
        {
          part: 'The SemVer classification corpus produces the required version effect for each representative compatible, incompatible, editorial, implementation-only, token, and schema change, and asks for every effect level.',
          state: 'shown',
          evidence: [
            versionEffects,
            test('policy', effectsTests, 'the corpus asks for every effect level of the catalog and of a renderer'),
            test('policy', effectsTests, 'a schema edit with no precise rule is major'),
            test('policy', effectsTests, 'a move counts by base from the stable release, and a pre-1.0 minor bump claims major'),
            test('policy', effectsTests, 'with no stable release, a unit\'s rc series admits any change but must move forward'),
            test('policy', effectsTests, 'after a stable release, a version must carry the effect of the change from that release'),
          ],
        },
        {
          part: 'Each version of the three new packages is a prerelease, the catalog package version equals catalogVersion, and the candidate set installs with tooling\'s own range on the catalog resolving to the candidate catalog.',
          state: 'shown',
          evidence: [
            test('policy', effectsTests, 'the installed candidate set is prereleases, the catalog version is catalogVersion, and tooling admits the catalog'),
            dryRun(new RegExp(`^${setLine.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\d+ entries imported and \\d+ resolved, \\d+ descriptor bindings export their members$`, 'u')),
            logLine('dryRunCollect', exact(`Candidate ${packages.map(label).join(' ')}`)),
          ],
        },
        {
          part: 'A release names the release it compares with, and the first portfolio release declares that it has none.',
          state: 'shown',
          evidence: [
            test('policy', effectsTests, 'a release names its prior release, or declares the first and agrees with the retained evidence'),
            test('policy', `${policy}/release-lineage.test.mjs`, 'npm-publish.yml names the prior release in a dry run, validates it before preparing, and leaves publish to the recorded outcome'),
            dryRun(exact('P2.1 first portfolio release: no prior release to compare versions with')),
          ],
        },
      ],
      limits: [
        'The version effects of this release were not compared with a prior release, because it has none; the corpus is the evidence that the comparison classifies correctly.',
        'The install of the candidate set resolves tooling\'s range against the candidate tarballs, not against the registry (the set was not on the registry when it was prepared).',
      ],
    },
    'E-P2.1-05': {
      parts: [
        {
          part: 'The current contract is accepted, and a superseded one is rejected with a typed error and no old-format reader (Decision 0016).',
          state: 'shown',
          evidence: [
            test('tooling', negotiation, 'E-P2.1-05 the current contract is read'),
            test('tooling', negotiation, 'E-P2.1-05 the CLI has no reader for a retired query API version'),
            test('tooling', negotiation, 'E-P2.1-05 an explicit query API version is rejected only when tooling cannot serve it'),
            test('tooling', negotiation, 'E-P2.1-05 an installed prerelease catalog from a newer query line is read at the version tooling serves'),
          ],
        },
        {
          part: 'Fixture catalogs for supported older tuples are read, and negotiation picks the highest shared query API version.',
          state: 'shown',
          evidence: [
            test('tooling', negotiation, 'E-P2.1-05 negotiation picks the highest shared query API version by SemVer precedence and ignores the rest'),
            test('tooling', negotiation, 'E-P2.1-05 the retained G0.4 corpus keeps its older tuples and its unsupported-request graph'),
            test('tooling', negotiation, 'E-P2.1-05 supported older and newer tuples are read'),
          ],
        },
        {
          part: 'A schema-incompatible catalog and an unsupported query API major return MUXUI_CATALOG_INCOMPATIBLE.',
          state: 'shown',
          evidence: [
            test('tooling', negotiation, 'E-P2.1-05 a schema-incompatible catalog and an unsupported query API major are MUXUI_CATALOG_INCOMPATIBLE'),
            test('tooling', negotiation, 'E-P2.1-05 an installed catalog with an unsupported query API major returns MUXUI_CATALOG_INCOMPATIBLE'),
            test('tooling', negotiation, 'E-P2.1-05 an installed catalog on a newer schema minor is incompatible, not an integrity mismatch'),
            test('tooling', negotiation, 'E-P2.1-05 an installed catalog on an unreadable schema is never inspected for records'),
          ],
        },
        {
          part: 'Prerelease catalogs with different base versions (2.1.0-rc.2 and 2.2.0-rc.1) resolve by declared compatibility, not by tooling\'s range.',
          state: 'shown',
          evidence: [test('tooling', negotiation, 'E-P2.1-05 prerelease catalogs with different base versions resolve by declared compatibility, not by the range')],
        },
        {
          part: 'A malformed query API version is invalid input in the resolver and an integrity failure in an installed catalog.',
          state: 'shown',
          evidence: [
            test('tooling', negotiation, 'E-P2.1-05 a malformed query API version is invalid input, a well-formed unknown one is not'),
            test('tooling', negotiation, 'E-P2.1-05 an installed catalog that lists a malformed query API version fails integrity'),
          ],
        },
        {
          part: 'Hosted or latest data stays advisory.',
          state: 'not-applicable',
          note: 'Tooling at the source revision has no reader of hosted or latest catalog data, so the clause has nothing to apply to and no test of it exists. The capture checks this from the source: the command registry lists only the commands and options retained here and refuses to load with any other, the resolver takes a catalog only from the installed project or an explicit local cache, the source holds no network client, and its only child process is `pnpm list`. Supporting context, not a test of the clause: a response read from the catalog package bundled with tooling, with no installed project, is labelled `authority: advisory` and `compatibility: unresolved`.',
          evidence: [
            { kind: 'source-absence' },
            test('tooling', `${tooling}/cli.test.mjs`, 'E-G0.3-02 human, JSON, and dense projections preserve one response object'),
          ],
        },
      ],
      limits: [],
      nonClaims: ['The clause "Hosted or latest data stays advisory" is not exercised by these records: tooling at the source revision has no hosted or latest reader. When one is added the clause applies to it and needs its own test; nothing here stands in for that test.'],
    },
    'E-P2.1-06': {
      parts: [
        {
          part: 'A publish rehearsal for each package of the release, in order.',
          state: 'shown',
          evidence: [
            ...packages.map((entry) => dryRun(exact(`+ ${label(entry)}`))),
            dryRun(exact(`R1 exit npm publish dry-run passed for ${packages.map(({ name }) => name).join(', ')} without lifecycle hooks or registry mutation`)),
          ],
        },
        {
          part: '@muxui/react publishes through its configured trusted publisher, and the publish carries provenance.',
          state: 'shown',
          evidence: [{ kind: 'publish-package', name: '@muxui/react' }, { kind: 'route', field: 'react-provenance' }],
        },
        {
          part: 'A registry read-back of the exact version, integrity, provenance, and next at the verified rc, for each package.',
          state: 'shown',
          evidence: [...packages.map(({ name }) => ({ kind: 'publish-package', name })), { kind: 'read-back' }],
        },
        {
          part: 'Simulated refusals with no registry mutation: a version collision, an artifact-integrity mismatch, and an invalid promotion lineage each stop the release before any publish.',
          state: 'shown',
          evidence: [
            test('policy', publication, 'E-P2.1-06 refusals: a version collision stops the whole set before the first publish'),
            test('policy', publication, 'E-P2.1-06 refusals: an artifact-integrity mismatch stops the release before any publish'),
            test('policy', publication, 'E-P2.1-06 refusals: an invalid promotion lineage stops the release before any publish'),
          ],
        },
        {
          part: 'A partial-publication rehearsal fails a later package after earlier ones published, by a refused publish or a failed read-back; only a version that published bad bytes is deprecated and fixed forward, healthy versions stay published, the tuple is verified again, and no record is rewritten.',
          state: 'shown',
          evidence: [
            test('policy', publication, 'E-P2.1-06 rehearsal: a refused publish after earlier packages published stops the set and deprecates nothing'),
            test('policy', publication, 'E-P2.1-06 rehearsal: a failed read-back deprecates only the version that published bad bytes and fixes it forward'),
            test('policy', publication, 'E-P2.1-06 rehearsal: a read-back that cannot see the version, or sees it unattested, is a decision and not a deprecation'),
            test('policy', publication, 'E-P2.1-06 rehearsal: a publish that errored after npm accepted it is unverified, never absent, and never republished'),
          ],
        },
        {
          part: 'The rollback plan is in the release manifest, prepared and not exercised; `latest` is observed, not claimed.',
          state: 'shown',
          evidence: [{ kind: 'route', field: 'rollback' }],
        },
      ],
      limits: [
        'The trusted publishers of the three new packages are not set up and tokenless publishing is unproved for them (Decision 0032 item 10, as amended): see the non-claim. Only @muxui/react\'s publisher is configured and shown.',
        'The first portfolio release has no prior tuple; restoring a prior tuple stays owed by P2 exit.',
        'Recovery is prepared, not exercised.',
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helpers.

const joinNames = (names) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`);

// Product Scope's cross-cutting commitments and the Roadmap's evidence owner for each (Roadmap P2.1, "Cross-cutting evidence
// ownership"). A part of a record that starts `<scope id>:` is that commitment's evidence; the table lists where each one is.
const crossCuttingScopes = [
  'SCOPE-QUALITY-COMPAT-PROFILE',
  'SCOPE-QUALITY-GENERATOR-CONTRACT',
  'SCOPE-TRUST-CACHE-PROVENANCE',
  'SCOPE-THEME-PLATFORM-SAFETY',
];
const crossCuttingElsewhere = [
  { scopeId: 'SCOPE-QUALITY-PERFORMANCE', owner: 'not P2.1', note: 'P2 exit owns the Productization policy; P2.1 keeps the dense-output token budget of E-P2.1-02 (its dense-output part)' },
  { scopeId: 'SCOPE-TRUST-EVIDENCE-PRIVACY', owner: 'not applicable', note: 'P2.1 captures registry, CI, and packed-artifact data, and no consumer code, prompts, screens, or traces' },
];
export const crossCuttingOf = (coverage) => [
  ...crossCuttingScopes.map((scopeId) => ({
    scopeId,
    evidence: Object.entries(coverage).flatMap(([record, { parts }]) => parts.filter(({ part }) => part.startsWith(`${scopeId}:`)).map(({ state }) => ({ record, state }))),
  })),
  ...crossCuttingElsewhere,
];

const assertionIds = ['E-P2.1-01', 'E-P2.1-02', 'E-P2.1-03', 'E-P2.1-04', 'E-P2.1-05', 'E-P2.1-06'];

/** The Roadmap rows of E-P2.1-01 to 06 as `{ assertion, requiredEvidence }`, read from the text of the Roadmap at the source revision. */
export function roadmapRows(text) {
  const rows = {};
  for (const line of text.split('\n')) {
    const match = /^\| `(E-P2\.1-0\d)` \| (.+) \| (.+) \|$/u.exec(line);
    if (match) rows[match[1]] = { assertion: match[2], requiredEvidence: match[3] };
  }
  for (const id of assertionIds) if (!rows[id]) fail('P2_1_ROADMAP_ROW_MISSING', `${id} is not a row of the Roadmap at the source revision`);
  return rows;
}

/** The outcome of a record: pass only when every part that applies is shown, and at least one does. */
export const outcomeOf = (parts) => {
  const applicable = parts.filter(({ state }) => state !== 'not-applicable');
  return applicable.length > 0 && applicable.every(({ state }) => state === 'shown') ? 'pass' : parts.some(({ state }) => state === 'shown') ? 'partial' : 'unmet';
};

const testLine = /^✔ (.+) \(\d[\d.]*ms\)$/u;
const summaryLine = /^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)$/u;
const commandLine = /^\[ci-impact\] (?:running group |command: pnpm --filter @muxui\/)/u;
const scriptHeader = /^> @muxui\/[\w-]+@\d\S* check(?::evidence)? /u;

/**
 * The lines of one main CI job's log that this capture cites: the group and commands it ran, the check scripts' headers, the
 * totals each `node --test` printed, and the passing lines of `titles` (and of titles starting with `prefixes`). Every cited
 * title must pass exactly once, and no test may fail anywhere in the log.
 */
export function ciExcerpt(raw, { titles, prefixes = [] }) {
  const lines = raw.split('\n');
  const failed = lines.map(content).filter((line) => /^✖ /u.test(line));
  if (failed.length > 0) fail('P2_1_CI_TEST_FAILED', `the log shows a failing test: ${sanitize(failed[0])}`);
  const kept = [];
  const seen = new Map();
  const totals = [];
  lines.forEach((line, index) => {
    const text = content(line);
    const title = testLine.exec(text)?.[1];
    const cited = title !== undefined && (titles.has(title) || prefixes.some((prefix) => title.startsWith(prefix)));
    if (cited) seen.set(title, (seen.get(title) ?? 0) + 1);
    const summary = summaryLine.exec(text);
    if (summary?.[1] === 'tests') totals.push({ tests: Number(summary[2]) });
    else if (summary && totals.length > 0) totals.at(-1)[summary[1]] = Number(summary[2]);
    if (cited || summary || commandLine.test(text) || scriptHeader.test(text)) kept.push({ raw: index + 1, text: sanitize(line) });
  });
  for (const title of titles) {
    if (!seen.has(title)) fail('P2_1_CI_TEST_MISSING', `no passing line for "${title}"`);
    if (seen.get(title) > 1) fail('P2_1_CI_TEST_AMBIGUOUS', `"${title}" passes ${seen.get(title)} times in the log`);
  }
  if (totals.length === 0 || totals.some(({ tests, pass, fail: failures }) => failures !== 0 || pass !== tests)) {
    fail('P2_1_CI_TEST_TOTALS', `the log's test totals are ${JSON.stringify(totals)}`);
  }
  return { kept, totals };
}

/** Whether `title` is a test of `source`, as a literal title (a quote in it appears escaped in the source). */
const hasTitle = (source, title) => source.includes(`'${title}'`) || source.includes(`'${title.replaceAll("'", "\\'")}'`);

/** The package name that goes into a registry attestation subject: `@muxui/react` is `pkg:npm/%40muxui/react@<version>`. */
const purl = ({ name, version }) => `pkg:npm/${name.replace('@', '%40')}@${version}`;

/**
 * Binds one package's read-only registry observation to the portfolio manifest and the publish run. `first` says the
 * registry first saw the package in this release; otherwise `latest` must be what the publish run's preflight recorded.
 * A package may list `placeholderVersion` beside the release candidate (`placeholders` holds what the registry says of it);
 * any other version of a first-published package stops the capture for a decision.
 */
export function bindRegistryPackage({ entry, view, attestations, placeholders = [], publishRunId, sourceRevision, first, priorLatest }) {
  const { name, version, integrity, shasum } = entry;
  const label = `${name}@${version}`;
  if (view.integrity !== integrity || view.shasum !== shasum) fail('P2_1_REGISTRY_DIGEST_MISMATCH', `${label} has ${view.integrity} / ${view.shasum} on the registry; the manifest records ${integrity} / ${shasum}`);
  if (!/^https:\/\/slsa\.dev\/provenance\//u.test(view.attestations?.provenance?.predicateType ?? '')) fail('P2_1_REGISTRY_PROVENANCE_MISSING', label);
  if (view.distTags?.next !== version) fail('P2_1_REGISTRY_NEXT_MISMATCH', `${label}: next points at ${view.distTags?.next}`);
  if (!view.versions.includes(version)) fail('P2_1_REGISTRY_TAGS_UNEXPECTED', `${label} is not in the package's versions ${JSON.stringify(view.versions)}`);
  const others = view.versions.filter((candidate) => candidate !== version);
  if (first) {
    const unexpected = others.filter((candidate) => candidate !== placeholderVersion);
    if (view.distTags.latest !== version || Object.keys(view.distTags).sort().join(',') !== 'latest,next' || unexpected.length > 0) {
      fail('P2_1_REGISTRY_TAGS_UNEXPECTED', `${label} is a first publish: dist-tags ${JSON.stringify(view.distTags)}, versions ${JSON.stringify(view.versions)}`);
    }
  } else if (view.distTags.latest !== priorLatest || Object.keys(view.distTags).sort().join(',') !== 'latest,next') {
    fail('P2_1_REGISTRY_TAGS_UNEXPECTED', `${label}: dist-tags ${JSON.stringify(view.distTags)}; latest was ${priorLatest} at the preflight`);
  }
  // A placeholder is outside the release tuple only while nothing tags it and it carries no provenance.
  for (const placeholder of placeholders) {
    if (Object.values(view.distTags).includes(placeholder.version) || placeholder.attestations !== undefined) {
      fail('P2_1_REGISTRY_PLACEHOLDER_UNEXPECTED', `${name}@${placeholder.version} is tagged or carries attestations`);
    }
  }
  if (others.some((candidate) => candidate === placeholderVersion) !== placeholders.some(({ version: seen }) => seen === placeholderVersion)) {
    fail('P2_1_REGISTRY_PLACEHOLDER_UNEXPECTED', `${name} lists ${placeholderVersion} without its registry document, or the reverse`);
  }
  const statements = (attestations?.attestations ?? []).map(({ predicateType, bundle }) => ({ predicateType, statement: JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8')) }));
  const slsa = statements.find(({ predicateType }) => /^https:\/\/slsa\.dev\/provenance\//u.test(predicateType))?.statement;
  if (!slsa) fail('P2_1_REGISTRY_PROVENANCE_MISSING', `${label}: no SLSA statement`);
  const [subject] = slsa.subject ?? [];
  const workflow = slsa.predicate?.buildDefinition?.externalParameters?.workflow ?? {};
  const commit = slsa.predicate?.buildDefinition?.resolvedDependencies?.[0]?.digest?.gitCommit;
  const invocation = slsa.predicate?.runDetails?.metadata?.invocationId ?? '';
  if (subject?.name !== purl(entry) || subject?.digest?.sha512 !== Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex')) {
    fail('P2_1_REGISTRY_PROVENANCE_MISMATCH', `${label}: the SLSA subject is not the published tarball`);
  }
  if (workflow.repository !== `https://github.com/${repository}` || workflow.path !== '.github/workflows/npm-publish.yml' || commit !== sourceRevision
    || !invocation.startsWith(`https://github.com/${repository}/actions/runs/${publishRunId}/`)) {
    fail('P2_1_REGISTRY_PROVENANCE_MISMATCH', `${label}: the SLSA predicate names ${workflow.path} at ${commit} from ${invocation}`);
  }
  return {
    name,
    version,
    integrity: view.integrity,
    shasum: view.shasum,
    distTags: view.distTags,
    versions: view.versions,
    // Every version the registry lists, so the candidate is never read as the package's only version.
    otherVersions: others.map((other) => {
      const document = placeholders.find(({ version: seen }) => seen === other);
      if (!document) return { version: other };
      const { attestations: _none, ...described } = document;
      return { ...described, provenance: 'none' };
    }),
    registryPublishedAt: view.time?.[version] ?? null,
    provenance: { predicateType: view.attestations.provenance.predicateType, subject: subject.name, workflowPath: workflow.path, gitCommit: commit, invocationId: invocation },
    latest: { observed: view.distTags.latest, basis: first ? 'no workflow step sets, claims, or promotes a dist-tag; Decision 0023 expects the registry to assign latest on a first publish' : `unchanged by this publish; the preflight recorded ${priorLatest}`, claimed: false, promoted: false },
  };
}

// ---------------------------------------------------------------------------
// The review phase.

/**
 * Retains the independent release-integrity review as the reviewer wrote it, except for local paths, and binds it to the
 * full revision the reviewer read. The review must name its reviewer and that revision's 8-character prefix, and have one
 * `Verdict` or `Overall verdict` heading, as the BL1 reviews do. A review that does not open its verdict with **Pass.** is
 * retained and recorded as not passing.
 */
export function bindReview({ text, reviewedRevision, cwd = repositoryRoot, sourceRevision }) {
  if (!/^[0-9a-f]{40}$/u.test(reviewedRevision ?? '')) fail('P2_1_REVIEW_REVISION', 'the review needs the full 40-character revision the reviewer read');
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (git('cat-file', '-e', `${reviewedRevision}^{commit}`).status !== 0) fail('P2_1_REVIEW_REVISION', `${reviewedRevision} is not a commit of this repository`);
  const sanitized = sanitizePaths(text, cwd);
  if (!sanitized.text.includes(reviewedRevision.slice(0, 8))) fail('P2_1_REVIEW_REVISION', `the review does not name the revision ${reviewedRevision.slice(0, 8)} it is retained for`);
  const reviewer = /\*\*Reviewer:\*\*\s*(.+)/u.exec(sanitized.text)?.[1]?.trim();
  if (!reviewer) fail('P2_1_REVIEW_REVIEWER', 'the review does not name its reviewer (a **Reviewer:** line)');
  const verdict = reviewVerdict(sanitized.text, 'the release-integrity review');
  if (!verdict) fail('P2_1_REVIEW_VERDICT', 'the review has no Verdict or Overall verdict heading');
  const changed = git('diff', '--name-only', reviewedRevision, 'HEAD').stdout.split('\n').filter(Boolean);
  const blob = (revision, path) => {
    const result = git('rev-parse', '--verify', '--quiet', `${revision}:${path}`);
    return result.status === 0 ? result.stdout.trim() : null;
  };
  return {
    artifact: { path: reviewPath, sha256: sha256(sanitized.text) },
    raw: { bytes: Buffer.byteLength(text), retained: false, sha256: sha256(text) },
    sanitization: { rule: 'retained as the reviewer wrote it except that local paths are rewritten: the repository root to <repo>, temporary directories to <tmp>, and home directories to <home>', replacements: sanitized.counts },
    reviewer,
    reviewedRevision,
    reviewedTree: git('rev-parse', `${reviewedRevision}^{tree}`).stdout.trim(),
    reviewedRevisionIsSource: reviewedRevision === sourceRevision,
    // The review reads the evidence tool and records on a branch; what changed since is listed so the reader can judge it.
    changedSinceReviewed: { pathCount: changed.length, paths: changed.slice(0, 50), truncated: changed.length > 50, captureToolChanged: blob(reviewedRevision, captureTool) !== blob('HEAD', captureTool) },
    verdictHeading: verdict.heading,
    verdictText: verdict.text,
    passes: verdictPasses(verdict.text),
    text: sanitized.text,
  };
}

// ---------------------------------------------------------------------------
// Records, README, and index: derived only from verification.json.

const nonClaims = (verification) => [
  'P2.1 is not claimed complete, ready, or exited by this record; the exit condition is judged from the Roadmap, not from this root.',
  'No stable release, support, or assistive-technology claim. Install guidance for these packages uses @next.',
  'latest is observed, not claimed or promoted: on the registry it points at each new package\'s rc and stayed on @muxui/react\'s earlier rc (Decision 0023).',
  `The trusted publishers of ${joinNames(verification.release.tokenPublished)} are not yet set up and tokenless publishing is unproved for them; the provenance of their token publish proves neither (Decision 0032 item 10, as amended).`,
  ...((verification.phases.registry?.placeholders ?? []).length === 0 ? [] : [
    `${joinNames(verification.phases.registry.placeholders.map(({ name }) => name))} each also list a ${placeholderVersion} placeholder version. It is no part of the release tuple, carries no provenance, and is not claimed; npm most likely created it, which is inferred and not proved.`,
  ]),
  'Recovery is prepared, not exercised. The first portfolio release has no prior tuple; restoring a prior tuple stays owed by P2 exit.',
  'No consumer validation, clean-consumer offline proof, docs, explorer, or MCP evidence (P2.2 and P2.3).',
];

const independentReview = (verification) => {
  const review = verification.phases.review;
  return review
    ? {
      status: review.passes ? 'retained-pass' : 'retained-not-passing',
      artifact: review.artifact,
      reviewer: review.reviewer,
      reviewedRevision: review.reviewedRevision,
      reviewedTree: review.reviewedTree,
      reviewedRevisionIsSource: review.reviewedRevisionIsSource,
      changedSinceReviewed: review.changedSinceReviewed,
      verdictText: review.verdictText,
    }
    : {
      status: 'pending',
      required: 'an independent reviewer of a different model and harness from the authoring agents, bound to the reviewed revision (P2.1 activation packet, "Roles")',
      retainedBy: `node ${captureTool} --version=${verification.release.version} --capture-timestamp=<ISO-8601 UTC> --review=<file> --review-revision=<sha>`,
      artifact: null,
    };
};

export function buildRecords(verification) {
  const { release, coverage, rows, phases } = verification;
  return Object.fromEntries(assertionIds.map((assertionId) => {
    const { parts, limits, nonClaims: ownNonClaims = [] } = coverage[assertionId];
    const outcome = outcomeOf(parts);
    // A row amended after the release is judged as amended; the source revision's row stays in `roadmap`.
    const { rows: amendedRows = {}, ...amendment } = verification.amendedRoadmap ?? {};
    const amended = amendedRows[assertionId];
    const row = amended ?? rows[assertionId];
    const citesLater = parts.some(({ evidence }) => evidence.some((item) => item.ciRun !== undefined));
    const { checks: _checks, ...publishedRun } = phases.published ?? {};
    const citesPublished = parts.some(({ evidence }) => evidence.some((item) => item.kind === 'published'));
    return [assertionId, canonicalJson({
      schema: 'muxui-evidence-record-v1',
      assertionId,
      milestone: 'P2.1',
      evidenceKind: 'retained-ci-and-release-run-capture',
      basis: `${assertionId} under the Roadmap P2.1 acceptance table, Decision 0032, and the P2.1 activation packet`,
      assertion: row.assertion,
      requiredEvidence: row.requiredEvidence,
      roadmap: amended ? { ...verification.roadmap, amended: { ...amendment, assertionAtSourceRevision: rows[assertionId].assertion } } : verification.roadmap,
      outcome,
      parts,
      limits,
      sourceRevision: verification.sourceRevision,
      sourceTree: verification.sourceTree,
      // Main CI ran on the release commit itself (a push), and the dry run and publish run checked it out.
      executedRevision: verification.sourceRevision,
      executedTree: verification.sourceTree,
      proofTool: verification.proofTool,
      executedProofTools: verification.executedProofTools[assertionId],
      command: verification.commands,
      execution: { mainCi: phases.ci.execution, ci: phases.ci.jobs, ...(citesLater ? { laterCi: phases.ci.later } : {}), ...(citesPublished ? { publishedRun } : {}), dryRun: release.dryRun, publish: release.publish },
      environment: phases.ci.environment,
      release: { version: release.version, route: release.route, portfolioId: release.portfolioId, manifestDigest: release.manifestDigest, packages: release.packages },
      registryReadBack: phases.registry.readBack,
      ...(assertionId === 'E-P2.1-06' ? { publishApproval: phases.approval, githubEnvironment: phases.registry.githubEnvironment, route: release.routeRecords } : {}),
      crossCutting: crossCuttingOf(coverage),
      nonClaims: [...nonClaims(verification), ...ownNonClaims],
      independentReview: independentReview(verification),
      validation: verification.validation,
      activeExceptionRefs: [],
      advisoryRefs: [],
      disclosureClass: 'public-sanitized',
      disclosureBasis: 'Public reproducibility class (Architecture, "Evidence also carries a disclosure class"): sanitized log excerpts, digests, and registry read-backs of public packages. No consumer code, prompts, screens, or traces were captured, so SCOPE-TRUST-EVIDENCE-PRIVACY is not applicable to P2.1.',
      owner: 'ndrewtran',
      captureTimestamp: phases.captureTimestamp,
      retentionPolicy: 'Content-addressed Git records retained in default-branch history; hosted logs, workflow artifacts, and registry state are mutable or expiring locators bound by digest',
      expiry: 'Retained as P2.1 proof for this exact release; a later release needs new E-P2.1 evidence rather than an edit',
      ...(verification.rehearsal ? { rehearsal: verification.rehearsal } : {}),
    })];
  }));
}

const summaryOf = (record) => `${record.assertionId}: ${record.outcome}`;

function readme(verification, records) {
  const { release } = verification;
  const parsed = Object.values(records).map((text) => JSON.parse(text));
  const review = verification.phases.review;
  const later = verification.phases.ci.later;
  const published = verification.phases.published;
  return `# P2.1 retained evidence for the first portfolio release

Roadmap "P2.1 Public package graph and portfolio release" requires \`E-P2.1-01\` to
\`E-P2.1-06\`. This root retains them for the portfolio of release
\`${release.portfolioId}\` (${release.packages.map(({ name, version }) => `\`${name}@${version}\``).join(', ')}), prepared and published from
\`${verification.sourceRevision}\` (tree \`${verification.sourceTree}\`), captured by
\`node ${captureTool} --version=${release.version}\`.

Nothing of the release is rerun. Each record binds to what already ran at that commit, apart from the published-run phase
described below: main CI run
${verification.phases.ci.execution.runId} (attempt ${verification.phases.ci.execution.runAttempt}), dry run ${release.dryRun.runId}, and publish run ${release.publish.runId}. The React candidate's
R1 exit route \`${release.route}\` holds the dry run and publish excerpts and the React
registry observation, and this root cites them by path and digest.

| Record | Outcome |
| --- | --- |
${parsed.map((record) => `| \`${record.assertionId}\` | \`${record.outcome}\` |`).join('\n')}

${[
    ...parsed.filter((record) => record.outcome !== 'pass').map((record) => `\`${record.assertionId}\` is \`${record.outcome}\` because ${record.parts.filter(({ state }) => state !== 'shown').map(({ state, part, note }) => `\`${state}\`: ${part}${note ? ` ${note}` : ''}`).join(' ')}`),
    ...parsed.filter((record) => record.outcome === 'pass' && record.parts.some(({ state }) => state === 'not-applicable')).map((record) => `\`${record.assertionId}\` passes with a part that does not apply: ${record.parts.filter(({ state }) => state === 'not-applicable').map(({ part, note }) => `${part} ${note}`).join(' ')}`),
  ].join('\n\n')}

Each record's \`parts\` splits the Roadmap assertion into clauses and gives each a state:
\`shown\`, \`limited\` (a narrower or indirect form, with a note), \`not-met\`, \`not-shown\`, or
\`not-applicable\` (the clause has nothing to apply to at the source revision, which the capture
checks). A record is \`pass\` only when every part that applies is shown, and \`partial\` otherwise.
A cited test is a passing line in the sanitized excerpt of the CI job that ran it, at the release
commit; capture fails if a cited line is missing. \`limits\` lists what the retained
evidence does not show.${later ? `

One test, added after the release, ran in pull request CI run ${later.execution.runId} (attempt ${later.execution.runAttempt}) at head \`${later.execution.headRevision}\`: the job checked out the merge \`${later.checkedOut.commit}\`, whose tree is the head's. The resolver source (\`packages/tooling/src\`, \`packages/catalog/src\`, \`packages/schema/src\`) is unchanged between the release commit and that head. The \`E-P2.1-02\` row of the Roadmap was amended after the release, to name the dense-output ceiling and to leave \`-rc.N\` suffix tokens out of budget counts while a package is a prerelease; that record is judged against the amended row and keeps the raw and the counted numbers.` : ''}

${published ? `\`E-P2.1-02\` also rests on a published-run phase: at ${published.captureTimestamp} the four released packages were installed from the public registry into a clean project outside the checkout, and the installed \`muxui\` bin was run through the discovery matrix, the budget fixtures, an invalid-request corpus, and the commands P2.1 does not enable (\`${published.output.path}\`). ${published.checks.filter(({ passed }) => passed).length} of ${published.checks.length} checks passed. The packed-CLI tests of the release commit pack the source manifests' versions, and the records cite them as source-version supporting evidence.\n\n` : ''}\`artifacts/\` holds the registry read-back of all four packages${review ? ' and the independent review' : ''}; \`validation/\` holds the CI job
excerpts; \`verification.json\` binds them to the unsanitized log digests. The raw logs and
tarballs are not retained.

${review
    ? `The independent release-integrity review is retained as \`${review.artifact.path}\`, read by ${review.reviewer} at \`${review.reviewedRevision}\`. It is ${review.passes ? 'a pass' : 'not a pass'}.`
    : `No independent release-integrity review is retained: it is pending, and these records claim no outcome of it. A reviewer of a different model and harness from the authoring agents reads the evidence and the release, and \`--review=<file> --review-revision=<sha>\` retains the review and rebuilds the records with it.`}

${(verification.phases.registry?.placeholders ?? []).length === 0 ? '' : `The read-back lists every version of each package. ${joinNames(verification.phases.registry.placeholders.map(({ name }) => `\`${name}\``))} each also list a \`${placeholderVersion}\` placeholder version, observed in \`E-P2.1-06\` and not part of the release tuple; its origin is inferred, not proved.\n\n`}The exact authorization to publish was given in chat and is recorded in \`E-P2.1-06\` as
reported by the capture operator; the \`npm-publish\` environment had no required reviewer
(Decision 0033), so the publish run's approvals list is empty. The three new packages
published with the temporary token, and that does not prove tokenless publishing for
them (Decision 0032 item 10, as amended). These records do not claim P2.1 is complete, a
stable release, support, or any assistive-technology property.${verification.rehearsal ? '\n\nThis capture is a rehearsal and is not release evidence.' : ''}
`;
}

/** Builds every file of the route from `verification` (the contents of verification.json) and returns them by path. */
export function assembleRoute(verification) {
  const files = new Map();
  const write = (relative, text) => {
    assertDisclosable(text, relative);
    files.set(relative, text);
    return { path: relative, sha256: sha256(text) };
  };
  const assembled = { ...verification, sanitizationRules };
  const validation = write(`${root}/verification.json`, canonicalJson(assembled));
  const records = buildRecords({ ...assembled, validation });
  const entries = assertionIds.map((assertionId) => ({ assertionId, ...write(`${root}/records/${assertionId}.json`, records[assertionId]) }));
  write(`${root}/README.md`, readme(assembled, records));
  write(`${root}/index.json`, canonicalJson({
    schema: 'muxui-evidence-index-v1',
    milestone: 'P2.1',
    authority,
    sourceRevision: assembled.sourceRevision,
    sourceTree: assembled.sourceTree,
    artifacts: Object.values(assembled.retained).sort((left, right) => (left.path < right.path ? -1 : 1)),
    records: entries,
    validation,
    independentReview: independentReview(assembled),
    disclosureClass: 'public-sanitized',
    owner: 'ndrewtran',
    ...(assembled.rehearsal ? { rehearsal: assembled.rehearsal } : {}),
    evidenceHead: { status: 'not-applicable', reason: 'the index digest is the content address; the retaining commit follows capture' },
    retentionPolicy: 'Content-addressed Git records retained in default-branch history; hosted logs and artifacts expire and are bound by digest',
  }));
  return files;
}

// ---------------------------------------------------------------------------
// Hosted and registry I/O (read-only).

const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const gitShow = (revision, path) => execFileSync('git', ['show', `${revision}:${path}`], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function createGitHub() {
  const gh = (...args) => execFileSync('gh', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const json = (path) => JSON.parse(gh('api', path));
  return {
    attempt: (id, number) => json(`repos/${repository}/actions/runs/${id}/attempts/${number}`),
    attemptJobs: (id, number) => json(`repos/${repository}/actions/runs/${id}/attempts/${number}/jobs?per_page=100`).jobs,
    commit: (sha) => { const { parents, commit } = json(`repos/${repository}/commits/${sha}`); return { parents: parents.map(({ sha: parent }) => parent), tree: commit.tree.sha }; },
    log: (jobId) => gh('api', '--allow-escape-sequences', `repos/${repository}/actions/jobs/${jobId}/logs`),
    environmentSecrets: () => json(`repos/${repository}/environments/${environmentName}/secrets`).total_count,
  };
}

/** The `git grep` matches of `pattern` in `paths` at `revision`, as `{ path, line, text }`. */
function grepAt(revision, pattern, paths, ...flags) {
  const result = spawnSync('git', ['grep', '-n', '-I', '-E', ...flags, '-e', pattern, revision, '--', ...paths], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status > 1) fail('P2_1_GIT_GREP_FAILED', result.stderr);
  return result.stdout.split('\n').filter(Boolean).map((row) => {
    const [, path, line, ...text] = new RegExp(`^${revision}:([^:]+):(\\d+):`, 'u').exec(row) ? [null, ...row.slice(revision.length + 1).split(':')] : fail('P2_1_GIT_GREP_FAILED', row);
    return { path, line: Number(line), text: text.join(':').trim() };
  });
}

/**
 * What the tooling source at `revision` can read, from its command registry and the source itself: no hosted or latest
 * catalog. Fails, for a decision, when a match shows it might.
 */
export function toolingReaderSurface(revision) {
  const source = 'packages/tooling/src';
  const registryFile = `${source}/registry.mjs`;
  const registrySource = gitShow(revision, registryFile);
  const listed = (name) => {
    const match = new RegExp(`const ${name} = \\[([^\\]]*)\\];`, 'u').exec(registrySource);
    if (!match) fail('P2_1_REGISTRY_UNREADABLE', `${registryFile} at ${revision} has no ${name} list`);
    return [...match[1].matchAll(/'([^']+)'/gu)].map(([, value]) => value);
  };
  const surface = { commands: listed('BASELINE_COMMANDS'), unavailableCommands: listed('UNAVAILABLE_COMMANDS'), globalOptions: listed('BASELINE_GLOBAL_OPTIONS'), selectors: listed('BASELINE_SELECTORS') };
  // The registry refuses to load with any other option or command, so these lists are the whole surface.
  if (!registrySource.includes('CLI_OPTION_SURFACE_DRIFT') || !registrySource.includes('canonicalJson([...commands].sort(compareText)) === canonicalJson(BASELINE_COMMANDS)')) fail('P2_1_REGISTRY_UNLOCKED', `${registryFile} at ${revision} no longer locks its surface`);
  const hostile = Object.values(surface).flat().filter((name) => /hosted|latest|remote|url|network|fetch|download/iu.test(name));
  if (hostile.length > 0) fail('P2_1_READER_FOUND', `the command surface names ${hostile.join(', ')}`);

  const networkPattern = 'fetch\\(|node:(https?|http2|net|tls|dns|dgram)|XMLHttpRequest|WebSocket|undici|https?://';
  const network = grepAt(revision, networkPattern, [source]);
  if (network.length > 0) fail('P2_1_READER_FOUND', `${source} at ${revision} may reach the network: ${network[0].path}:${network[0].line}`);
  const wording = grepAt(revision, 'hosted|latest', [source], '-i');
  const code = wording.filter(({ text }) => !text.startsWith('//'));
  if (code.length > 0) fail('P2_1_READER_FOUND', `${code[0].path}:${code[0].line} names hosted or latest outside a comment`);
  const childProcess = grepAt(revision, 'child_process|spawnSync\\(|execFileSync\\(|execSync\\(|spawn\\(|fork\\(', [source]);
  const adapter = gitShow(revision, `${source}/pnpm-adapter.mjs`);
  const pnpm = /spawnSync\('pnpm', \[([\s\S]*?)\], \{/u.exec(adapter)?.[1].replace(/\s+/gu, ' ').trim();
  if (childProcess.length !== 2 || childProcess.some(({ path }) => path !== `${source}/pnpm-adapter.mjs`) || !pnpm?.includes("'list'") || /'(?:view|install|add|update|publish|fetch)'/u.test(pnpm)) fail('P2_1_READER_FOUND', `${source} at ${revision} runs a child process other than pnpm list`);
  const catalogSources = grepAt(revision, "catalogSource = '", [source]).map(({ text }) => /catalogSource = '([^']+)'/u.exec(text)[1]);
  if (JSON.stringify(catalogSources) !== JSON.stringify(['cache', 'project'])) fail('P2_1_READER_FOUND', `the resolver takes a catalog from ${catalogSources.join(', ')}, not only the explicit cache and the installed project`);
  return {
    kind: 'source-absence',
    revision,
    registry: { file: registryFile, blob: git('rev-parse', `${revision}:${registryFile}`), ...surface },
    searches: [
      { for: 'a network client', pattern: networkPattern, scope: source, matches: network },
      { for: 'the words hosted or latest (case-insensitive); each match is a comment', pattern: 'hosted|latest', scope: source, matches: wording },
    ],
    childProcess: { matches: childProcess, pnpmArguments: pnpm },
    catalogSources,
  };
}

/** Read-only `npm view` of a package, with empty user and global npm config so no host credential or override reaches it. */
async function viewPackage({ name, version }) {
  return withIsolatedTemp('muxui-p2-1-registry-', async ({ temp, env }) => {
    const npm = (args) => {
      const result = spawnSync('npm', [...args, `--registry=${registry}`], { cwd: temp, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
      if (result.status !== 0) fail('P2_1_REGISTRY_COMMAND_FAILED', `npm ${args.slice(0, 2).join(' ')}: ${(result.stderr || result.stdout).trim().slice(-1000)}`);
      return JSON.parse(result.stdout);
    };
    const dist = npm(['view', `${name}@${version}`, 'dist.integrity', 'dist.shasum', 'dist.attestations', '--json']);
    const packument = [].concat(npm(['view', name, 'versions', 'time', 'dist-tags', '--json']))[0];
    const view = {
      integrity: dist['dist.integrity'],
      shasum: dist['dist.shasum'],
      attestations: dist['dist.attestations'],
      distTags: packument['dist-tags'],
      versions: [].concat(packument.versions ?? []),
      time: { [version]: packument.time?.[version] },
    };
    const response = await fetch(view.attestations?.url ?? 'about:blank');
    if (!response.ok) fail('P2_1_REGISTRY_PROVENANCE_MISSING', `${name}@${version}: attestations returned ${response.status}`);
    // What the registry says of the placeholder version, if the package lists one. `_npmUser` carries an address and is not kept.
    const placeholders = [];
    if (view.versions.includes(placeholderVersion)) {
      const document = npm(['view', `${name}@${placeholderVersion}`, 'description', 'dist.fileCount', 'dist.unpackedSize', 'dist.integrity', 'dist.shasum', 'dist.attestations', '--json']);
      placeholders.push({
        version: placeholderVersion,
        description: document.description ?? null,
        fileCount: document['dist.fileCount'] ?? null,
        unpackedSize: document['dist.unpackedSize'] ?? null,
        integrity: document['dist.integrity'] ?? null,
        shasum: document['dist.shasum'] ?? null,
        attestations: document['dist.attestations'],
        publishedAt: packument.time?.[placeholderVersion] ?? null,
      });
    }
    return { view, attestations: await response.json(), placeholders };
  });
}

// ---------------------------------------------------------------------------
// The published tuple: the four released packages installed from the public registry into a clean project, then run through
// their own muxui bin. The checks mirror what packages/tooling/test/packed-cli.test.mjs asks of the source-version tuple, where
// that still applies: its goldens hold the source-version output, so the published output is normalized instead.

const execFileAsync = promisify(execFile);
const BUTTON = 'muxui:component:button';
const detailLevels = ['brief', 'compact', 'full'];
const publishedPackageManager = 'pnpm@10.33.0';
const outputModes = { human: [], json: ['--json'], dense: ['--dense'] };
// Each case is a CLI invocation and the catalog API request it stands for.
const discoveryCases = detailLevels.flatMap((detail) => [
  { command: 'manifest', detail, args: ['manifest', '--detail', detail], request: { detail } },
  { command: 'list', detail, args: ['list', 'component', '--platform', 'web.react', '--detail', detail, '--limit', '2'], request: { kind: 'component', platform: 'web.react', detail, limit: 2, purpose: null, cursor: null, uses: null } },
  { command: 'search', detail, args: ['search', 'button', '--platform', 'web.react', '--detail', detail, '--limit', '2'], request: { query: 'button', platform: 'web.react', detail, limit: 2, purpose: null, cursor: null, uses: null } },
  { command: 'get', detail, args: ['get', BUTTON, '--platform', 'web.react', '--detail', detail], request: { id: BUTTON, platform: 'web.react', detail, purpose: null, section: null } },
]);
// The registry's budget fixtures: the arguments each command's dense budget is measured with.
const budgetFixtureArguments = { manifest: [], list: ['--limit', '1'], search: ['button', '--limit', '1'], get: [BUTTON] };
const invalidRequests = [
  { args: ['unknown'], code: 'MUXUI_QUERY_INVALID', exitCode: 2, ruleId: 'cli.command.unknown', next: 'muxui --json' },
  { args: ['list', '--bogus'], code: 'MUXUI_QUERY_INVALID', exitCode: 2, ruleId: 'cli.option.unknown', next: 'muxui list --help' },
  { args: ['get', BUTTON, '--platform', 'nope'], code: 'MUXUI_QUERY_INVALID', exitCode: 2, ruleId: 'cli.option.value', next: 'muxui get --help' },
  { args: ['list', '--cursor', 'wrong'], code: 'MUXUI_CURSOR_INVALID', exitCode: 3, ruleId: 'query.cursor.identity', next: 'muxui list --help' },
  { args: ['get', 'muxui:component:missing'], code: 'MUXUI_ARTIFACT_NOT_FOUND', exitCode: 4, ruleId: 'artifact.resolve.exists', next: 'muxui search "muxui:component:missing" --json' },
];
const unavailableCommandNames = ['validate', 'plan', 'doctor', 'init', 'migrate'];

// Run inside the project, so every import is the installed package.
const REFERENCE = `
  import { join } from 'node:path';
  import { pathToFileURL } from 'node:url';
  import * as catalog from '@muxui/catalog';
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
    tokens: input.map(({ mode, text, countedText, command, detail }) => (mode === 'dense' && command
      ? { used: countTokens(text), counted: countTokens(countedText), budget: tokenBudgetFor(commandRegistry, command, detail) }
      : null)),
    budgetFixtures: Object.fromEntries(commandRegistry.commands.map(({ name, budgetFixture }) => [name, budgetFixture])),
  }));
`;

/** A temporary directory and an environment that reads empty npm user and global config, so no host credential or registry override reaches npm or pnpm. */
async function withIsolatedTemp(prefix, callback) {
  const temp = mkdtempSync(join(tmpdir(), prefix));
  try {
    const userConfig = join(temp, 'empty-userconfig');
    const globalConfig = join(temp, 'empty-globalconfig');
    writeFileSync(userConfig, '');
    writeFileSync(globalConfig, '');
    return await callback({ temp, env: isolatedPackageManagerEnvironment(process.env, { userConfig, globalConfig }) });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/**
 * Installs the released packages (exact versions, scripts ignored) from the public registry into a new project and runs the
 * installed muxui bin through the discovery matrix, the budget fixtures, an invalid-request corpus, and the commands P2.1 does
 * not enable. Every check is recorded as it came out, passed or not, and the parts that rest on it follow; only a failure to
 * install or run stops the capture. `output` is the sanitized text of every run.
 */
async function observePublishedTuple({ release, manifest, ceiling, sourceRevision, captureTimestamp }) {
  return withIsolatedTemp('muxui-p2-1-published-', async ({ temp, env }) => {
    const project = join(temp, 'project');
    mkdirSync(project);
    const exact = Object.fromEntries(release.packages.map(({ name, version }) => [name, version]));
    writeFileSync(join(project, 'package.json'), `${JSON.stringify({ name: 'published-tuple-consumer', version: '1.0.0', private: true, type: 'module', packageManager: publishedPackageManager, dependencies: exact }, null, 2)}\n`);
    const pnpm = (args) => spawnSync('pnpm', args, { cwd: project, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600_000 });
    const install = pnpm(['install', '--ignore-scripts', '--no-frozen-lockfile', `--registry=${registry}`]);
    if (install.status !== 0) fail('P2_1_PUBLISHED_INSTALL_FAILED', (install.stderr || install.stdout).trim().slice(-1000));

    const checks = [];
    const check = (id, claim, passed, observed) => checks.push({ id, claim, passed: Boolean(passed), observed });
    const readJson = (...path) => JSON.parse(readFileSync(join(project, ...path), 'utf8'));
    const entryOf = (name) => release.packages.find((candidate) => candidate.name === name);

    // The four packages are the registry's bytes, built from the release commit.
    const locked = [...readFileSync(join(project, 'pnpm-lock.yaml'), 'utf8').matchAll(/^ {2}'(@muxui\/[\w-]+)@([^']+)':\n {4}resolution: \{([^}]*)\}/gmu)]
      .map(([, name, version, resolution]) => ({ name, version, resolution }));
    const installs = release.packages.map(({ name, version, integrity }) => {
      const installed = readJson('node_modules', name, 'package.json');
      const lockEntries = locked.filter((entry) => entry.name === name);
      return { name, version, installedVersion: installed.version, gitHead: installed.gitHead ?? null, locked: lockEntries.map(({ version: lockedVersion, resolution }) => ({ version: lockedVersion, resolution })), releaseIntegrity: integrity };
    });
    check('registry-install', 'each released package is installed from the public registry at its exact version, with the integrity the release manifest records and the release commit as its gitHead', installs.every((item) => item.installedVersion === item.version && item.gitHead === sourceRevision
      && isDeepStrictEqual(item.locked, [{ version: item.version, resolution: `integrity: ${item.releaseIntegrity}` }])) && locked.length === release.packages.length, installs);

    // Nothing the muxui bin reads is the checkout.
    const projectRoot = realpathSync(project);
    const modules = join(projectRoot, 'node_modules');
    const packageRoots = Object.fromEntries(release.packages.map(({ name }) => [name, realpathSync(join(project, 'node_modules', name))]));
    const toolingBin = readJson('node_modules/@muxui/tooling/package.json').bin.muxui;
    const toolingBinPath = realpathSync(join(packageRoots['@muxui/tooling'], toolingBin));
    const schemaBesideTooling = realpathSync(join(packageRoots['@muxui/tooling'], '../schema'));
    const shim = readFileSync(join(project, 'node_modules/.bin/muxui'), 'utf8');
    const shimTarget = `.pnpm/@muxui+tooling@${entryOf('@muxui/tooling').version}/node_modules/@muxui/tooling/${toolingBin.replace(/^\.\//u, '')}`;
    const inside = (path) => path.startsWith(`${modules}${sep}`);
    check('installed-not-source', 'the project is outside the checkout and the muxui bin, the packages it reads, and the schema beside tooling all resolve inside the project\'s node_modules', !`${projectRoot}${sep}`.startsWith(`${repositoryRoot}${sep}`)
      && Object.values(packageRoots).every(inside) && inside(toolingBinPath) && inside(schemaBesideTooling) && shim.includes(`"$basedir/../${shimTarget}"`), {
      projectOutsideCheckout: !`${projectRoot}${sep}`.startsWith(`${repositoryRoot}${sep}`),
      packages: Object.fromEntries(Object.entries(packageRoots).map(([name, path]) => [name, relative(projectRoot, path).split(sep).join('/')])),
      bin: relative(projectRoot, toolingBinPath).split(sep).join('/'),
      shimRuns: shimTarget,
    });

    // The CLI: every invocation, run at most once, a few at a time.
    const bin = join(project, 'node_modules/.bin/muxui');
    const invocations = new Map();
    let active = 0;
    const waiting = [];
    const muxui = (args) => {
      const key = JSON.stringify(args);
      if (!invocations.has(key)) {
        invocations.set(key, (async () => {
          while (active >= 6) await new Promise((resolve) => { waiting.push(resolve); });
          active += 1;
          try {
            const { stdout, stderr } = await execFileAsync(bin, args, { cwd: project, env, maxBuffer: 1 << 26 });
            return { args, status: 0, stdout, stderr };
          } catch (error) {
            if (typeof error.code !== 'number') throw error;
            return { args, status: error.code, stdout: error.stdout, stderr: error.stderr };
          } finally {
            active -= 1;
            waiting.shift()?.();
          }
        })());
      }
      return invocations.get(key);
    };
    const withMode = (args, mode) => [...args, ...outputModes[mode]];
    const matrix = discoveryCases.flatMap((entry) => Object.keys(outputModes).map((mode) => ({ ...entry, mode, pending: muxui(withMode(entry.args, mode)) })));
    const fixtures = detailLevels.flatMap((detail) => Object.entries(budgetFixtureArguments).map(([command, args]) => ({ command, detail, pending: muxui([command, ...args, '--detail', detail, '--dense']) })));
    const listAll = muxui(['list', 'component', '--platform', 'web.react', '--limit', '100', '--detail', 'brief', '--json']);
    const invalid = invalidRequests.map((entry) => ({ ...entry, pending: muxui([...entry.args, '--json']) }));
    const missing = invalidRequests.at(-1);
    const missingRenderings = { human: muxui(missing.args), dense: muxui([...missing.args, '--dense']) };
    const refusals = unavailableCommandNames.map((name) => ({ name, pending: muxui([name, '--json']) }));
    for (const entry of [...matrix, ...fixtures, ...invalid, ...refusals]) entry.result = await entry.pending;
    const listedAll = await listAll;
    const missingResults = { human: await missingRenderings.human, dense: await missingRenderings.dense };

    const cases = Object.fromEntries(matrix.filter(({ mode }) => mode === 'json').map((entry) => [`${entry.command}-${entry.detail}`, { ...entry, response: JSON.parse(entry.result.stdout) }]));
    const descriptor = readJson('node_modules/@muxui/react/generated/renderer-descriptor.json');
    const descriptorSha = sha256(readFileSync(join(project, 'node_modules/@muxui/react/generated/renderer-descriptor.json')));
    const manifestDescriptor = manifest.descriptors.find(({ package: owner }) => owner === '@muxui/react');
    const react = entryOf('@muxui/react');
    const catalogEntry = entryOf('@muxui/catalog');
    const responses = Object.values(cases).map(({ response }) => response);
    const platformResponses = Object.values(cases).filter(({ command }) => command !== 'manifest').map(({ response }) => response);

    check('release-identity', 'the catalog the bin reads is the release manifest\'s catalog (digest and version), and the installed React descriptor is the manifest\'s descriptor (digest, version, binding count)',
      responses.every(({ meta }) => meta.catalogDigest === manifest.catalog.digest && meta.catalogVersion === manifest.catalog.version)
      && descriptorSha === manifestDescriptor.digest && descriptor.version === react.version && Object.keys(descriptor.bindings).length === manifestDescriptor.bindings,
      { catalogDigest: manifest.catalog.digest, catalogVersion: manifest.catalog.version, descriptor: { sha256: descriptorSha, version: descriptor.version, bindings: Object.keys(descriptor.bindings).length, manifestDigest: manifestDescriptor.digest } });

    const componentIds = Object.keys(descriptor.bindings).map((binding) => binding.split('#')[0]).sort();
    const listedIds = listedAll.status === 0 ? JSON.parse(listedAll.stdout).data.items.map(({ id }) => id).sort() : null;
    const succeeded = matrix.every(({ result }) => result.status === 0 && result.stderr === '');
    const oneValue = matrix.filter(({ mode }) => mode === 'json').every(({ result }) => result.stdout.trimEnd().split('\n').length === 1);
    check('discovery-runs', 'manifest, list, search, and get succeed with empty stderr at every detail level in human, JSON, and dense output, and discover and retrieve the React tuple: every component binding the installed descriptor carries is listed for web.react, search finds Button first, and get returns it with a binding spec revision',
      succeeded && oneValue && isDeepStrictEqual(listedIds, componentIds) && componentIds.includes(BUTTON) && cases['search-brief'].response.data.items[0].id === BUTTON
      && detailLevels.every((detail) => cases[`get-${detail}`].response.data.artifact.id === BUTTON && cases[`get-${detail}`].response.meta.platform === 'web.react' && /^sha256:[0-9a-f]{64}$/u.test(cases[`get-${detail}`].response.meta.revisions.bindingSpec)),
      { runs: matrix.length, allSucceededWithEmptyStderr: succeeded, jsonIsOneValue: oneValue, listedComponents: listedIds?.length ?? null, descriptorComponents: componentIds.length, searchBriefFirst: cases['search-brief'].response.data.items[0].id });

    const targetPackages = { '@muxui/catalog': catalogEntry.version, '@muxui/react': react.version };
    const resolutions = platformResponses.map(({ meta }) => ({ authority: meta.resolution.authority, catalogSource: meta.resolution.catalogSource, compatibility: meta.resolution.compatibility, targetPackages: meta.resolution.targetPackages }));
    const specRevision = descriptor.bindings[`${BUTTON}#web.react`].specRevision;
    check('installed-local-resolution', 'every platform response resolves from the installed project with exact compatibility over the installed catalog and React versions, and get\'s binding spec revision is the one in the installed React descriptor',
      resolutions.every((resolution) => isDeepStrictEqual(resolution, { authority: 'installed-local', catalogSource: 'project', compatibility: 'exact', targetPackages }))
      && detailLevels.every((detail) => cases[`get-${detail}`].response.meta.resolution.revisions.bindingSpec === specRevision),
      { responses: resolutions.length, authority: 'installed-local', catalogSource: 'project', compatibility: 'exact', targetPackages, bindingSpecRevision: specRevision });

    // Every rendering normalizes to one response, equal to the catalog API's for the same request, and dense output has a count.
    const reference = inProject(project, env, REFERENCE, discoveryCases.map(({ command, request }) => ({ command, request })));
    const renderings = [
      ...matrix.map(({ mode, command, detail, result }) => ({ mode, text: result.stdout, countedText: withoutRcSuffixes(result.stdout), command, detail })),
      ...fixtures.map(({ command, detail, result }) => ({ mode: 'dense', text: result.stdout, countedText: withoutRcSuffixes(result.stdout), command, detail })),
    ];
    const normalized = inProject(project, env, NORMALIZE, renderings);
    const modeNames = Object.keys(outputModes);
    const normalizedCases = discoveryCases.map((entry, index) => {
      const { project: resolved, plain } = reference[index];
      const equal = Object.fromEntries(modeNames.map((mode, offset) => [mode, isDeepStrictEqual(normalized.responses[index * modeNames.length + offset], resolved)]));
      // Project resolution adds installed-tuple authority; the artifact record is the catalog's own.
      const artifact = entry.command === 'get' && entry.detail === 'compact' ? isDeepStrictEqual(resolved.data.artifact, plain.data.artifact) : null;
      return { case: `${entry.command}-${entry.detail}`, ...equal, ...(artifact === null ? {} : { artifactIsCatalogs: artifact }) };
    });
    check('modes-normalize', 'the human, JSON, and dense renderings of every case parse to the same response, equal to the one the installed catalog API and project resolver build for the same request', normalizedCases.every((entry) => Object.values(entry).every((value) => value === true || typeof value === 'string')), normalizedCases);

    // Dense token counts against the installed registry's budgets; get --platform web.react at full detail has the amended ceiling.
    const matrixCount = matrix.length;
    const denseRows = [
      ...matrix.flatMap((entry, index) => (entry.mode === 'dense' ? [{ entry, tokens: normalized.tokens[index] }] : [])).map(({ entry, tokens }) => ({ command: entry.command, detail: entry.detail, args: withMode(entry.args, 'dense'), set: entry.command === 'get' ? 'get-web.react' : 'discovery', ...tokens })),
      ...fixtures.map((entry, index) => ({ command: entry.command, detail: entry.detail, args: [entry.command, ...budgetFixtureArguments[entry.command], '--detail', entry.detail, '--dense'], set: 'budget-fixture', ...normalized.tokens[matrixCount + index] })),
    ].map((row) => ({ ...row, ceiling: row.set === 'get-web.react' && row.detail === 'full' ? ceiling : row.budget }));
    const rowsOf = (set) => denseRows.filter((row) => row.set === set);
    // A count is the installed countTokens' on the output without its `-rc.N` version suffixes; the raw count is kept beside it.
    const within = ({ counted, ceiling: limit }) => counted > 0 && counted <= limit;
    const label = ({ args }) => args.slice(0, -1).join(' ');
    const figures = ({ used, counted }) => `raw ${used}, counted ${counted}`;
    const rawOver = denseRows.filter(({ set, used, ceiling: limit }) => set !== 'discovery' && used > limit);
    const rawOverSummary = rawOver.map((row) => `${label(row)} --dense ${figures(row)}, budget ${row.budget}`).join('; ');
    const summarize = (rows) => (rows.every(within) ? 'all inside their budgets' : `over budget: ${rows.filter((row) => !within(row)).map((row) => `${label(row)} --dense ${figures(row)}, budget ${row.budget}`).join('; ')}`);
    const getRows = rowsOf('get-web.react');
    const denseGetSummary = `get --platform web.react --dense ${getRows.map((row) => `${row.detail} ${figures(row)} ${row.ceiling === row.budget ? `of ${row.budget}` : `against the ${row.ceiling} ceiling (registry budget ${row.budget})`}`).join(', ')}`;
    const fixtureRows = rowsOf('budget-fixture');
    const fixturesAgree = isDeepStrictEqual(normalized.budgetFixtures, { manifest: {}, list: { limit: 1 }, search: { query: 'button', limit: 1 }, get: { 'id-or-alias': BUTTON } });
    const denseFixtureSummary = `${fixtureRows.length} fixture counts, ${summarize(fixtureRows)}`;
    const rowFacts = (rows) => rows.map(({ args, used, counted, budget, ceiling: limit }) => ({ args, used, counted, budget, ceiling: limit }));
    check('dense-get-react', `dense output of get --platform web.react is inside its token budget at brief and compact detail and inside the ${ceiling}-token ceiling at full detail, counted by the installed countTokens without the tokens of -rc.N version suffixes (the Roadmap row as amended after the release)`, getRows.length === detailLevels.length && getRows.every(within), { rows: rowFacts(getRows) });
    check('dense-budget-fixtures', 'dense output of the registry\'s budget fixtures is inside the installed registry\'s token budget at every detail level, counted by the installed countTokens without the tokens of -rc.N version suffixes (the Roadmap row as amended after the release), and the fixtures are the registry\'s own', fixturesAgree && fixtureRows.length === detailLevels.length * Object.keys(budgetFixtureArguments).length && fixtureRows.every(within), { budgetFixturesAreTheRegistrys: fixturesAgree, rows: rowFacts(fixtureRows) });
    // The matrix's other dense outputs (limit 2, with a platform) have no recorded gate; their counts are kept for the record.
    const otherDense = rowFacts(rowsOf('discovery'));

    // An invalid request is a structured error, and one error's three renderings are one response.
    const invalidProblems = invalid.flatMap(({ args, code, exitCode, ruleId, next, result }) => {
      let response;
      try { response = JSON.parse(result.stdout); } catch { return [{ args, problem: 'stdout is not JSON' }]; }
      const got = { status: result.status, stderr: result.stderr, type: response.type, code: response.error?.code, ruleId: response.error?.ruleId, nextCommand: response.error?.nextCommand };
      const want = { status: exitCode, stderr: '', type: 'error', code, ruleId, nextCommand: { command: next, effect: 'read-only', requiresConfirmation: false } };
      return isDeepStrictEqual(got, want) ? [] : [{ args, got, want }];
    });
    const errorRenderings = inProject(project, env, NORMALIZE, [
      { mode: 'human', text: missingResults.human.stderr },
      { mode: 'json', text: invalid.at(-1).result.stdout },
      { mode: 'dense', text: missingResults.dense.stdout },
    ]).responses;
    const errorRenderingsAgree = isDeepStrictEqual(errorRenderings[0], errorRenderings[1]) && isDeepStrictEqual(errorRenderings[2], errorRenderings[1])
      && missingResults.human.stdout === '' && missingResults.human.status === missing.exitCode && missingResults.dense.status === missing.exitCode;
    check('invalid-requests', 'each invalid request returns a structured error with a stable code, exit status, rule id, and a read-only nextCommand, and the human, JSON, and dense renderings of one error are one response', invalidProblems.length === 0 && errorRenderingsAgree,
      { requests: invalid.map(({ args, code, exitCode, ruleId }) => ({ args, code, exitCode, ruleId })), problems: invalidProblems, errorRenderingsAgree });

    // The commands P2.1 does not enable are unavailable in the manifest, and running one is the typed refusal.
    const { cli, capabilities } = cases['manifest-full'].response.data;
    const unavailable = Object.fromEntries(cli.unavailableCommands.map(({ name, capability }) => [name, capability.available]));
    const refusalProblems = refusals.filter(({ result }) => { try { return result.status !== 2 || JSON.parse(result.stdout).error.ruleId !== 'cli.command.unknown'; } catch { return true; } }).map(({ name }) => name);
    check('unavailable-commands', 'the manifest lists only manifest, list, search, and get as commands and every other command P2.1 does not enable as unavailable, its one capability is the query baseline, and running an unavailable command is the typed refusal',
      isDeepStrictEqual(cli.commands.map(({ name }) => name), ['manifest', 'list', 'search', 'get']) && isDeepStrictEqual(unavailable, Object.fromEntries(unavailableCommandNames.map((name) => [name, false])))
      && isDeepStrictEqual(capabilities.map(({ id, availability }) => [id, availability]), [['muxui:capability:query-baseline', 'available']]) && refusalProblems.length === 0,
      { commands: cli.commands.map(({ name }) => name), unavailable, capabilities: capabilities.map(({ id, availability }) => [id, availability]), refusalsWithoutTypedError: refusalProblems });

    // What the published tooling says its own version is, observed beside the version npm installed.
    const toolingVersion = {
      installed: entryOf('@muxui/tooling').version,
      muxuiVersionInResponses: [...new Set(responses.map(({ meta }) => meta.muxuiVersion))].sort(),
      cliVersionInManifest: cli.cli.version,
    };
    toolingVersion.reportsInstalledVersion = toolingVersion.muxuiVersionInResponses.length === 1 && toolingVersion.muxuiVersionInResponses[0] === toolingVersion.installed;
    const declaration = grepAt(sourceRevision, 'const TOOLING_VERSION = ', ['packages/tooling/src/local-resolver.mjs'])[0] ?? null;
    toolingVersion.source = declaration && { revision: sourceRevision, ...declaration };

    // The sanitized text of every run, in the order it was first requested.
    const runs = [...matrix, ...fixtures, { result: listedAll }, ...invalid, { result: missingResults.human }, { result: missingResults.dense }, ...refusals].map(({ result }) => result)
      .filter((result, index, all) => all.findIndex((other) => isDeepStrictEqual(other.args, result.args)) === index);
    // Beyond the shared rules, two public names the disclosure check reads as possible secrets are replaced; the raw digests below
    // bind the original bytes. A manifest field named requestKey (the query field a CLI argument fills) has its value replaced, because a
    // key ending in "key" with a plain value looks like a credential. A token id inside a longer string, such as the example command
    // `muxui get muxui:token:<name>`, loses its name, because `token:<name>` looks like a credential value; a token id that is a whole
    // quoted string is a public identifier the check allows, and stays.
    const rewrites = { sharedRulesChangedLines: 0, requestKeyValues: 0, tokenIdsInsideLongerStrings: 0 };
    const clean = (text) => text.replace(/\n$/u, '').split('\n').map((line) => {
      const kept = sanitize(line);
      if (kept !== line) rewrites.sharedRulesChangedLines += 1;
      return kept
        .replace(/"requestKey":"[^"]*"/gu, () => { rewrites.requestKeyValues += 1; return '"requestKey":"<public-id>"'; })
        .replace(/(["']?)((?:muxui|core):token:[a-z0-9]+(?:-[a-z0-9]+)*)(["']?)/gu, (match, before, _id, after) => {
          if (before !== '' && before === after) return match;
          rewrites.tokenIdsInsideLongerStrings += 1;
          return `${before}muxui:<public-token-id>${after}`;
        });
    }).join('\n');
    const output = `${[
      `# muxui ${toolingVersion.installed} (the installed bin) run in a clean project that installed ${release.packages.map(({ name, version }) => `${name}@${version}`).join(', ')} from ${registry}, at ${captureTimestamp}`,
      ...runs.flatMap(({ args, status, stdout, stderr }) => [`$ muxui ${args.join(' ')}`, `exit ${status}`, ...(stdout === '' ? [] : ['stdout:', clean(stdout)]), ...(stderr === '' ? [] : ['stderr:', clean(stderr)])]),
    ].join('\n')}\n`;

    return {
      output,
      phase: {
        captureTimestamp,
        observed: 'installed from the public registry after the release, at capture time; only the four @muxui packages are bound to the release manifest',
        tools: { node: process.version, pnpm: pnpm(['--version']).stdout.trim(), packageManager: publishedPackageManager, install: `pnpm install --ignore-scripts --no-frozen-lockfile --registry=${registry}`, config: 'empty npm user and global config' },
        dependencies: exact,
        checks,
        runs: runs.map(({ args, status, stdout, stderr }) => ({ args, status, stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr), stdoutSha256: sha256(stdout) })),
        toolingVersion,
        countRule: { excludes: 'the -rc.N suffix of X.Y.Z-rc.N versions in the dense output, before the installed countTokens counts it', pattern: rcSuffix.source, replacement: '$1', roadmap: 'E-P2.1-02, amended after the release' },
        denseGetSummary,
        denseFixtureSummary,
        rawOverBudget: rawOverSummary,
        discoveryDenseCounts: otherDense,
        sanitization: rewrites,
      },
    };
  });
}

/** Runs an ES module `script` in `project`, so its bare imports resolve to the installed packages; it sees the JSON `input` and prints its result as JSON. */
function inProject(project, env, script, input) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import { readFileSync } from 'node:fs';\nconst input = JSON.parse(readFileSync(0, 'utf8'));\n${script}`], {
    cwd: project, env, input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 1 << 26,
  });
  if (result.status !== 0) fail('P2_1_PUBLISHED_SCRIPT_FAILED', result.stderr.trim().slice(-800));
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

// ---------------------------------------------------------------------------
// Capture.

function proofToolIdentity(rehearsal) {
  const bytes = readFileSync(join(repositoryRoot, captureTool));
  const committed = spawnSync('git', ['show', `HEAD:${captureTool}`], { cwd: repositoryRoot });
  if (committed.status !== 0 || !committed.stdout.equals(bytes)) {
    if (!rehearsal) fail('P2_1_PROOF_TOOL_UNCOMMITTED', `${captureTool} must match HEAD`);
    return { path: captureTool, sha256: sha256(bytes), revision: { status: 'uncommitted-rehearsal' } };
  }
  const revision = git('log', '-1', '--format=%H', '--', captureTool);
  return { path: captureTool, sha256: sha256(bytes), revision, tree: git('rev-parse', `${revision}^{tree}`) };
}

function parseArguments(argv) {
  const options = { evidence: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split(/=(.*)/su);
    const value = () => inline ?? argv[++index];
    if (flag === '--evidence') options.evidence = true;
    else if (flag === '--version') options.version = value();
    else if (flag === '--capture-timestamp') options.captureTimestamp = value();
    else if (flag === '--after-ci-run') options.afterCiRun = value();
    else if (flag === '--publish-approval') options.approval = value();
    else if (flag === '--publish-approval-date') options.approvalDate = value();
    else if (flag === '--review') options.review = resolve(value());
    else if (flag === '--review-revision') options.reviewRevision = value();
    else if (flag === '--out') options.out = resolve(value());
    else if (flag === '--rehearsal') options.rehearsal = true;
    else fail('P2_1_ARGUMENT_INVALID', `unknown argument ${argv[index]}`);
  }
  if (!/^0\.1\.0-rc\.\d+$/u.test(options.version ?? '')) fail('P2_1_ARGUMENT_INVALID', 'pass --version=<the React candidate, such as 0.1.0-rc.5>');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(options.captureTimestamp ?? '')) fail('P2_1_ARGUMENT_INVALID', 'pass --capture-timestamp=YYYY-MM-DDTHH:MM:SSZ');
  if (!options.evidence && !options.review) fail('P2_1_ARGUMENT_INVALID', 'pass --evidence, --review, or both');
  if (options.evidence && !/^\d+:\d+$/u.test(options.afterCiRun ?? '')) fail('P2_1_ARGUMENT_INVALID', '--evidence needs --after-ci-run=<run id>:<attempt>');
  if (options.evidence && !(options.approval && /^\d{4}-\d{2}-\d{2}$/u.test(options.approvalDate ?? ''))) {
    fail('P2_1_ARGUMENT_INVALID', '--evidence needs --publish-approval=<text> and --publish-approval-date=<YYYY-MM-DD>');
  }
  if (Boolean(options.review) !== Boolean(options.reviewRevision)) fail('P2_1_ARGUMENT_INVALID', '--review and --review-revision go together');
  if (options.rehearsal && !options.out) fail('P2_1_ARGUMENT_INVALID', 'a rehearsal writes only to --out');
  if (options.rehearsal && `${options.out}/`.startsWith(join(repositoryRoot, 'tests/evidence/'))) fail('P2_1_REHEARSAL_ROUTE', 'a rehearsal writes only to --out outside tests/evidence');
  options.out ??= join(repositoryRoot, root);
  return options;
}

/** The R1 exit route of the React candidate, read and checked: the release this capture binds to. */
function readRoute(version, { rehearsal }) {
  const route = routeOf(version);
  const read = (relative) => readFileSync(join(repositoryRoot, relative), 'utf8');
  const verification = JSON.parse(read(`${route}/verification.json`));
  const { dryRun, publish, registry: observed } = verification.phases;
  if (!dryRun?.portfolio || !publish?.portfolio || !observed) fail('P2_1_ROUTE_INCOMPLETE', `${route} lacks a portfolio dry run, publish run, or registry read-back`);
  if ((verification.rehearsal && !rehearsal) || dryRun.candidate.version !== version) fail('P2_1_ROUTE_INVALID', `${route} is a rehearsal or another candidate`);
  const index = JSON.parse(read(`${route}/index.json`));
  const records = {};
  for (const { assertionId, path, sha256: digest } of index.records) {
    const text = read(path);
    if (sha256(text) !== digest) fail('P2_1_ROUTE_CHANGED', `${path} no longer matches the route index`);
    const record = JSON.parse(text);
    if (record.outcome !== 'pass') fail('P2_1_ROUTE_NOT_PASSING', `${assertionId} of ${route} is ${record.outcome}`);
    records[assertionId] = { path, sha256: digest, outcome: record.outcome };
  }
  const excerpts = {};
  for (const [key, ref] of Object.entries(verification.retained)) {
    const text = read(ref.path);
    if (sha256(text) !== ref.sha256) fail('P2_1_ROUTE_CHANGED', `${ref.path} no longer matches its capture digest`);
    excerpts[key] = { ...ref, lines: text.split('\n') };
  }
  return { route, verification, index, records, excerpts };
}

/** The first line of `lines` (an excerpt, timestamps and all) whose content matches `pattern`, as `{ line, text }`. */
function findLine(lines, pattern, label) {
  const at = lines.findIndex((line) => pattern.test(content(line)));
  if (at < 0) fail('P2_1_LOG_LINE_MISSING', `${label}: no line matches ${pattern}`);
  return { line: at + 1, text: content(lines[at]) };
}

/** The lines of `lines` between `Publishing <label> (n of N)` and the next `Publishing` line, as 1-based `{ start, end }`. */
function publishBlock(lines, label) {
  const start = lines.findIndex((line) => new RegExp(`^Publishing ${label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')} \\(\\d+ of \\d+\\)$`, 'u').test(content(line)));
  if (start < 0) fail('P2_1_LOG_LINE_MISSING', `the publish excerpt has no block for ${label}`);
  const next = lines.findIndex((line, at) => at > start && content(line).startsWith('Publishing '));
  return { start, end: next < 0 ? lines.length : next };
}

const resolverSource = ['packages/tooling/src', 'packages/catalog/src', 'packages/schema/src'];

/**
 * One CI job, read from its run's jobs and log. It must have succeeded, run its own tests (not reused an earlier pass), and run
 * `group`. Returns the log, the commit the job checked out, and the lines and totals of the log that `cites` names.
 */
function readCiJob({ github, jobs, name, group, cites }) {
  const job = jobs.find((candidate) => candidate.name === name);
  if (job?.conclusion !== 'success') fail('P2_1_CI_RUN_INVALID', `job ${name} did not succeed`);
  // A job that reused an earlier pass ran no tests; its steps would be skipped otherwise.
  if (job.steps?.find((step) => step.name === 'Reuse earlier pass')?.conclusion !== 'skipped') fail('P2_1_CI_JOB_REUSED', `job ${name} reused an earlier pass, so it ran no tests`);
  const raw = github.log(job.id);
  const lines = raw.split('\n');
  if (!lines.some((line) => content(line).startsWith(`[ci-impact] running group ${group} `))) fail('P2_1_CI_JOB_UNBOUND', `job ${name} did not run group ${group}`);
  const checkedOut = lines.map((line, at) => (content(line).includes('git log -1 --format=%H') ? content(lines[at + 1] ?? '').trim() : null)).find(Boolean);
  return { job, name, group, raw, lines, checkedOut, ...ciExcerpt(raw, cites) };
}

/** Retains the excerpt of a job read by `readCiJob`, headed by `heading`, and returns it with the job's record. */
function retainCiJob(read, { heading, stage }) {
  const { job, name, group, raw, lines, kept, totals } = read;
  const text = `${[heading, ...kept.map(({ text: line }) => line)].join('\n')}\n`;
  const ref = stage(`${root}/validation/${group}-${job.id}.txt`, text);
  const excerpt = { ...ref, rawLines: kept.map(({ raw: at }) => at) };
  return {
    ref,
    group,
    // The retained lines, one-based as an excerpt is cited (index 0 is empty).
    excerptLines: [''].concat(text.split('\n').slice(0, -1)),
    phase: {
      jobId: job.id,
      job: name,
      group,
      conclusion: job.conclusion,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      commands: lines.map((line) => /^\[ci-impact\] command: (.+)$/u.exec(content(line))?.[1]).filter(Boolean).map(sanitize),
      testTotals: totals,
      rawLog: { bytes: Buffer.byteLength(raw), lines: lines.length, sha256: sha256(raw), retained: false },
      excerpt,
    },
  };
}

/**
 * The pull request CI run, after the release commit, whose tooling job ran the test added after it. A pull request job
 * checks out the merge of the head into its base, so the job is bound by that merge's tree, which must be the head's,
 * and capture checks that the resolver source did not change between the release commit and the head.
 */
function readLaterCi({ github, run, sourceRevision, cites, stage }) {
  const [runId, attempt] = run.split(':').map(Number);
  const ciRun = github.attempt(runId, attempt);
  const head = ciRun.head_sha;
  if (ciRun.path !== ciWorkflowPath || ciRun.event !== 'pull_request' || ciRun.status !== 'completed' || ciRun.conclusion !== 'success' || ciRun.run_attempt !== attempt || !/^[0-9a-f]{40}$/u.test(head)) {
    fail('P2_1_LATER_CI_INVALID', `run ${runId} attempt ${attempt} is not a successful pull request CI run`);
  }
  if (spawnSync('git', ['merge-base', '--is-ancestor', sourceRevision, head], { cwd: repositoryRoot }).status !== 0) fail('P2_1_LATER_CI_INVALID', `${head} is not a descendant of ${sourceRevision} in this checkout`);
  const jobs = github.attemptJobs(runId, attempt);
  const aggregate = jobs.find((candidate) => candidate.name === 'check');
  if (aggregate?.conclusion !== 'success') fail('P2_1_LATER_CI_INVALID', `the aggregate check of run ${runId} did not succeed`);
  const read = readCiJob({ github, jobs, name: 'run checks-tooling', group: 'checks-tooling', cites });
  const merge = github.commit(read.checkedOut);
  const headTree = git('rev-parse', `${head}^{tree}`);
  if (merge.parents.length !== 2 || merge.parents[1] !== head || merge.tree !== headTree) fail('P2_1_LATER_CI_UNBOUND', `the job checked out ${read.checkedOut}, which is not a merge of ${head} with the head's tree`);
  const changed = git('diff', '--name-only', sourceRevision, head, '--', ...resolverSource).split('\n').filter(Boolean);
  if (changed.length > 0) fail('P2_1_LATER_RESOLVER_CHANGED', `the resolver source changed between ${sourceRevision} and ${head}: ${changed.join(', ')}`);
  // The test file gained tests and lost none, so every test cited from the release commit's run is still what it was.
  const [added, deleted] = git('diff', '--numstat', sourceRevision, head, '--', packedCli).split('\t');
  if (!(Number(added) > 0 && deleted === '0')) fail('P2_1_LATER_TEST_FILE', `${packedCli} did not only gain lines between ${sourceRevision} and ${head} (${added} added, ${deleted} deleted)`);

  const retained = retainCiJob(read, { stage, heading: `# job: ${read.name} (job ${read.job.id}) of pull request CI run ${runId} attempt ${attempt} at head ${head}, which checked out merge ${read.checkedOut} of it into ${merge.parents[0]}, filtered to the group and commands it ran, the totals each node --test printed, and the passing lines this capture cites` });
  return {
    head,
    ...retained,
    phase: {
      execution: {
        repository, workflowPath: ciRun.path, event: ciRun.event, headBranch: ciRun.head_branch, pullRequests: (ciRun.pull_requests ?? []).map(({ number }) => number), runId: ciRun.id, runAttempt: ciRun.run_attempt, headRevision: head,
        startedAt: ciRun.run_started_at, conclusion: ciRun.conclusion, aggregateCheck: { jobId: aggregate.id, conclusion: aggregate.conclusion },
      },
      job: retained.phase,
      checkedOut: { ref: 'the pull request merge ref', commit: read.checkedOut, parents: merge.parents, tree: merge.tree, headTree },
      sinceRelease: { sourceRevision, head, resolverSource: { command: `git diff --name-only ${sourceRevision} ${head} -- ${resolverSource.join(' ')}`, changedPaths: changed }, testFile: { path: packedCli, linesAdded: Number(added), linesDeleted: Number(deleted) } },
    },
  };
}

/**
 * The Roadmap as amended after the release, read at HEAD: only E-P2.1-02's assertion differs from the source revision's, and its
 * dense clause names the ceiling the test pins and the prerelease-suffix rule the counts apply. The amending commits follow the
 * release commit, and the later CI run's head is among their ancestors.
 */
function readAmendedRoadmap({ laterHead, sourceRevision, rows, ceilingConstant }) {
  const amendedRows = roadmapRows(gitShow('HEAD', roadmap));
  const changedIds = assertionIds.filter((id) => JSON.stringify(amendedRows[id]) !== JSON.stringify(rows[id]));
  if (JSON.stringify(changedIds) !== JSON.stringify(['E-P2.1-02']) || amendedRows['E-P2.1-02'].requiredEvidence !== rows['E-P2.1-02'].requiredEvidence) fail('P2_1_AMENDED_ROADMAP_ROWS', `the rows changed between ${sourceRevision} and HEAD are ${changedIds.join(', ') || 'none'}, not E-P2.1-02's assertion alone`);
  if (spawnSync('git', ['merge-base', '--is-ancestor', laterHead, 'HEAD'], { cwd: repositoryRoot }).status !== 0) fail('P2_1_AMENDED_ROADMAP_CHANGED', `HEAD does not descend from the later CI run's head ${laterHead}`);
  // The commits after the release that changed the row (others change the Roadmap elsewhere).
  const rowAt = (revision) => JSON.stringify(roadmapRows(gitShow(revision, roadmap))['E-P2.1-02']);
  const commits = git('log', '--reverse', '--format=%H', `${sourceRevision}..HEAD`, '--', roadmap).split('\n').filter((commit) => commit && rowAt(commit) !== rowAt(`${commit}^`));
  if (commits.length === 0) fail('P2_1_AMENDED_ROADMAP_CHANGED', `no commit after ${sourceRevision} changes the E-P2.1-02 row`);
  const assertion = amendedRows['E-P2.1-02'].assertion;
  const fromRoadmap = /full-detail `get --platform web\.react --dense` has a (\d+)-token ceiling/u.exec(assertion)?.[1];
  const fromTest = new RegExp(`const ${ceilingConstant.name} = (\\d+);`, 'u').exec(gitShow(sourceRevision, ceilingConstant.file))?.[1];
  if (!fromRoadmap || fromRoadmap !== fromTest) fail('P2_1_CEILING_MISMATCH', `the amended row names a ceiling of ${fromRoadmap}; the test at ${sourceRevision} pins ${fromTest}`);
  const suffixClause = 'while a package is a prerelease the budget counts exclude the tokens of its `-rc.N` version suffixes';
  if (!assertion.includes(suffixClause) || rows['E-P2.1-02'].assertion.includes('-rc.N')) fail('P2_1_RC_RULE_MISSING', `the amended row must say "${suffixClause}", and the row at ${sourceRevision} must not`);
  return {
    path: roadmap,
    revision: commits.at(-1),
    commits,
    blob: git('rev-parse', `HEAD:${roadmap}`),
    ceiling: { roadmap: Number(fromRoadmap), test: { file: ceilingConstant.file, constant: ceilingConstant.name, value: Number(fromTest), revision: sourceRevision } },
    prereleaseSuffixes: { clause: suffixClause, pattern: rcSuffix.source },
    rows: { 'E-P2.1-02': amendedRows['E-P2.1-02'] },
  };
}

export async function capture(options, github = createGitHub(), observe = viewPackage) {
  const { route, verification: r1, records: routeRecords, excerpts } = readRoute(options.version, options);
  const outPath = (relative) => join(options.out, relative.slice(root.length + 1));
  const existing = existsSync(outPath(`${root}/verification.json`)) ? JSON.parse(readFileSync(outPath(`${root}/verification.json`), 'utf8')) : null;
  if (!options.evidence && !existing) fail('P2_1_PHASE_ORDER', 'capture --evidence first');
  if (existing && existing.release.version !== options.version) fail('P2_1_VERSION_MISMATCH', `${options.out} holds the ${existing.release.version} capture`);
  const staged = new Map();
  const stage = (relative, text) => {
    assertDisclosable(text, relative);
    staged.set(relative, text);
    return { path: relative, sha256: sha256(text) };
  };
  const verification = existing ?? { schema: 'muxui-evidence-validation-v1', phases: {}, retained: {} };
  // Retained files of an earlier phase must still match their recorded digests.
  for (const ref of Object.values(verification.retained)) {
    if (sha256(readFileSync(outPath(ref.path), 'utf8')) !== ref.sha256) fail('P2_1_RETAINED_CHANGED', `${ref.path} no longer matches its capture digest`);
  }
  verification.proofTool = proofToolIdentity(options.rehearsal);
  if (options.rehearsal) verification.rehearsal = { status: 'rehearsal', note: 'development capture; not release evidence' };
  else if (verification.rehearsal) fail('P2_1_REHEARSAL_ROUTE', 'this route holds a rehearsal capture');

  const { dryRun, publish, registry: observed } = r1.phases;
  const sourceRevision = r1.sourceRevision;
  if (git('rev-parse', `${sourceRevision}^{tree}`) !== r1.sourceTree) fail('P2_1_SOURCE_TREE_MISMATCH', `${sourceRevision} has another tree than the route's ${r1.sourceTree}`);
  if (spawnSync('git', ['merge-base', '--is-ancestor', sourceRevision, options.rehearsal ? 'HEAD' : 'origin/main'], { cwd: repositoryRoot }).status !== 0) {
    fail('P2_1_SOURCE_NOT_DURABLE', `${sourceRevision} is not in ${options.rehearsal ? 'HEAD' : 'origin/main'}'s history`);
  }
  const { portfolio } = dryRun;
  const release = {
    version: options.version,
    route,
    portfolioId: portfolio.id,
    manifestDigest: portfolio.digest,
    sourceRevision,
    packages: portfolio.packages.map(({ name, version, role, integrity, shasum, bytes, files, file }) => ({ name, version, role, file, integrity, shasum, bytes, files })),
    tokenPublished: publish.portfolio.packages.filter(({ authentication }) => authentication === 'temporary npm token (first publish)').map(({ name }) => name),
    dryRun: { runId: dryRun.execution.runId, runAttempt: dryRun.execution.runAttempt, jobId: dryRun.execution.jobId, conclusion: dryRun.execution.conclusion, mode: 'dry-run', preparation: dryRun.preparation.mode },
    publish: { runId: publish.execution.runId, runAttempt: publish.execution.runAttempt, jobId: publish.execution.publish.jobId, conclusion: publish.execution.conclusion, mode: 'publish', environmentApprovals: publish.approvals.length },
    routeRecords,
  };
  if (release.tokenPublished.length === 0) fail('P2_1_NO_TOKEN_PUBLISH', 'no package of the publish run used the first-publish token; the trusted-publisher non-claim has nothing to name');
  verification.release = release;
  verification.sourceRevision = sourceRevision;
  verification.sourceTree = r1.sourceTree;
  verification.captureProcedure = `node ${captureTool} --version=${options.version} --capture-timestamp=<ISO-8601 UTC> [--evidence --after-ci-run=<id>:<attempt> --publish-approval=<text> --publish-approval-date=<YYYY-MM-DD>] [--review=<file> --review-revision=<sha>]`;
  const roadmapText = gitShow(sourceRevision, roadmap);
  verification.roadmap = { path: roadmap, revision: sourceRevision, blob: git('rev-parse', `${sourceRevision}:${roadmap}`) };
  verification.rows = roadmapRows(roadmapText);

  if (options.evidence) {
    const claims = claimsFor(release);
    // Main CI's run, as the dry run reused it, read as that attempt.
    const { mainCi } = dryRun.preparation;
    const ciRun = github.attempt(mainCi.runId, mainCi.runAttempt);
    const ciJobs = github.attemptJobs(mainCi.runId, mainCi.runAttempt);
    if (ciRun.path !== ciWorkflowPath || ciRun.event !== 'push' || ciRun.head_branch !== 'main' || ciRun.head_sha !== sourceRevision || ciRun.status !== 'completed' || ciRun.conclusion !== 'success' || ciRun.run_attempt !== mainCi.runAttempt) {
      fail('P2_1_CI_RUN_INVALID', `run ${mainCi.runId} attempt ${mainCi.runAttempt} is not a successful push CI run on main at ${sourceRevision}`);
    }
    const aggregate = ciJobs.find((job) => job.name === 'check');
    if (aggregate?.conclusion !== 'success') fail('P2_1_CI_RUN_INVALID', `run ${mainCi.runId} did not pass its aggregate check`);
    const groups = { policy: 'run checks-policy', tooling: 'run checks-tooling' };
    const cited = (job) => {
      const titles = new Set();
      let prefixes = [];
      for (const { parts } of Object.values(claims)) {
        for (const item of parts.flatMap(({ evidence }) => evidence)) {
          if (item.kind === 'test' && item.job === job) titles.add(item.title);
          if (item.kind === 'corpus' && item.job === job) prefixes = [...prefixes, item.prefix];
        }
      }
      return { titles, prefixes };
    };
    const jobs = {};
    for (const [key, name] of Object.entries(groups)) {
      const read = readCiJob({ github, jobs: ciJobs, name, group: `checks-${key}`, cites: cited(key) });
      if (read.checkedOut !== sourceRevision) fail('P2_1_CI_JOB_UNBOUND', `job ${name} checked out ${read.checkedOut}, not ${sourceRevision}`);
      const retained = retainCiJob(read, { stage, heading: `# job: ${name} (job ${read.job.id}) of main CI run ${mainCi.runId} attempt ${mainCi.runAttempt}, filtered to the group and commands it ran, the totals each node --test printed, and the passing lines this capture cites` });
      verification.retained[`ci${key}`] = retained.ref;
      const environment = (pattern) => read.lines.map((line) => pattern.exec(content(line))?.[1]).find(Boolean) ?? null;
      jobs[key] = {
        ...retained.phase,
        environmentLines: { node: environment(/Resolved \.node-version as (\S+)/u), runnerImage: environment(/^Image: (\S+)/u) },
        lines: retained.excerptLines,
      };
    }
    // The one test added after the release, from a later pull request run; every other citation stays with the release commit's run.
    const later = readLaterCi({ github, run: options.afterCiRun, sourceRevision, cites: cited('toolingAfter'), stage });
    verification.retained.ciToolingAfter = later.ref;
    const amendment = Object.values(claims).flatMap(({ parts }) => parts.flatMap(({ evidence }) => evidence)).find(({ kind }) => kind === 'roadmap-amendment');
    verification.amendedRoadmap = readAmendedRoadmap({ laterHead: later.head, sourceRevision, rows: verification.rows, ceilingConstant: amendment.ceilingConstant });
    claims['E-P2.1-02'].limits.push(`The installed-catalog tamper test came after the release: it passed in pull request CI run ${later.phase.execution.runId} at head ${later.head}, over a merge whose tree is the head's. The resolver source (packages/tooling/src, packages/catalog/src, packages/schema/src) is unchanged between the release commit and that head. The Roadmap row was amended after the release too, by ${verification.amendedRoadmap.commits.length} commit${verification.amendedRoadmap.commits.length === 1 ? '' : 's'} (${verification.amendedRoadmap.commits.join(', ')}); the release was prepared and published against the earlier wording of the row.`);
    // The released packages, installed from the registry and run through their own muxui bin; the parts that rest on it follow its checks.
    const releaseManifest = JSON.parse(readFileSync(join(repositoryRoot, excerpts.manifest.path), 'utf8'));
    const publishedRun = await observePublishedTuple({ release, manifest: releaseManifest, ceiling: verification.amendedRoadmap.ceiling.roadmap, sourceRevision, captureTimestamp: options.captureTimestamp });
    const publishedOutput = stage(`${root}/validation/published-muxui-output.txt`, publishedRun.output);
    verification.retained.publishedOutput = publishedOutput;
    const published = { ...publishedRun.phase, output: publishedOutput };
    for (const part of claims['E-P2.1-02'].parts) {
      const failed = part.evidence.filter(({ kind }) => kind === 'published').flatMap(({ checks }) => checks).filter((id) => !published.checks.find((found) => found.id === id)?.passed);
      const note = typeof part.note === 'function' ? part.note(published) : part.note;
      Object.assign(part, { note: failed.length > 0 ? `${note ? `${note} ` : ''}Against the published tuple these checks did not pass: ${failed.join(', ')}.` : note, ...(failed.length > 0 ? { state: 'not-met' } : {}) });
    }
    const { toolingVersion } = published;
    claims['E-P2.1-02'].limits.push(`The published-run phase installed the released packages from the public registry at capture time (${options.captureTimestamp}), after the release, not at publish time. Only the four @muxui packages are bound to the release manifest's integrity; their third-party dependencies resolved as the registry then served them. The goldens are not compared to the published output, and the descriptor and catalog tamper negatives are not repeated against the published install.`);
    claims['E-P2.1-02'].limits.push(`Dense budget counts exclude the tokens of \`-rc.N\` version suffixes (the pattern ${published.countRule.pattern}, nothing wider), by the Roadmap row as amended after the release. ${published.rawOverBudget === '' ? 'No raw count exceeds a budget.' : `The published rc exceeded a budget as the row first wrote it: ${published.rawOverBudget}.`} Raw and counted numbers are kept for every fixture and get case; at a stable release the suffix is absent and the two are equal.`);
    if (!toolingVersion.reportsInstalledVersion) {
      const where = toolingVersion.source ? `${toolingVersion.source.path}:${toolingVersion.source.line} (\`${toolingVersion.source.text}\`)` : 'its source';
      claims['E-P2.1-02'].limits.push(`The published @muxui/tooling@${toolingVersion.installed} reports muxuiVersion ${toolingVersion.muxuiVersionInResponses.join(', ')} in the meta of every response and ${toolingVersion.cliVersionInManifest} as the CLI version in its manifest, not its own version, because ${where} hard-codes it. Architecture "Version units and compatibility" says tooling reports the exact tuple in every response, and the goldens normalize the value. A separate change fixes it with tooling's next real release; it is not fixed in this release or here.`);
      claims['E-P2.1-02'].nonClaims = [`This record does not claim that @muxui/tooling@${toolingVersion.installed} reports its own version: it reports ${toolingVersion.muxuiVersionInResponses.join(', ')} (see the limits), where Architecture "Version units and compatibility" says tooling reports the exact tuple. The catalog and renderer versions it reports are the installed ones.`];
    }
    // The registry, read now: every package of the set against the manifest and the publish run.
    const readBack = [];
    for (const entry of release.packages) {
      const { view, attestations, placeholders: documents } = await observe(entry);
      const record = publish.portfolio.packages.find(({ name }) => name === entry.name);
      const first = record.preflight.kind === 'first';
      readBack.push({
        ...bindRegistryPackage({ entry, view, attestations, placeholders: documents, publishRunId: publish.execution.runId, sourceRevision, first, priorLatest: record.preflight.latest }),
        attestationDocument: { url: view.attestations.url, sha256: sha256(canonicalJson(attestations)), retained: false },
      });
    }
    // A version beside the candidate that is no part of the tuple (npm's placeholder): what is observed of it, and when it
    // appeared against the package's publish block. Its origin is an inference; the record says so.
    const stamp = (line) => /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z) /u.exec(line)?.[1] ?? null;
    const mentioned = spawnSync('git', ['grep', '-l', '-e', placeholderVersion, sourceRevision, '--', '.', ':!tests/evidence'], { cwd: repositoryRoot, encoding: 'utf8' });
    if (mentioned.status > 1) fail('P2_1_GIT_GREP_FAILED', mentioned.stderr);
    const placeholders = readBack.flatMap(({ name, version, otherVersions }) => otherVersions.filter((other) => other.version === placeholderVersion).map((other) => {
      const { lines } = excerpts.publishExcerpt;
      const { start: blockStart, end: blockEnd } = publishBlock(lines, `${name}@${version}`);
      const block = lines.slice(blockStart, blockEnd);
      const done = block.findIndex((line) => content(line).startsWith(`Published ${name}@${version} `));
      const processing = block.findIndex((line) => content(line).startsWith('npm notice Your package is being processed'));
      const startedAt = stamp(block[0]);
      const finishedAt = done < 0 ? null : stamp(block[done]);
      return {
        name,
        ...other,
        partOfReleaseTuple: false,
        publishBlock: {
          excerpt: excerpts.publishExcerpt.path,
          startedAt,
          finishedAt,
          placeholderPublishedWithinBlock: Boolean(startedAt && finishedAt) && Date.parse(other.publishedAt) >= Date.parse(startedAt) && Date.parse(other.publishedAt) <= Date.parse(finishedAt),
          processingNotice: processing < 0 ? null : { line: blockStart + processing + 1, text: content(block[processing]) },
        },
      };
    }));
    const manifestText = readFileSync(join(repositoryRoot, excerpts.manifest.path), 'utf8');
    const namedIn = {
      publishLog: [excerpts.publishExcerpt, excerpts.publishPrepareExcerpt].some(({ lines }) => lines.some((line) => line.includes(placeholderVersion))),
      releaseManifest: manifestText.includes(placeholderVersion),
    };
    if (placeholders.length > 0 && (namedIn.publishLog || namedIn.releaseManifest)) fail('P2_1_PLACEHOLDER_NAMED', `the publish log or the release manifest names ${placeholderVersion}`);
    const placeholderOrigin = placeholders.length === 0 ? null : {
      status: 'inferred',
      proved: false,
      inference: 'npm created the placeholder version when it began processing the package\'s first publish',
      basis: `its publish time falls inside that package's block of the publish run, npm printed that the package "is being processed and may take a few minutes to become available", and neither the publish log, the release manifest, nor ${mentioned.status === 1 ? 'any file of the source revision outside tests/evidence' : 'the source revision (except as listed)'} names the version`,
      namedIn,
      sourceRevisionMentions: mentioned.stdout.split('\n').filter(Boolean).map((line) => line.slice(sourceRevision.length + 1)),
    };
    if (placeholders.length > 0) {
      const part = {
        part: 'Observation, not a Roadmap clause: the read-back lists every version the registry holds for each package, so a version outside the release tuple is observed and not mistaken for part of it.',
        state: 'shown',
        note: `${joinNames(placeholders.map(({ name }) => name))} each also list ${placeholderVersion}, described by the registry as "${placeholders[0].description}". It carries no provenance, no dist-tag points at it, and it is no part of the release tuple or its manifest. Its origin is inferred, not proved: ${placeholderOrigin.inference}.`,
        evidence: [{ kind: 'placeholders' }],
      };
      claims['E-P2.1-06'].parts.splice(3, 0, part);
      claims['E-P2.1-06'].limits.push(`Each of ${joinNames(placeholders.map(({ name }) => name))} lists a ${placeholderVersion} placeholder version beside its rc. The publish log names only the rc, and neither the release manifest nor the source revision names the placeholder; it carries no provenance and is not claimed. The registry read-back of the rc is unchanged by it.`);
    }
    const secretCount = github.environmentSecrets();
    const observation = stage(`${root}/artifacts/registry-read-back.json`, canonicalJson({ schema: 'muxui-p2-1-registry-read-back-v1', registry, captureTimestamp: options.captureTimestamp, packages: readBack, placeholderOrigin }));
    verification.retained.registryReadBack = observation;

    // Retained route excerpts, by key, with their lines.
    const logs = { dryRun: excerpts.dryRunExcerpt, publish: excerpts.publishExcerpt, publishPrepare: excerpts.publishPrepareExcerpt };
    logs.dryRunCollect = logs.dryRun;
    const sources = { ...jobs, toolingAfter: { lines: later.excerptLines, group: later.group, excerpt: later.phase.job.excerpt } };
    const resolveItem = (item) => {
      if (item.kind === 'test') {
        const { lines, group, excerpt } = sources[item.job];
        const revision = item.job === 'toolingAfter' ? later.head : sourceRevision;
        const at = lines.findIndex((line) => testLine.exec(content(line))?.[1] === item.title);
        if (!hasTitle(gitShow(revision, item.file), item.title)) fail('P2_1_TEST_NOT_IN_FILE', `${item.file} at ${revision} has no test titled "${item.title}"`);
        return { kind: 'test', job: group, file: item.file, title: item.title, excerpt: excerpt.path, line: at, ...(item.scope ? { scope: item.scope } : {}), ...(item.job === 'toolingAfter' ? { ciRun: later.phase.execution.runId, revision } : {}) };
      }
      if (item.kind === 'roadmap-amendment') {
        const { rows: _rows, ...amended } = verification.amendedRoadmap;
        return { kind: 'roadmap-amendment', id: item.id, ...amended };
      }
      if (item.kind === 'source-absence') return toolingReaderSurface(sourceRevision);
      if (item.kind === 'published') {
        return { kind: 'published', output: published.output, checks: item.checks.map((id) => {
          const found = published.checks.find((candidate) => candidate.id === id);
          return found ?? fail('P2_1_CLAIM_UNKNOWN', `no published-run check ${id}`);
        }) };
      }
      if (item.kind === 'corpus') {
        // Every fixture of the corpus is a test, and each passes.
        const names = execFileSync('git', ['ls-tree', '--name-only', sourceRevision, `${item.fixtures}/`], { cwd: repositoryRoot, encoding: 'utf8' }).split('\n')
          .map((path) => /\/(\d\d-.+)\.json$/u.exec(path)?.[1]).filter(Boolean).sort();
        const { lines } = jobs[item.job];
        const lineOf = names.map((name) => lines.findIndex((line) => testLine.exec(content(line))?.[1] === `${item.prefix}${name}`));
        if (names.length === 0 || lineOf.includes(-1)) fail('P2_1_CI_TEST_MISSING', `the SemVer corpus has ${names.length} fixtures and ${lineOf.filter((at) => at === -1).length} have no passing line`);
        if (!gitShow(sourceRevision, item.file).includes(item.prefix)) fail('P2_1_TEST_NOT_IN_FILE', `${item.file} at ${sourceRevision} has no "${item.prefix}" tests`);
        return { kind: 'corpus', job: jobs[item.job].group, file: item.file, fixtures: item.fixtures, cases: names.length, excerpt: jobs[item.job].excerpt.path, firstLine: Math.min(...lineOf), lastLine: Math.max(...lineOf) };
      }
      if (item.kind === 'log') {
        const source = logs[item.source];
        return { kind: 'log', source: item.source, excerpt: source.path, ...findLine(source.lines, item.pattern, item.source) };
      }
      if (item.kind === 'publish-package') {
        const { lines } = excerpts.publishExcerpt;
        const entry = release.packages.find(({ name }) => name === item.name);
        const label = `${entry.name}@${entry.version}`;
        const { start, end } = publishBlock(lines, label);
        const block = lines.slice(start, end);
        const at = (pattern) => {
          const index = block.findIndex((line) => pattern.test(content(line)));
          if (index < 0) fail('P2_1_LOG_LINE_MISSING', `${label}: no publish line matches ${pattern}`);
          return { line: start + index + 1, text: content(block[index]) };
        };
        const packageRecord = publish.portfolio.packages.find(({ name }) => name === item.name);
        if (packageRecord.state !== 'verified') fail('P2_1_PUBLISH_NOT_VERIFIED', `${label} is ${packageRecord.state} in the publish run`);
        return {
          kind: 'publish-package',
          name: entry.name,
          version: entry.version,
          excerpt: excerpts.publishExcerpt.path,
          authentication: { ...at(/^Authentication for /u), value: packageRecord.authentication },
          readBack: { integrity: at(/^dist\.integrity: /u), provenance: at(/^provenance: /u), distTags: at(/^dist-tags: /u), published: at(/^Published /u), values: packageRecord.readBack },
        };
      }
      if (item.kind === 'read-back') return { kind: 'read-back', artifact: 'the registry read-back of every package (see registryReadBack)' };
      if (item.kind === 'placeholders') return { kind: 'placeholders', artifact: { path: observation.path, sha256: observation.sha256 }, origin: placeholderOrigin, versions: placeholders };
      if (item.kind === 'route') {
        if (item.field === 'portfolio-roles') return { kind: 'route', field: item.field, packages: release.packages.map(({ name, version, role }) => ({ name, version, role })), manifest: { path: excerpts.manifest.path, sha256: excerpts.manifest.sha256, source: JSON.parse(readFileSync(join(repositoryRoot, excerpts.manifest.path), 'utf8')).source } };
        if (item.field === 'react-provenance') {
          return { kind: 'route', field: item.field, artifact: { path: excerpts.registry.path, sha256: excerpts.registry.sha256 }, provenance: observed.provenance.slsa, predicateTypes: observed.provenance.predicateTypes };
        }
        if (item.field === 'rollback') {
          const manifest = JSON.parse(readFileSync(join(repositoryRoot, excerpts.manifest.path), 'utf8'));
          const e04 = JSON.parse(readFileSync(join(repositoryRoot, routeRecords['E-R1-EXIT-04'].path), 'utf8'));
          return { kind: 'route', field: item.field, manifest: { path: excerpts.manifest.path, pointer: '/rollback', value: manifest.rollback }, record: { path: routeRecords['E-R1-EXIT-04'].path, sha256: routeRecords['E-R1-EXIT-04'].sha256, rollbackStatus: e04.rollback.status, latest: e04.distTags.latest } };
        }
      }
      return fail('P2_1_CLAIM_UNKNOWN', JSON.stringify(item));
    };
    verification.coverage = Object.fromEntries(Object.entries(claims).map(([assertionId, { parts, limits, nonClaims: ownNonClaims }]) => [assertionId, {
      parts: parts.map(({ part, state, note, evidence }) => ({ part, state, ...(note ? { note } : {}), evidence: evidence.map(resolveItem) })),
      limits,
      ...(ownNonClaims ? { nonClaims: ownNonClaims } : {}),
    }]));
    // The blob each executed file had at the revision that ran it: the release commit, or the later head for the later test.
    const executedFiles = (assertionId) => [...new Map(Object.values(verification.coverage[assertionId].parts).flatMap(({ evidence }) => evidence.flatMap((item) => (item.file ? [{ path: item.file, ...(item.revision ? { revision: item.revision } : {}) }] : [])))
      .map((entry) => [`${entry.path}@${entry.revision ?? sourceRevision}`, entry])).entries()].sort(([left], [right]) => (left < right ? -1 : 1)).map(([, entry]) => entry);
    verification.executedProofTools = Object.fromEntries(assertionIds.map((assertionId) => [assertionId, executedFiles(assertionId).map(({ path, revision }) => ({ path, blob: git('rev-parse', `${revision ?? sourceRevision}:${path}`), ...(revision ? { revision } : {}) }))]));
    // The dry run's own preparation tool, as its manifest records it, is what ran the release checks.
    const preparationTool = JSON.parse(readFileSync(join(repositoryRoot, excerpts.manifest.path), 'utf8')).preparation?.tool;
    if (preparationTool) {
      if (sha256(gitShow(sourceRevision, preparationTool.path)) !== preparationTool.sha256) fail('P2_1_PREPARATION_TOOL_MISMATCH', `${preparationTool.path} at ${sourceRevision} is not the tool the dry run recorded`);
      verification.preparationTool = preparationTool;
    }
    for (const id of assertionIds) verification.executedProofTools[id].push(...(preparationTool ? [{ path: preparationTool.path, blob: git('rev-parse', `${sourceRevision}:${preparationTool.path}`) }] : []));
    verification.commands = [
      ...Object.values(jobs).flatMap(({ job, commands }) => commands.filter((command) => /^pnpm --filter @muxui\//u.test(command)).map((command) => `${job}: ${command}`)),
      'npm-publish.yml dry run (main CI reused): pnpm generate && pnpm generate:check && node tooling/audits/repository-policy/src/release-prepare.mjs',
      'npm-publish.yml mode=publish: promote the dry run\'s npm-candidate artifact, then publish the set in order (npm-publication.mjs publish-set)',
      `published tuple (E-P2.1-02): ${published.tools.install} in a clean project, then the installed muxui bin`,
    ];
    for (const job of Object.values(jobs)) delete job.lines;

    verification.phases = {
      ...verification.phases,
      captureTimestamp: options.captureTimestamp,
      ci: {
        execution: { repository, workflowPath: ciRun.path, event: ciRun.event, headBranch: ciRun.head_branch, runId: ciRun.id, runAttempt: ciRun.run_attempt, headRevision: ciRun.head_sha, startedAt: ciRun.run_started_at, conclusion: ciRun.conclusion, aggregateCheck: { jobId: aggregate.id, conclusion: aggregate.conclusion } },
        jobs,
        later: later.phase,
        environment: { runnerImage: jobs.policy.environmentLines.runnerImage, node: jobs.policy.environmentLines.node, preparation: dryRun.environment },
      },
      published,
      registry: {
        captureTimestamp: options.captureTimestamp,
        readBack: { artifact: observation, packages: readBack.map(({ name, version, integrity, distTags, provenance, latest, otherVersions }) => ({ name, version, integrity, distTags, provenance: provenance.predicateType, latest, otherVersions })) },
        placeholders,
        placeholderOrigin,
        githubEnvironment: { environment: environmentName, secretCount: secretCount, observedAt: options.captureTimestamp, note: 'the temporary first-publish token\'s environment secret; revocation of the token on npm is not observable from here' },
      },
      approval: {
        statement: options.approval,
        date: options.approvalDate,
        source: 'reported to the capture operator; not observable from hosted data',
        environmentApproval: 'none required (Decision 0033); the publish run\'s approvals list is empty',
        approvalsRecordedByThePublishRun: publish.approvals,
      },
    };
    for (const job of Object.values(verification.phases.ci.jobs)) delete job.environmentLines;
  }

  if (options.review) {
    const bound = bindReview({ text: readFileSync(options.review, 'utf8'), reviewedRevision: options.reviewRevision, sourceRevision });
    const { text, ...rest } = bound;
    if (verification.retained.review?.path !== reviewPath) delete verification.retained.review;
    verification.retained.review = stage(reviewPath, text);
    verification.phases.review = { ...rest, captureTimestamp: options.captureTimestamp };
  }

  // Everything is rebuilt from verification.json; the old excerpts a phase replaced are removed.
  for (const [relative, text] of assembleRoute(verification)) staged.set(relative, text);
  for (const ref of [...JSON.parse(staged.get(`${root}/index.json`)).artifacts, ...JSON.parse(staged.get(`${root}/index.json`)).records, JSON.parse(staged.get(`${root}/index.json`)).validation]) {
    const text = staged.get(ref.path) ?? readFileSync(outPath(ref.path), 'utf8');
    if (sha256(text) !== ref.sha256) fail('P2_1_DIGEST_INCONSISTENT', `${ref.path} does not match its staged digest`);
  }
  replaceRoute(options.out, staged);
  return { out: options.out, records: assertionIds, outcomes: Object.fromEntries(assertionIds.map((id) => [id, outcomeOf(verification.coverage[id].parts)])) };
}

/** Writes `files` (by repository path) into `out`, keeping what is there that they do not replace, or leaves `out` untouched on failure. */
function replaceRoute(out, files) {
  const parent = dirname(out);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, `.${posix.basename(out)}.staging-`));
  const previous = `${staging}.previous`;
  try {
    if (existsSync(out)) {
      spawnSync('cp', ['-R', `${out}/.`, staging]);
    }
    for (const [relative, text] of files) {
      const target = join(staging, relative.slice(root.length + 1));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    if (existsSync(out)) renameSync(out, previous);
    renameSync(staging, out);
    rmSync(previous, { recursive: true, force: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await capture(parseArguments(process.argv.slice(2)));
    console.log(`[p2.1] wrote ${result.records.map((id) => `${id} ${result.outcomes[id]}`).join(', ')} to ${relative(repositoryRoot, result.out) || result.out}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
