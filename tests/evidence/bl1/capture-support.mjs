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
// - `retainedContentReviews` and `contentReviewCoverage` decide which independent content review covers each block,
//   by the git tree of `catalog/patterns/<slug>` and the copy-bearing inputs of its participants, so a capture needs a new review only
//   for a block, or a participant it renders, that no retained review read.
// - `blockBrowserTests` derives the cross-engine browser tests from the policy's pattern routes.
// - `seedRehearsal` starts a rehearsal from a copy of the retained evidence, and refuses a destination
//   that overlaps it before removing anything.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { canonicalJson } from '../../../tooling/audits/repository-policy/src/canonical-json.mjs';
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

/**
 * Every capture directory under `<root>`: the current one, then each archived under `superseded/`, with the
 * scope its validation summary records. A directory with no validation summary, or an older one with no scope,
 * reports no scope, so a caller decides which of those it accepts.
 */
export async function retainedCaptures({ outputRoot, root }) {
  const archive = join(outputRoot, root, 'superseded');
  const archived = existsSync(archive) ? (await readdir(archive, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map(({ name }) => name).sort() : [];
  const captures = [];
  for (const directory of [root, ...archived.map((name) => posix.join(root, 'superseded', name))]) {
    const path = join(outputRoot, directory, 'verification.json');
    const { scope, sourceRevision } = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : {};
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
 * close-out capture, the pattern ids added since it, and the source revision of the capture at the retained root,
 * which a new capture replaces (the thresholds changed since it need new log entries).
 */
export async function assertGrowthSource({ evidenceRoot, root, patternIds }) {
  const captures = await retainedCaptures({ outputRoot: evidenceRoot, root });
  const closeout = captures.find(({ scope }) => scope === 'close-out');
  if (closeout === undefined) throw new Error(`BL1_GROWTH_NO_CLOSEOUT: a growth capture builds on a retained close-out capture, and ${root} retains none`);
  const measured = await measuredPatternIds({ outputRoot: evidenceRoot, directory: closeout.directory });
  const added = patternIds.filter((id) => !measured.includes(id));
  if (added.length === 0) throw new Error(`BL1_GROWTH_NO_BLOCK: the catalog has no pattern beyond the ${measured.length} the close-out at ${closeout.sourceRevision.slice(0, 8)} measured; a growth capture follows an added block`);
  return { closeout, added, previousRevision: captures[0].sourceRevision };
}

/** The git tree of `catalog/patterns/<slug>` at `revision`, or null when the block or the revision is absent. */
export function blockTreeAt(cwd, revision, slug) {
  const result = spawnSync('git', ['rev-parse', `${revision}:catalog/patterns/${slug}`], { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const reactRuntimeRoot = 'packages/react/src';
/**
 * The files under `packages/react/src` that neither render a component nor decide what one renders: the contract checks that verify the
 * generated package, the deferred-evidence list, and the publish guard. Every other file there is part of the coverage key: runtime modules
 * and stylesheets can carry the copy a block renders (a default placeholder, an accessible label), the generator projects the runtime that
 * blocks import and could transform that copy, and the supplemental mapping selects the runtime sources and exports.
 */
export const nonRenderingReactSources = ['r1-contracts.mjs', 'r1-deferred-evidence.mjs', 'publish-guard.mjs'].map((name) => `${reactRuntimeRoot}/${name}`);

/**
 * What a review of a block read, as far as the copy the block renders goes: the block's own sources (its git tree), the catalog
 * record of every participant component (its git tree, `null` when the record is absent), and the React runtime sources, as a digest of
 * the path and blob of every file under `packages/react/src` except `nonRenderingReactSources`. A participant's default copy lives in its
 * record and in the runtime, and no per-component source mapping exists for every participant, so the runtime part is the whole of
 * `packages/react/src`, which is conservative: any runtime change asks for a new review. Returns null when the block is absent.
 */
export function coverageKey(cwd, revision, slug) {
  const blockTree = blockTreeAt(cwd, revision, slug);
  if (blockTree === null) return null;
  const record = JSON.parse(git(cwd, 'show', `${revision}:catalog/patterns/${slug}/artifact.json`));
  const participants = [...new Set(record.participants.map(({ component }) => component))].sort().map((component) => {
    const result = spawnSync('git', ['rev-parse', `${revision}:catalog/components/${component.slice('muxui:component:'.length)}`], { cwd, encoding: 'utf8' });
    return { component, tree: result.status === 0 ? result.stdout.trim() : null };
  });
  const files = lines(git(cwd, 'ls-tree', '-r', revision, '--', reactRuntimeRoot))
    .map((line) => /^\d+ blob ([0-9a-f]+)\t(.+)$/u.exec(line))
    .filter((match) => match !== null && !nonRenderingReactSources.includes(match[2]))
    .map(([, blob, path]) => `${path}\0${blob}\n`);
  return { blockTree, participants, reactRuntime: { root: reactRuntimeRoot, excluded: nonRenderingReactSources, files: files.length, digest: sha256(files.sort().join('')) } };
}

/**
 * The independent content reviews that earlier captures retained, as the coverage candidates of a capture at
 * `sourceRevision`: the review of the capture at the retained root and of each archived capture, with where its file
 * is (or will be) retained. The root capture is archived under `superseded/` when `sourceRevision` replaces it, so its
 * review is reported at the archive path; a capture at `sourceRevision` itself is being rerun and its review is replaced,
 * so it is skipped. Each file must still match the digest its capture recorded.
 */
export async function retainedContentReviews({ outputRoot, root, sourceRevision }) {
  const reviews = [];
  for (const { directory, sourceRevision: captured } of await retainedCaptures({ outputRoot, root })) {
    const artifactFile = join(outputRoot, directory, 'artifacts/E-BL1-10.json');
    if (!existsSync(artifactFile) || captured === sourceRevision) continue;
    const { review } = JSON.parse(await readFile(artifactFile, 'utf8')).observations;
    if (review?.artifact === undefined) continue;
    const file = join(outputRoot, directory, 'artifacts', basename(review.artifact.path));
    const text = await readFile(file, 'utf8');
    if (sha256(text) !== review.artifact.sha256) throw new Error(`E-BL1-10: the content review retained with the capture at ${captured.slice(0, 8)} no longer matches its recorded digest`);
    const retainedDirectory = directory === root ? posix.join(root, 'superseded', captured.slice(0, 12)) : directory;
    reviews.push({
      artifact: { path: posix.join(retainedDirectory, 'artifacts', basename(review.artifact.path)), sha256: review.artifact.sha256 },
      reviewer: review.reviewer,
      reviewedRevision: review.reviewedRevision,
      reviewedTree: review.reviewedTree,
      blocks: review.blocks,
    });
  }
  return reviews;
}

/**
 * Which retained independent content review covers each of `patternSlugs` at `sourceRevision` (Decision 0029). A review covers a block
 * when it names the block and the block's `coverageKey` is the same at the revision the reviewer read as at `sourceRevision`: the same
 * block sources, the same catalog record for every participant component, and the same React runtime sources, so the reviewer read
 * exactly the sources and the copy-bearing inputs the capture scanned. `reviews` are candidates (`artifact`, `reviewer`,
 * `reviewedRevision`, `reviewedTree`, `blocks`); the first is preferred, then the others by the date of the revision they read, newest
 * first. A review that reads a revision this repository does not hold covers nothing. Returns `{ rows, uncovered }`: one row per
 * covered block, with its key and the covering review's own reviewed revision, tree, and key, and the blocks no review covers, which
 * need a new review.
 */
export function contentReviewCoverage({ cwd, sourceRevision, patternSlugs, reviews }) {
  const readable = reviews.filter(({ reviewedRevision }) => gitStatus(cwd, 'cat-file', '-e', `${reviewedRevision}^{commit}`) === 0);
  const dated = (review) => Number(git(cwd, 'log', '-1', '--format=%ct', review.reviewedRevision));
  const [preferred, ...others] = readable;
  const candidates = [...(preferred === undefined ? [] : [preferred]), ...others.sort((left, right) => dated(right) - dated(left))];
  const rows = [];
  const uncovered = [];
  for (const slug of patternSlugs) {
    const key = coverageKey(cwd, sourceRevision, slug);
    const covering = key === null ? undefined : candidates.find((review) => review.blocks.includes(slug) && canonicalJson(coverageKey(cwd, review.reviewedRevision, slug)) === canonicalJson(key));
    if (covering === undefined) {
      uncovered.push(slug);
      continue;
    }
    rows.push({
      block: slug,
      key,
      review: {
        artifact: covering.artifact,
        reviewer: covering.reviewer,
        reviewedRevision: covering.reviewedRevision,
        reviewedTree: covering.reviewedTree,
        keyAtReviewedRevision: coverageKey(cwd, covering.reviewedRevision, slug),
      },
    });
  }
  return { rows, uncovered };
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

/** The real path of `path` with symlinks resolved; a path that does not exist yet resolves through its deepest existing ancestor. */
async function realpathLoose(path) {
  const missing = [];
  let current = resolve(path);
  for (;;) {
    try {
      return join(await realpath(current), ...missing.toReversed());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.push(basename(current));
      current = dirname(current);
    }
  }
}

const isInside = (outer, inner) => {
  const path = relative(outer, inner);
  return path === '' || !(path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path));
};

/**
 * Starts a rehearsal from the retained evidence: replaces `<destination>/<root>` with a copy of
 * `<repositoryRoot>/<root>`, so reused reviews and the supersession archive behave as in a real capture.
 * It refuses, before removing anything, a destination or target that overlaps the retained evidence,
 * compared by real path with either containing the other (`--rehearsal=.` would otherwise delete the
 * evidence before it is copied).
 */
export async function seedRehearsal({ repositoryRoot, destination, root }) {
  const source = await realpathLoose(join(repositoryRoot, root));
  const target = await realpathLoose(join(destination, root));
  for (const [name, path] of [['destination', await realpathLoose(destination)], ['target', target]]) {
    if (isInside(path, source) || isInside(source, path)) {
      throw new Error(`BL1_REHEARSAL_OVERLAP: the rehearsal ${name} ${path} overlaps the retained evidence ${source}; choose a directory outside it`);
    }
  }
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}
