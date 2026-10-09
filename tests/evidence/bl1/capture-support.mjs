// The parts of the BL1 capture that decide what may be retained, kept out of
// `tests/evidence/capture-bl1.mjs` so `evidence-integrity.test.mjs` can exercise them:
//
// - `assertDurableSource` refuses a source revision that is not in main's history.
// - `retainReview` retains an independent review record as an input, with its own
//   reviewed revision and tree, and compares them with the source revision.
// - `archiveSupersededCapture` and `supersededFiles` keep an earlier capture in the tree
//   when a later one replaces it, so replacing records never deletes the only copy.
// - `retainedCaptures` and `assertGrowthSource` find the retained close-out capture a growth capture
//   builds on, and refuse a growth capture that adds no block to it.
// - `blockBrowserTests` derives the cross-engine browser tests from the policy's pattern routes.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { hasUnsanitizedEvidenceOutput } from '../../../tooling/audits/repository-policy/src/evidence-verify.mjs';
import { sanitizePaths } from './proof-run.mjs';

export const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const gitStatus = (cwd, ...args) => spawnSync('git', args, { cwd, stdio: 'ignore' }).status;
const lines = (text) => text.split('\n').filter(Boolean);

export const isAncestor = (cwd, ancestor, descendant) => gitStatus(cwd, 'merge-base', '--is-ancestor', ancestor, descendant) === 0;

/**
 * Throws unless `revision` is in the history of `mainRef`. A squash merge orphans a branch
 * commit, so a record bound to one cannot be fetched from main. A missing `mainRef` also throws.
 */
export function assertDurableSource({ cwd, revision, mainRef = 'origin/main' }) {
  if (!isAncestor(cwd, revision, mainRef)) {
    throw new Error(`EVIDENCE_SOURCE_NOT_DURABLE: ${revision} is not in ${mainRef}'s history. Merge the tools first, fetch, and capture from the merged main commit, or rehearse with --rehearsal=<dir>.`);
  }
}

/** The tree of `revision` and how it differs from the source revision, or nulls when the revision is not in this repository. */
function compareWithSource({ cwd, reviewedRevision, sourceRevision, sourceTree, proofToolPaths }) {
  if (gitStatus(cwd, 'cat-file', '-e', `${reviewedRevision}^{commit}`) !== 0) return { reviewedTree: null, comparison: null };
  const blobAt = (revision, path) => {
    const result = spawnSync('git', ['rev-parse', `${revision}:${path}`], { cwd, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const reviewedTree = git(cwd, 'rev-parse', `${reviewedRevision}^{tree}`);
  const changed = lines(git(cwd, 'diff', '--name-only', reviewedRevision, sourceRevision));
  return {
    reviewedTree,
    comparison: {
      sourceTree,
      equalTrees: reviewedTree === sourceTree,
      changedPathCount: changed.length,
      changedPaths: changed.slice(0, 50),
      changedPathsTruncated: changed.length > 50,
      // The review read the tools at the reviewed revision; a tool that differs at the source revision was not reviewed as it runs.
      proofToolsChangedSinceReviewed: proofToolPaths.filter((path) => blobAt(reviewedRevision, path) !== blobAt(sourceRevision, path)),
    },
  };
}

/**
 * Retains one independent review record as an input, or reuses the one already retained, or returns
 * null when there is none and it is optional. A new record needs the full 40-character revision the
 * reviewer read, and must name that revision and its reviewer. It is kept as the reviewer wrote it
 * except for local paths, which are rewritten and counted. The result names the reviewed revision
 * and tree, whether the revision is in `mainRef`'s history, and how the reviewed tree compares with
 * the source tree, because a review can be of a revision other than the one captured.
 */
export async function retainReview({
  cwd,
  outputRoot,
  root,
  id,
  input,
  reviewedRevision,
  artifactPath,
  previousKey,
  required,
  sourceRevision,
  sourceTree,
  proofToolPaths = [],
  mainRef = 'origin/main',
}) {
  let text;
  let record;
  if (input !== undefined) {
    if (!/^[0-9a-f]{40}$/u.test(reviewedRevision ?? '')) throw new Error(`${id}: the review needs the full 40-character revision the reviewer read`);
    const raw = await readFile(input, 'utf8');
    const sanitized = sanitizePaths(raw, cwd);
    if (hasUnsanitizedEvidenceOutput(sanitized.text, cwd)) throw new Error(`${id}: the review record is not disclosable after its paths are rewritten`);
    text = sanitized.text;
    record = { raw: { bytes: Buffer.byteLength(raw), retained: false, sha256: sha256(raw) }, replacements: sanitized.counts, reviewedRevision };
  } else {
    const previousPath = join(outputRoot, root, `artifacts/${id}.json`);
    const previous = existsSync(previousPath) ? JSON.parse(await readFile(previousPath, 'utf8')).observations[previousKey] : undefined;
    if (previous === undefined || previous === null) {
      if (required) throw new Error(`${id}: a review record is required and none is retained yet`);
      return null;
    }
    text = await readFile(join(outputRoot, previous.artifact.path), 'utf8');
    if (sha256(text) !== previous.artifact.sha256) throw new Error(`${id}: the retained review no longer matches its recorded digest`);
    record = { raw: previous.raw, replacements: previous.sanitization.replacements, reviewedRevision: previous.reviewedRevision };
  }
  if (!text.includes(record.reviewedRevision.slice(0, 8))) throw new Error(`${id}: the review record does not name the revision ${record.reviewedRevision.slice(0, 8)} it is retained for`);
  const reviewer = /\*\*Reviewer:\*\*\s*(.+)/u.exec(text)?.[1]?.trim();
  if (!reviewer) throw new Error(`${id}: the review record does not name its reviewer`);
  const { reviewedTree, comparison } = compareWithSource({ cwd, reviewedRevision: record.reviewedRevision, sourceRevision, sourceTree, proofToolPaths });
  const verdict = /^##+ (?:Overall verdict|Verdict)[ \t]*\n([\s\S]*?)(?=\n##+ |(?![\s\S]))/mu.exec(text)?.[1]?.trim();
  return {
    artifact: { path: artifactPath, sha256: sha256(text) },
    raw: record.raw,
    sanitization: {
      rule: 'the record is retained as the reviewer wrote it except that local paths are rewritten: the repository root to <repo>, temporary directories to <tmp>, and home directories to <home>; replacements counts each',
      replacements: record.replacements,
    },
    reviewer,
    reviewedRevision: record.reviewedRevision,
    reviewedRevisionDiffersFromSource: record.reviewedRevision !== sourceRevision,
    reviewedRevisionInMainHistory: comparison !== null && isAncestor(cwd, record.reviewedRevision, mainRef),
    reviewedTree,
    comparison,
    verdictText: verdict ?? null,
    advisoryLines: text.split('\n').filter((line) => /\badvisory\b/iu.test(line)).map((line) => line.trim().slice(0, 400)),
    text,
  };
}

const jsonFiles = async (directory) => (existsSync(directory) ? (await readdir(directory)).filter((name) => name.endsWith('.json')).sort() : []);

/**
 * Keeps an earlier capture in the tree when a later one replaces it. Records are replaced in place
 * at their paths, so before that happens the earlier capture's index, validation summary, records,
 * artifacts, excerpts, and captures are copied, byte for byte, under `<root>/superseded/<revision>/`.
 * Returns a map from assertion id to the `supersedes` reference its new record carries: the copied
 * predecessor's path, digest, and source revision. A capture at the same revision as the one on disk
 * is a rerun, not a supersession: nothing is copied and each record's existing `supersedes` is carried
 * forward. The earlier capture must verify first: each artifact must match the digest its record names.
 */
export async function archiveSupersededCapture({ outputRoot, root, sourceRevision }) {
  const recordsDirectory = join(outputRoot, root, 'records');
  const existing = [];
  for (const name of await jsonFiles(recordsDirectory)) {
    const bytes = await readFile(join(recordsDirectory, name));
    existing.push({ name, bytes, record: JSON.parse(bytes) });
  }
  const supersedes = new Map();
  if (existing.length === 0) return supersedes;
  const revisions = new Set(existing.map(({ record }) => record.sourceRevision));
  if (revisions.size > 1) throw new Error(`BL1_SUPERSEDE_MIXED: the records on disk bind more than one source revision: ${[...revisions].join(', ')}`);
  const [previous] = revisions;
  if (previous === sourceRevision) {
    for (const { record } of existing) if (record.supersedes !== undefined) supersedes.set(record.assertionId, record.supersedes);
    return supersedes;
  }
  for (const { record } of existing) {
    const artifact = await readFile(join(outputRoot, record.artifact.path));
    if (sha256(artifact) !== record.artifact.sha256) throw new Error(`BL1_SUPERSEDE_UNVERIFIED: ${record.artifact.path} does not match the digest ${record.assertionId} records, so the earlier capture is not archived`);
  }
  const archive = posix.join(root, 'superseded', previous.slice(0, 12));
  if (existsSync(join(outputRoot, archive))) throw new Error(`BL1_SUPERSEDE_EXISTS: ${archive} already holds a capture`);
  await mkdir(join(outputRoot, archive), { recursive: true });
  for (const file of ['index.json', 'verification.json']) {
    if (existsSync(join(outputRoot, root, file))) await cp(join(outputRoot, root, file), join(outputRoot, archive, file));
  }
  for (const directory of ['records', 'artifacts', 'validation', 'captures']) {
    if (existsSync(join(outputRoot, root, directory))) await cp(join(outputRoot, root, directory), join(outputRoot, archive, directory), { recursive: true });
  }
  for (const { name, bytes, record } of existing) {
    supersedes.set(record.assertionId, { path: posix.join(archive, 'records', name), sha256: sha256(bytes), sourceRevision: previous });
  }
  return supersedes;
}

/** Every file under `<root>/superseded/`, as `{ path, sha256 }` for the new index, in path order. */
export async function supersededFiles({ outputRoot, root }) {
  const base = join(outputRoot, root, 'superseded');
  if (!existsSync(base)) return [];
  const files = [];
  for (const entry of await readdir(base, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    files.push({ path: posix.join(root, 'superseded', absolute.slice(base.length + 1).split('\\').join('/')), sha256: sha256(await readFile(absolute)) });
  }
  return files.sort((left, right) => (left.path < right.path ? -1 : 1));
}

/** Every retained capture under `<root>`: the current one, then each archived under `superseded/`, with the scope its validation summary records (absent on a capture older than scopes). */
export async function retainedCaptures({ outputRoot, root }) {
  const archive = join(outputRoot, root, 'superseded');
  const archived = existsSync(archive) ? (await readdir(archive, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map(({ name }) => name).sort() : [];
  const captures = [];
  for (const directory of [root, ...archived.map((name) => posix.join(root, 'superseded', name))]) {
    const path = join(outputRoot, directory, 'verification.json');
    if (!existsSync(path)) continue;
    const { scope, sourceRevision } = JSON.parse(await readFile(path, 'utf8'));
    captures.push({ directory, scope, sourceRevision });
  }
  return captures;
}

/** The pattern ids the E-BL1-11 artifact of the capture in `directory` measured. */
export async function measuredPatternIds({ outputRoot, directory }) {
  const { observations } = JSON.parse(await readFile(join(outputRoot, directory, 'artifacts/E-BL1-11.json'), 'utf8'));
  return observations.measured.denseBudgets.patterns.map(({ id }) => id);
}

/**
 * A growth capture builds on a retained close-out capture, current or archived, and must add a block to
 * it: the catalog needs a pattern id the close-out's E-BL1-11 record did not measure. Returns the
 * close-out capture and the pattern ids added since it.
 */
export async function assertGrowthSource({ evidenceRoot, root, patternIds }) {
  const closeout = (await retainedCaptures({ outputRoot: evidenceRoot, root })).find(({ scope }) => scope === 'close-out');
  if (closeout === undefined) throw new Error(`BL1_GROWTH_NO_CLOSEOUT: a growth capture builds on a retained close-out capture, and ${root} retains none`);
  const measured = await measuredPatternIds({ outputRoot: evidenceRoot, directory: closeout.directory });
  const added = patternIds.filter((id) => !measured.includes(id));
  if (added.length === 0) throw new Error(`BL1_GROWTH_NO_BLOCK: the catalog has no pattern beyond the ${measured.length} the close-out at ${closeout.sourceRevision.slice(0, 8)} measured; a growth capture follows an added block`);
  return { closeout, added };
}

/**
 * The cross-engine browser tests E-BL1-04 runs, in pattern order: the policy's `patternBrowserTests`,
 * declared once per interactive block. Throws when a declared test names no enabled pattern or no file.
 */
export function blockBrowserTests({ declared, patternSlugs, reactRoot }) {
  const unknown = Object.keys(declared).filter((slug) => !patternSlugs.includes(slug));
  if (unknown.length > 0) throw new Error(`BL1_BROWSER_TEST_UNKNOWN: patternBrowserTests names ${unknown.join(', ')}, which is not an enabled pattern`);
  const tests = patternSlugs.filter((slug) => declared[slug] !== undefined).map((slug) => declared[slug]);
  const missing = tests.filter((test) => !existsSync(join(reactRoot, test)));
  if (tests.length === 0 || missing.length > 0) throw new Error(`BL1_BROWSER_TEST_MISSING: ${tests.length === 0 ? 'patternBrowserTests declares no block browser test' : `${missing.join(', ')} does not exist`}`);
  return tests;
}
