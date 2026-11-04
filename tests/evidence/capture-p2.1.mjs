// Roadmap "P2.1 Public package graph and portfolio release": retain E-P2.1-01 to E-P2.1-06 for the first portfolio
// release (@muxui/schema, @muxui/catalog, @muxui/tooling, and @muxui/react), published through
// .github/workflows/npm-publish.yml and already retained as the R1 exit route of its React candidate.
//
//   node tests/evidence/capture-p2.1.mjs --version=<0.1.0-rc.N> --capture-timestamp=<ISO-8601 UTC> <phase>...
//
// The records bind to what already ran; nothing is rerun. The R1 exit route of the candidate
// (tests/evidence/r1-exit-<version>) names the main CI run, the dry run, and the publish run, and is read, not recaptured.
//
//   --evidence             main CI's jobs for the release commit (sanitized excerpts of the tests this capture cites),
//                          a read-only registry read-back of every package of the set, and the npm-publish
//                          environment's secret count. Needs read access to GitHub and the registry.
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
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
// `not-met` (the retained lines show the clause is not met as written), or `not-shown` (nothing retained addresses it).
// A record passes only when every part is shown. Evidence is resolved against the retained excerpts at capture, and
// capture fails when a cited test or line is not there, so a citation never outlives the log it names.

const policy = 'tooling/audits/repository-policy/test';
const tooling = 'packages/tooling/test';
const test = (job, file, title) => ({ kind: 'test', job, file, title });
const logLine = (source, pattern) => ({ kind: 'log', source, pattern });
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
          evidence: [
            test('tooling', packedCli, 'E-P2.1-02 the muxui bin and every package it reads are the installed tarballs'),
            test('tooling', packedCli, 'E-P2.1-02 list, search, and get discover and retrieve the installed React tuple'),
          ],
        },
        {
          part: 'Golden human, JSON, and dense output for the discovery baseline, and the three renderings normalize to the same response as the catalog API.',
          state: 'shown',
          evidence: [
            test('tooling', packedCli, 'E-P2.1-02 discovery output matches the packed goldens in human, JSON, and dense modes'),
            test('tooling', packedCli, 'E-P2.1-02 human, JSON, and dense output normalize to the catalog API response'),
          ],
        },
        {
          part: 'Dense output is inside its token budget.',
          state: 'not-met',
          note: 'The test passes, but it holds `get muxui:component:button --platform web.react --detail full` to a pinned regression ceiling of 3072 tokens, not to the 2048 the command registry sets for `get` at full detail; the test and its comment say that this case exceeds the registry budget (the comment gives 2797 tokens). The registry\'s own budget fixtures, and `get --platform web.react` at brief and compact, are inside their budgets. The Roadmap names the token budget and no other ceiling; Andrew\'s choice of the ceiling is recorded only in the body of pull request 418, in no decision or Roadmap text. The retained log shows that the test passed, not the measured count.',
          evidence: [test('tooling', packedCli, 'E-P2.1-02 dense output stays inside every locked token budget')],
        },
        {
          part: 'An invalid request returns a structured error with a stable code and a read-only nextCommand, and each capability P2.1 does not enable is explicitly unavailable in the manifest.',
          state: 'shown',
          evidence: [
            test('tooling', packedCli, 'E-P2.1-02 invalid requests return structured errors with stable codes and a read-only nextCommand'),
            test('tooling', packedCli, 'E-P2.1-02 the manifest reports the commands P2.1 does not enable as unavailable'),
          ],
        },
        {
          part: 'A descriptor the resolver rejects makes get fail with its typed error.',
          state: 'shown',
          evidence: [test('tooling', packedCli, 'E-P2.1-02 an installed descriptor the resolver rejects makes get fail with MUXUI_CATALOG_INCOMPATIBLE')],
        },
        {
          part: 'SCOPE-TRUST-CACHE-PROVENANCE: the resolver rejects catalog bytes whose integrity or provenance sidecar does not match, with MUXUI_CATALOG_INTEGRITY_MISMATCH.',
          state: 'limited',
          note: 'These tests reject a changed provenance value in the resolver corpus, a changed byte in an explicit cache copy, and an installed catalog package whose identity or bundle is superseded or malformed. None changes a catalog byte inside the packed-tuple install the muxui binary reads: the packed test edits only the React descriptor.',
          evidence: [
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
        'The packed muxui binary runs against the tuple the test packs itself with `pnpm pack` from the checkout at the release commit, at the source manifests\' versions. It does not run against the rc tarballs this release published; those are checked by the pack audit, the set install and entry imports, and the descriptor audit, and release preparation does not run the muxui binary against them.',
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
          state: 'limited',
          note: 'No test titled for this assertion exercises hosted or latest data, and P2.1 reads none. The nearest retained assertion is that a response read from the catalog package bundled with tooling, with no installed project, is labelled `authority: advisory` and `compatibility: unresolved`, where the packed install is labelled installed-local.',
          evidence: [test('tooling', `${tooling}/cli.test.mjs`, 'E-G0.3-02 human, JSON, and dense projections preserve one response object')],
        },
      ],
      limits: [],
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
  { scopeId: 'SCOPE-QUALITY-PERFORMANCE', owner: 'not P2.1', note: 'P2 exit owns the Productization policy; P2.1 keeps the dense-output token budget of E-P2.1-02 (its fourth part)' },
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

/** The outcome of a record: pass only when every part is shown. */
export const outcomeOf = (parts) => (parts.every(({ state }) => state === 'shown') ? 'pass' : parts.some(({ state }) => state === 'shown') ? 'partial' : 'unmet');

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
    const { parts, limits } = coverage[assertionId];
    const outcome = outcomeOf(parts);
    const row = rows[assertionId];
    return [assertionId, canonicalJson({
      schema: 'muxui-evidence-record-v1',
      assertionId,
      milestone: 'P2.1',
      evidenceKind: 'retained-ci-and-release-run-capture',
      basis: `${assertionId} under the Roadmap P2.1 acceptance table, Decision 0032, and the P2.1 activation packet`,
      assertion: row.assertion,
      requiredEvidence: row.requiredEvidence,
      roadmap: verification.roadmap,
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
      execution: { mainCi: phases.ci.execution, ci: phases.ci.jobs, dryRun: release.dryRun, publish: release.publish },
      environment: phases.ci.environment,
      release: { version: release.version, route: release.route, portfolioId: release.portfolioId, manifestDigest: release.manifestDigest, packages: release.packages },
      registryReadBack: phases.registry.readBack,
      ...(assertionId === 'E-P2.1-06' ? { publishApproval: phases.approval, githubEnvironment: phases.registry.githubEnvironment, route: release.routeRecords } : {}),
      crossCutting: crossCuttingOf(coverage),
      nonClaims: nonClaims(verification),
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
  return `# P2.1 retained evidence for the first portfolio release

Roadmap "P2.1 Public package graph and portfolio release" requires \`E-P2.1-01\` to
\`E-P2.1-06\`. This root retains them for the portfolio of release
\`${release.portfolioId}\` (${release.packages.map(({ name, version }) => `\`${name}@${version}\``).join(', ')}), prepared and published from
\`${verification.sourceRevision}\` (tree \`${verification.sourceTree}\`), captured by
\`node ${captureTool} --version=${release.version}\`.

Nothing is rerun. Each record binds to what already ran at that commit: main CI run
${verification.phases.ci.execution.runId} (attempt ${verification.phases.ci.execution.runAttempt}), dry run ${release.dryRun.runId}, and publish run ${release.publish.runId}. The React candidate's
R1 exit route \`${release.route}\` holds the dry run and publish excerpts and the React
registry observation, and this root cites them by path and digest.

| Record | Outcome |
| --- | --- |
${parsed.map((record) => `| \`${record.assertionId}\` | \`${record.outcome}\` |`).join('\n')}

${parsed.filter((record) => record.outcome !== 'pass').map((record) => `\`${record.assertionId}\` is \`${record.outcome}\` because ${record.parts.filter(({ state }) => state !== 'shown').map(({ state, part }) => `\`${state}\`: ${part}`).join(' ')}`).join('\n\n')}

Each record's \`parts\` splits the Roadmap assertion into clauses and gives each a state:
\`shown\`, \`limited\` (a narrower or indirect form, with a note), \`not-met\`, or \`not-shown\`.
A record is \`pass\` only when every part is shown, and \`partial\` otherwise. A cited test
is a passing line in the sanitized excerpt of the CI job that ran it, at the release
commit; capture fails if a cited line is missing. \`limits\` lists what the retained
evidence does not show.

\`artifacts/\` holds the registry read-back of all four packages${review ? ' and the independent review' : ''}; \`validation/\` holds the CI job
excerpts; \`verification.json\` binds them to the unsanitized log digests. The raw logs and
tarballs are not retained.

${review
    ? `The independent release-integrity review is retained as \`${review.artifact.path}\`, read by ${review.reviewer} at \`${review.reviewedRevision}\`. It is ${review.passes ? 'a pass' : 'not a pass'}.`
    : `The independent release-integrity review is pending: a reviewer of a different model and harness from the authoring agents reviews the evidence and the release, and \`--review=<file> --review-revision=<sha>\` retains it and rebuilds the records with it.`}

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
    log: (jobId) => gh('api', '--allow-escape-sequences', `repos/${repository}/actions/jobs/${jobId}/logs`),
    environmentSecrets: () => json(`repos/${repository}/environments/${environmentName}/secrets`).total_count,
  };
}

/** Read-only `npm view` of a package, with empty user and global npm config so no host credential or override reaches it. */
async function viewPackage({ name, version }) {
  const temp = mkdtempSync(join(tmpdir(), 'muxui-p2-1-registry-'));
  try {
    const userConfig = join(temp, 'empty-userconfig');
    const globalConfig = join(temp, 'empty-globalconfig');
    writeFileSync(userConfig, '');
    writeFileSync(globalConfig, '');
    const env = isolatedPackageManagerEnvironment(process.env, { userConfig, globalConfig });
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
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
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
  verification.captureProcedure = `node ${captureTool} --version=${options.version} --capture-timestamp=<ISO-8601 UTC> [--evidence --publish-approval=<text> --publish-approval-date=<YYYY-MM-DD>] [--review=<file> --review-revision=<sha>]`;
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
      const job = ciJobs.find((candidate) => candidate.name === name);
      if (job?.conclusion !== 'success') fail('P2_1_CI_RUN_INVALID', `job ${name} of run ${mainCi.runId} did not succeed`);
      // A job that reused an earlier pass ran no tests; its steps would be skipped otherwise.
      if (job.steps?.find((step) => step.name === 'Reuse earlier pass')?.conclusion !== 'skipped') fail('P2_1_CI_JOB_REUSED', `job ${name} reused an earlier pass, so it ran no tests`);
      const raw = github.log(job.id);
      const lines = raw.split('\n');
      const group = key === 'policy' ? 'checks-policy' : 'checks-tooling';
      if (!lines.some((line) => content(line).startsWith(`[ci-impact] running group ${group} `))) fail('P2_1_CI_JOB_UNBOUND', `job ${name} did not run group ${group}`);
      const revision = lines.map((line, at) => (content(line).includes('git log -1 --format=%H') ? content(lines[at + 1] ?? '').trim() : null)).find(Boolean);
      if (revision !== sourceRevision) fail('P2_1_CI_JOB_UNBOUND', `job ${name} checked out ${revision}, not ${sourceRevision}`);
      const { kept, totals } = ciExcerpt(raw, cited(key));
      const text = `${[`# job: ${name} (job ${job.id}) of main CI run ${mainCi.runId} attempt ${mainCi.runAttempt}, filtered to the group and commands it ran, the totals each node --test printed, and the passing lines this capture cites`, ...kept.map(({ text: line }) => line)].join('\n')}\n`;
      const ref = stage(`${root}/validation/${group}-${job.id}.txt`, text);
      verification.retained[`ci${key}`] = ref;
      const environment = (pattern) => lines.map((line) => pattern.exec(content(line))?.[1]).find(Boolean) ?? null;
      jobs[key] = {
        jobId: job.id,
        job: name,
        group,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        commands: lines.map((line) => /^\[ci-impact\] command: (.+)$/u.exec(content(line))?.[1]).filter(Boolean).map(sanitize),
        testTotals: totals,
        rawLog: { bytes: Buffer.byteLength(raw), lines: lines.length, sha256: sha256(raw), retained: false },
        excerpt: { ...ref, rawLines: kept.map(({ raw: at }) => at) },
        environmentLines: { node: environment(/Resolved \.node-version as (\S+)/u), runnerImage: environment(/^Image: (\S+)/u) },
      };
      jobs[key].lines = [''].concat(text.split('\n').slice(0, -1));
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
    const resolveItem = (item) => {
      if (item.kind === 'test') {
        const { lines } = jobs[item.job];
        const at = lines.findIndex((line) => testLine.exec(content(line))?.[1] === item.title);
        const source = gitShow(sourceRevision, item.file);
        if (!hasTitle(source, item.title)) fail('P2_1_TEST_NOT_IN_FILE', `${item.file} at ${sourceRevision} has no test titled "${item.title}"`);
        return { kind: 'test', job: jobs[item.job].group, file: item.file, title: item.title, excerpt: jobs[item.job].excerpt.path, line: at };
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
    verification.coverage = Object.fromEntries(Object.entries(claims).map(([assertionId, { parts, limits }]) => [assertionId, {
      parts: parts.map(({ part, state, note, evidence }) => ({ part, state, ...(note ? { note } : {}), evidence: evidence.map(resolveItem) })),
      limits,
    }]));
    const executedFiles = (assertionId) => [...new Set(Object.values(verification.coverage[assertionId].parts).flatMap(({ evidence }) => evidence.flatMap((item) => (item.file ? [item.file] : []))))].sort();
    verification.executedProofTools = Object.fromEntries(assertionIds.map((assertionId) => [assertionId, executedFiles(assertionId).map((path) => ({ path, blob: git('rev-parse', `${sourceRevision}:${path}`) }))]));
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
    ];
    for (const job of Object.values(jobs)) delete job.lines;

    verification.phases = {
      ...verification.phases,
      captureTimestamp: options.captureTimestamp,
      ci: {
        execution: { repository, workflowPath: ciRun.path, event: ciRun.event, headBranch: ciRun.head_branch, runId: ciRun.id, runAttempt: ciRun.run_attempt, headRevision: ciRun.head_sha, startedAt: ciRun.run_started_at, conclusion: ciRun.conclusion, aggregateCheck: { jobId: aggregate.id, conclusion: aggregate.conclusion } },
        jobs,
        environment: { runnerImage: jobs.policy.environmentLines.runnerImage, node: jobs.policy.environmentLines.node, preparation: dryRun.environment },
      },
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
