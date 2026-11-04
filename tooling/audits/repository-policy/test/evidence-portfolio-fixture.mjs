// A hosted portfolio release as the capture tool reads it (Decision 0032): the candidate artifact of a dry run (one tarball
// per package of the publish set and the portfolio manifest), the dry run's prepare-job log, a publish run's prepare and publish
// job logs, and the GitHub run and job records around them. The artifact is built by the release manifest builder, and the
// publish job log is what npm-publication.mjs really prints against the registry fake, so the fixture cannot drift from the
// workflow's own output.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import * as npm from '../src/npm-publication.mjs';
import { PORTFOLIO_MANIFEST_FILE, tarballFileName } from '../src/release-set.mjs';
import { readCandidate } from '../../../../tests/evidence/capture-r1-exit.mjs';
import { createRegistry } from './registry-fake.mjs';
import { artifactsOf, commit, firstReleaseFixture, manifestOf, publishSet, secondCommit, secondTree, successorFixture, tree, tupleFixture } from './release-tuple-fixture.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'muxui-portfolio-capture-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

export const names = publishSet.packages.map(({ name }) => name);
export const [schema, catalog, tooling, react] = names;
export const head = commit;
export const sourceTree = tree;
const publishScript = 'tooling/audits/repository-policy/src/npm-publication.mjs';
const lineageScript = 'tooling/audits/repository-policy/src/release-lineage.mjs';

const at = (index) => `2026-11-02T07:48:${String(index % 60).padStart(2, '0')}.0000000Z`;
const log = (lines) => lines.map((line, index) => `${at(index)} ${line}`).join('\n');
const script = (line) => `\u001b[36;1m${line}\u001b[0m`;
// One workflow step as the runner echoes it: its group, the script, the job-level environment, then its output.
const step = (command, env = {}, ...output) => [
  `##[group]Run ${command}`, script(command), 'shell: /usr/bin/bash -e {0}', 'env:', ...Object.entries(env).map(([key, value]) => `  ${key}: ${value}`), '##[endgroup]', ...output,
];

const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex');
// npm abbreviates the integrity in its publish notice.
const abbreviate = (integrity) => `${integrity.slice(0, 20)}[...]${integrity.slice(-15)}`;

let sequence = 0;
/**
 * The portfolio release `versions` names on `head`. `react` edits the React package's manifest before it is packed,
 * and `preparation` is what the dry run recorded about its checks. `reuse` names the packages a later release reuses from
 * the first one: the candidate then holds the tarballs of the others, and the registry holds the reused ones. `legacy` writes the
 * lines the workflow printed before packages could be reused (a React-only tarball-sha512 and the React-only prepared and promoted
 * lines), which a retained run keeps. The candidate files are written once into a directory the fixture removes at the end of
 * the test run.
 */
export function portfolioFixture({ versions = {}, react: editReact, preparation, reuse = [], legacy = false } = {}) {
  const first = reuse.length > 0 ? firstReleaseFixture() : null;
  const head = first ? secondCommit : commit;
  const sourceTree = first ? secondTree : tree;
  const publishedNames = names.filter((name) => !reuse.includes(name));
  const editStyles = (files) => {
    // The registry's packed React exports its stylesheet, as the real package does.
    files[react]['package.json'].exports['./styles.css'] = './generated/styles.css';
    editReact?.(files[react]);
  };
  let tuple;
  let artifacts;
  let successor;
  if (first) {
    successor = successorFixture({ first, published: publishedNames, versions, revision: head, edit: (built) => editStyles(built.files) });
    ({ tuple, artifacts } = successor);
  } else {
    tuple = tupleFixture({ versions });
    editStyles(tuple.files);
    artifacts = artifactsOf(tuple);
  }
  const recorded = preparation ?? {
    mode: 'main-ci-reused',
    mainCi: { runId: 4242, runAttempt: 1 },
    tool: { path: 'tooling/audits/repository-policy/src/release-prepare.mjs', sha256: `sha256:${'c'.repeat(64)}` },
    verification: {
      reactOnlineMatrix: [{ packageManager: 'pnpm', version: '10.33.0', tiptapCore: '3.0.0', runtimePackages: 40 }],
      publishSetConsumer: { packageManager: 'pnpm', entriesImported: 8, entriesResolved: 1 },
      warnings: { duplicateDependencyVersions: [] },
    },
  };
  const manifest = successor
    ? manifestOf(artifacts, { reused: successor.reused, source: { revision: head, tree: sourceTree }, preparation: recorded })
    : manifestOf(artifacts, { preparation: recorded });
  const directory = join(scratch, `candidate-${sequence += 1}`);
  mkdirSync(directory);
  for (const name of publishedNames) writeFileSync(join(directory, tarballFileName(name, tuple.versions[name])), artifacts.get(name));
  writeFileSync(join(directory, PORTFOLIO_MANIFEST_FILE), `${JSON.stringify(manifest)}\n`);
  const versionOf = (name) => tuple.versions[name];
  const integrityOf = (name) => manifest.packages.find((record) => record.name === name).integrity;
  const versionsText = names.map((name) => `${name}=${reuse.includes(name) ? '' : versionOf(name)}`).join(',');
  const published = publishedNames.map((name) => `${name}@${versionOf(name)} ${integrityOf(name)}`).join(', ');
  // The tarball-sha512 input: the integrity of each published tarball, or before packages could be reused the React digest alone.
  const authorization = legacy ? integrityOf(react) : publishedNames.map(integrityOf).join(',');
  const setLine = names.map((name) => `${name}@${versionOf(name)}`).join(', ');
  const preparedLine = `Prepared candidate set ${setLine}; release manifest ${manifest.digest}; ${legacy ? `${react} ${integrityOf(react)}` : `published ${published}`}`;
  const reactVersion = versionOf(react);
  const artifactDigest = `sha256:${'a'.repeat(64)}`;

  // The dry run's prepare job: main CI proof, preparation, the rehearsed publish of every package, and the set's own check.
  const dryRunLog = ({ rehearsed = publishedNames } = {}) => log([
    "Current runner version: '2.337.0'",
    '##[group]Run actions/checkout@v4',
    '[command]/usr/bin/git log -1 --format=%H',
    head,
    ...step(`node ${lineageScript} main-ci`, {}, 'Main CI proof: reusing run 4242 attempt 1 (https://github.com/ndrewtran/muxui/actions/runs/4242); running generate:check and release-prepare.mjs instead of the full check graph'),
    ...step('pnpm release:prepare 2>&1 | tee "$RUNNER_TEMP/release-prepare.log"', {},
      'unrelated check output',
      `P2.1 packed and audited ${publishedNames.filter((name) => name !== react).map((name) => `${name}@${versionOf(name)}`).join(', ') || 'no support package'}`,
      `R1 exit release preparation passed for ${names.map((name) => `${name}@${versionOf(name)}`).join(', ')}; the sources remain private and unpublished.`),
    ...step('source_dir=$(sed -n \'s/^R1 exit artifacts written to //p\' "$RUNNER_TEMP/release-prepare.log" | tail -n 1)', {},
      `Candidate ${names.map((name) => `${name}@${versionOf(name)}`).join(' ')}`),
    ...step('npm publish "$CANDIDATE_DIR/$file" --tag next --provenance --access public --dry-run', {}, ...rehearsed.map((name) => `+ ${name}@${versionOf(name)}`)),
    ...step(`node ${lineageScript} prepared`, { MUXUI_RELEASE_VERSIONS: versionsText, EXPECTED_SHA512: '' }, preparedLine),
    '##[group]Run actions/upload-artifact@v4',
    '##[endgroup]',
    'Post job cleanup.',
  ]);

  const artifactId = 9;
  const promotedLog = ({ dryRunId = 1, attempt = 1, integrity = integrityOf(react) } = {}) => log([
    '##[group]Run actions/checkout@v4',
    '[command]/usr/bin/git log -1 --format=%H',
    head,
    ...step(`node ${lineageScript} dry-run`, { DRY_RUN_ID: dryRunId },
      `Dry run ${dryRunId} attempt ${attempt} succeeded at ${head}; npm-candidate artifact ${artifactId} (4096 bytes, ${artifactDigest})`),
    ...step(`node ${lineageScript} fetch-candidate`, {}, `Fetched npm-candidate artifact ${artifactId} (4096 bytes, ${artifactDigest}) from dry run ${dryRunId} attempt ${attempt}`),
    ...step(`node ${lineageScript} candidate`, { EXPECTED_SHA512: authorization },
      legacy
        ? `Promoted candidate ${reactVersion} ${integrity} from dry run ${dryRunId} attempt ${attempt}`
        : `Promoted candidate ${published.replace(integrityOf(react), integrity)} from dry run ${dryRunId} attempt ${attempt}`,
      ...(reuse.length > 0 ? [`Reused, not published: ${reuse.map((name) => `${name}@${versionOf(name)} ${integrityOf(name)}`).join(', ')}`] : []),
      'Dry run preparation: reused main CI run 4242 attempt 1'),
    ...step('source_dir=$PROMOTED_DIR', {}),
    'Post job cleanup.',
  ]);

  /**
   * The publish job's log: the lines npm-publication.mjs prints against a registry holding @muxui/react's history, and the
   * notices npm adds. `faults` fail one package (see registry-fake.mjs); `credential` leaves a registry token (NODE_AUTH_TOKEN, or the named variable) in the job outside the publish step.
   */
  async function publishLog({ faults = {}, credential = false, expected = authorization, versionsEnvironment = versionsText } = {}) {
    // @muxui/react has its history up to the rc before this release's; a reused package is on the registry as its release published it.
    const reactRc = Number(/rc\.(\d+)$/u.exec(reactVersion)[1]);
    const registry = createRegistry({
      seed: {
        [react]: { versions: Object.fromEntries(Array.from({ length: reactRc - 1 }, (_, index) => [`0.1.0-rc.${index + 1}`, `sha512-${String(index + 1).repeat(86)}==`])), tags: { latest: '0.1.0-rc.1', next: `0.1.0-rc.${reactRc - 1}` } },
        ...Object.fromEntries(reuse.map((name) => [name, { versions: { '0.0.0-stage': `sha512-${'s'.repeat(86)}==` }, tarballs: { [versionOf(name)]: artifacts.get(name) }, tags: { latest: versionOf(name), next: versionOf(name) } }])),
      },
      faults,
    });
    const environment = { GITHUB_SHA: head, CANDIDATE_DIR: directory, MUXUI_RELEASE_VERSIONS: versionsText, EXPECTED_SHA512: publishedNames.map(integrityOf).join(','), RUNNER_TEMP: scratch, NPM_TOKEN: 'npm_fixture_first_publish_token' };
    const verified = [];
    const published = [];
    let logIndex = 0;
    const io = {
      ...registry.io(),
      publish: async (pkg, auth) => {
        const { bytes } = packagesByName.get(pkg.name);
        published.push(`npm notice shasum: ${sha1(bytes)}`, `npm notice integrity: ${abbreviate(pkg.integrity)}`,
          `npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=${logIndex += 1}`);
        try {
          await registry.publish(pkg, auth);
        } catch (error) {
          published.push(...error.message.split('\n'));
          throw error;
        }
        published.push(`+ ${pkg.name}@${pkg.version}`);
      },
    };
    await npm.main('verify-candidate', environment, { ...io, log: (line) => verified.push(line) });
    try {
      await npm.main('publish-set', environment, { ...io, log: (line) => published.push(line) });
    } catch (error) {
      published.push(`##[error]${error.message}`);
    }
    const header = { CANDIDATE_DIR: '<runner-temp>/npm-candidate', EXPECTED_SHA512: expected, MUXUI_RELEASE_VERSIONS: versionsEnvironment };
    // GitHub masks the secret in the step header; only the publish step has it.
    const publishHeader = { ...header, NPM_TOKEN: '***' };
    return log([
      '##[group]Run actions/checkout@v4',
      ...step(`node ${publishScript} check-npm`, {}, 'npm 11.17.0 supports trusted publishing (>= 11.5.1).'),
      '##[group]Run actions/download-artifact@v4',
      ...step(`node ${publishScript} verify-candidate`, { ...header, ...(credential ? { [credential === true ? 'NODE_AUTH_TOKEN' : credential]: '***' } : {}) }, ...verified),
      ...step(`node ${publishScript} publish-set`, publishHeader, ...published),
      'Post job cleanup.',
    ]);
  }

  // The same reader the capture uses, so a layout the tool cannot read fails here.
  const candidate = readCandidate(directory);
  const packagesByName = new Map(candidate.packages.map((entry, index) => [publishedNames[index], entry]));

  const run = (id, overrides = {}) => ({
    id, name: 'npm publish', path: '.github/workflows/npm-publish.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
    head_branch: 'main', head_sha: head, run_attempt: 1, run_started_at: '2026-11-02T07:34:16Z', ...overrides,
  });
  const job = (id, name, steps = [], conclusion = 'success') => ({ id, name, conclusion, started_at: '2026-11-02T07:34:21Z', completed_at: '2026-11-02T07:48:33Z', steps });
  const stepRecord = (name, conclusion = 'success') => ({ name, conclusion, completed_at: '2026-11-02T13:05:34Z' });
  const dryRunJobs = (id = 11) => [
    job(id, 'prepare', ['Find main CI proof', 'Prepare release candidate', 'Collect candidate', 'Rehearse npm publish (dry run)', 'Check candidate against inputs', 'Upload candidate'].map((name) => stepRecord(name)).concat(stepRecord('Verify dry run', 'skipped'))),
    job(id + 1, 'publish', [], 'skipped'),
  ];
  const publishRunJobs = ({ publishOutcome = 'success', base = 20 } = {}) => [
    job(base + 1, 'prepare', ['Verify dry run', 'Fetch dry-run candidate', 'Verify promoted candidate'].map((name) => stepRecord(name))),
    job(base + 2, 'publish', [stepRecord('Re-verify candidate'), stepRecord('Publish the set in order', publishOutcome)], publishOutcome),
  ];
  const mainCiRun = (overrides = {}) => ({ id: 4242, run_attempt: 1, path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: head, status: 'completed', conclusion: 'success', run_started_at: '2026-11-02T07:00:00Z', ...overrides });
  const checkJob = () => ({ id: 77, name: 'check', conclusion: 'success', run_attempt: 1, completed_at: '2026-11-02T07:20:00Z' });
  const candidateArtifacts = (overrides = {}) => [{ id: artifactId, name: 'npm-candidate', expired: false, size_in_bytes: 4096, digest: artifactDigest, workflow_run: { id: 1, head_sha: head }, ...overrides }];
  const dryRunInput = (overrides = {}) => ({
    run: run(1), jobs: dryRunJobs(), prepareLog: dryRunLog(), artifact: candidate, sourceTree, mainCi: { run: mainCiRun(), jobs: [checkJob()] }, artifacts: candidateArtifacts(), ...overrides,
  });

  return {
    head, tree: sourceTree, directory, manifest, candidate, versionOf, integrityOf, versionsText, reactVersion, artifactDigest, packages: manifest.packages, authorization,
    dryRunLog, promotedLog, publishLog, run, job, stepRecord, dryRunJobs, publishRunJobs, mainCiRun, checkJob, candidateArtifacts, dryRunInput,
    /** The candidate as the artifact download hands it over, for a mocked GitHub. */
    download: (target) => {
      for (const name of publishedNames) writeFileSync(join(target, tarballFileName(name, versionOf(name))), artifacts.get(name));
      writeFileSync(join(target, PORTFOLIO_MANIFEST_FILE), `${JSON.stringify(manifest)}\n`);
    },
  };
}
