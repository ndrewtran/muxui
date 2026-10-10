// The growth scope of E-BL1-08 and E-BL1-09 (see tests/evidence/bl1/README.md, "Adding a block").
//
// A growth capture can run on a main that other pull requests changed since the close-out (a component, a
// dependency, the `@muxui/react` sources), and those changes are under their own authority. Comparing the
// close-out with the head would blame the blocks for them, so the two claims are evaluated across the
// growth itself: every commit on the first-parent history of the source revision, after the retained
// close-out revision, that adds or changes a block the close-out did not measure (its directory under
// `catalog/patterns/` or its `catalog-sources.json` entries), each against its first parent. A later commit
// that only edits a new block is a growth commit like the one that added it, so it cannot also change
// `@muxui/react` or a dependency unaudited. The head need not be a growth commit. Since Decision 0029 the per-commit
// comparisons of E-BL1-08 and the E-BL1-09 checks that read `@muxui/react`, dependencies, and component records are recorded
// observations, not gates (see `growthGate` in boundary-audit.mjs); the audit still names every commit that changed them.
//
// Git cannot say which commits belonged to one pull request, so the scope is sound only when each growth pull
// request is one commit: a squash merge, whose subject ends with GitHub's ` (#<number>)`. A pull request merged as
// several commits could carry a change (a workflow, a dependency) in a commit that touches no block, and that
// commit would be neither selected nor audited. A growth commit that is not a squash merge stops the selection.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { canonicalJson } from '../../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { compileBundle, repositoryRoot } from './regression.mjs';

export const growthScopeRule = 'Each commit on the first-parent history of the source revision, after the retained close-out revision, that adds or changes a block the close-out did not measure (its directory under catalog/patterns or its catalog-sources.json entries) is compared with its first parent (Decision 0029). E-BL1-08 records, per commit, the catalog digest before and after with the sources of the blocks that commit added or changed left out of both sides, and the compiler and schema paths the commit changed; these are observations and gate nothing. E-BL1-09 records, per commit, whether @muxui/react (sources, package.json, stylesheet names), dependencies and the lockfile, and the component, token, capability, and React family records changed; these are observations and gate nothing, and a growth commit may change them under its own proof. A growth commit may not change a workflow, a hosting or deployment file, or an Astro deployment setting, or bump a package version. Every growth commit is a squash merge of one pull request (a single-parent commit whose subject ends with " (#<number>)"), so no commit of a growth pull request escapes the audit.';

/** The text of the non-claim a growth record carries (Decision 0029); the integrity test requires it, and E-BL1-08 and E-BL1-09 each state it. */
export const growthNonClaim = 'A growth commit may change @muxui/react, dependencies, and component records; this record lists what it changed and claims nothing about it.';

/**
 * The paths that run when the catalog compiles and can move the digest of sources that did not change. Both sides of the
 * E-BL1-08 comparison are compiled by one compiler, so a change to these in a growth commit could not show in the digest,
 * and the commit fails instead. The three `package.json` files are listed because their `exports` and `main` decide which
 * module the compiler loads for `@muxui/schema`, `@muxui/tokens`, and the catalog package; a growth pull request never
 * touches them. Data the compiler reads (the records, the command registry, the page budget profile) is read from each
 * tree, so a change to it shows in the digest. `pattern-content.mjs` and `pattern-imports.mjs` only reject records and
 * write nothing to the output, so they are not listed; a test pins that `compiler.mjs` imports nothing else from this
 * package. The integrity test requires a retained capture to declare exactly this list as the tool bound at its source
 * revision exports it, so the list is a constant array of string literals that test reads.
 */
export const digestAffectingPaths = [
  'packages/catalog/package.json',
  'packages/catalog/src/compiler.mjs',
  'packages/schema/package.json',
  'packages/schema/schemas',
  'packages/schema/src',
  'packages/tokens/package.json',
  'packages/tokens/src',
];

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (text) => text.split('\n').filter(Boolean);
const manifestPath = 'packages/catalog/catalog-sources.json';
// The subject GitHub gives a squash merge: the pull request's title and its number.
const squashSubject = / \(#\d+\)$/u;

/** The source manifest's entries at `revision`. */
const manifestEntries = (cwd, revision) => JSON.parse(git(cwd, 'show', `${revision}:${manifestPath}`)).records;

/** The pattern record paths the source manifest lists at `revision`, as a map from pattern id to the record's path. */
function patternRecords(cwd, revision) {
  return new Map(manifestEntries(cwd, revision).filter(({ family }) => family === 'pattern').map(({ path }) => [JSON.parse(git(cwd, 'show', `${revision}:${path}`)).id, path]));
}

const recordExists = (cwd, revision, path) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${revision}:${path}`], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/**
 * The commits of a growth, oldest first. A growth commit is a commit on the first-parent history of `head` after
 * `since` (the retained close-out revision) that adds or changes one of `patternIds`, the blocks the close-out did not
 * measure: it changes a file under the block's directory or the block's entries in the source manifest. Each is
 * audited on its own against the first parent.
 * Each result is `{ commit, parent, subject, addedPatterns, changedPatterns, excludedDirectories, excludedEntries,
 * digestAffectingPathsChanged }`, all read from git: the sources E-BL1-08 leaves out of both sides, and the
 * `digestPaths` the commit changed. A block that no commit after `since` touched throws, and so does a commit that
 * renames, moves, or deletes the record of a block added since the close-out: renames are not tracked, so the
 * exclusions of the two sides would not match and the block's earlier commits would go unaudited.
 *
 * Every growth commit must be a squash merge of one pull request: a single-parent commit whose subject ends with
 * ` (#<number>)`. Otherwise `BL1_GROWTH_NOT_SQUASHED` is thrown, because a pull request merged as several commits (a rebase
 * merge) or as a merge commit may carry a change in a commit that touches no block, which this selection would never see.
 * `requireSquash: false` is for a rehearsal on a pull request branch, whose commits are not merged yet and never retained.
 */
export function growthCommits({ cwd = repositoryRoot, head = 'HEAD', since, patternIds, digestPaths = digestAffectingPaths, requireSquash = true }) {
  if (since === undefined) throw new Error('BL1_GROWTH_COMMIT_MISSING: the growth commits are those after the retained close-out revision, and none was given');
  const records = patternRecords(cwd, head);
  const recordsAt = new Map();
  const patternRecordsAt = (revision) => {
    if (!recordsAt.has(revision)) recordsAt.set(revision, patternRecords(cwd, revision));
    return recordsAt.get(revision);
  };
  const closeoutPatterns = patternRecordsAt(since);
  const patterns = patternIds.map((id) => {
    const path = records.get(id);
    if (path === undefined) throw new Error(`BL1_GROWTH_COMMIT_MISSING: ${id} is not a pattern of ${head}`);
    return { id, path, directory: `${dirname(path)}/` };
  });
  const manifests = new Map();
  const entriesAt = (revision) => {
    if (!manifests.has(revision)) manifests.set(revision, manifestEntries(cwd, revision));
    return manifests.get(revision);
  };
  const touched = new Set();
  const growth = [];
  const candidates = lines(git(cwd, 'log', '--first-parent', '--format=%H', `${since}..${head}`, '--', manifestPath, 'catalog/patterns', ...patterns.map(({ directory }) => directory))).reverse();
  for (const commit of candidates) {
    const parents = lines(git(cwd, 'rev-list', '--parents', '-n', '1', commit)).flatMap((line) => line.split(' ').slice(1));
    if (parents.length === 0) throw new Error(`BL1_GROWTH_COMMIT_MISSING: ${commit} has no parent to compare with`);
    const [parent] = parents;
    // A block added since the close-out whose record is gone from the commit was renamed, moved, or deleted, whatever it is called at the head.
    for (const [id, path] of patternRecordsAt(parent)) {
      if (!closeoutPatterns.has(id) && !recordExists(cwd, commit, path)) {
        throw new Error(`BL1_GROWTH_BLOCK_MOVED: ${commit} (${git(cwd, 'log', '-1', '--format=%s', commit)}) renames, moves, or deletes the growth block ${id} (${path}); rename or remove a growth block in a separate, non-growth change`);
      }
    }
    const under = (revision, directory) => canonicalJson(entriesAt(revision).filter(({ path }) => path.startsWith(directory)));
    const changed = patterns.filter(({ directory }) => lines(git(cwd, 'diff', '--name-only', parent, commit, '--', directory)).length > 0 || under(parent, directory) !== under(commit, directory));
    if (changed.length === 0) continue;
    const subject = git(cwd, 'log', '-1', '--format=%s', commit);
    if (requireSquash && (parents.length !== 1 || !squashSubject.test(subject))) {
      throw new Error(`BL1_GROWTH_NOT_SQUASHED: ${commit} (${subject}) adds or changes a block but is ${parents.length !== 1 ? 'a merge commit' : 'not a squash merge (its subject does not end with " (#<number>)")'}. A growth pull request must be squash-merged so that it is one commit and every change it makes is audited: git cannot tell which other commits belonged to a pull request merged as several commits, and one of them could change a workflow, a dependency, or @muxui/react without touching a block`);
    }
    for (const { id } of changed) touched.add(id);
    const excludedDirectories = changed.map(({ directory }) => directory).sort();
    growth.push({
      commit,
      parent,
      subject,
      addedPatterns: changed.filter(({ path }) => !recordExists(cwd, parent, path)).map(({ id }) => id).sort(),
      changedPatterns: changed.filter(({ path }) => recordExists(cwd, parent, path)).map(({ id }) => id).sort(),
      excludedDirectories,
      excludedEntries: entriesAt(commit).filter(({ path }) => excludedDirectories.some((directory) => path.startsWith(directory))).map(({ family, path }) => ({ family, path })),
      digestAffectingPathsChanged: lines(git(cwd, 'diff', '--name-only', parent, commit, '--', ...digestPaths)),
    });
  }
  const untouched = patterns.filter(({ id }) => !touched.has(id)).map(({ id }) => id);
  if (untouched.length > 0) throw new Error(`BL1_GROWTH_COMMIT_MISSING: no commit after ${since.slice(0, 8)} on the first-parent history of ${head} added or changed ${untouched.join(', ')}`);
  return growth;
}

// Decision 0028 (#251) removed `authorityDecisionPath` from the catalog source manifest and the compiler stopped accepting it, so a tree from
// before then no longer compiles as committed. Block categories then became catalog data: the manifest names a registry (`patternCategoriesPath`)
// the compiler requires, where a tree from before had the closed list in the pattern schema. Each extracted tree is normalized the same way on
// both sides of the comparison: the removed key is dropped, and a tree without a registry gets the closed list it had. Nothing else is changed.
const removedManifestKey = 'authorityDecisionPath';
const categoryRegistryPath = 'catalog/patterns/categories.json';
/**
 * The closed list, byte for byte as `catalog/patterns/categories.json` shipped it, so a tree from before compiles to the same bundle as the
 * tree that moved the list. The integrity test holds this text to the file as that change added it.
 */
export const closedCategoryRegistry = `{
  "application": ["collections", "forms", "feedback", "conversation", "navigation"],
  "marketing": ["hero", "features", "pricing", "call-to-action", "testimonials", "faq", "stats", "logo-cloud", "newsletter", "footer"]
}
`;

/** Makes the extracted tree's source manifest compile: drops the removed `authorityDecisionPath`; any other unknown key still fails the compiler. */
async function normalizeLegacyManifest(directory) {
  const path = join(directory, manifestPath);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const legacy = removedManifestKey in manifest || !('patternCategoriesPath' in manifest);
  if (!legacy) return;
  delete manifest[removedManifestKey];
  if (!('patternCategoriesPath' in manifest)) {
    manifest.patternCategoriesPath = categoryRegistryPath;
    await writeFile(join(directory, categoryRegistryPath), closedCategoryRegistry);
  }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Extracts the tree of `revision` to a new temporary directory, runs `use` on it, and removes it. */
async function withTree(cwd, revision, use) {
  const directory = await mkdtemp(join(tmpdir(), 'muxui-bl1-growth-tree-'));
  try {
    execFileSync('tar', ['-x', '-C', directory], { input: execFileSync('git', ['archive', '--format=tar', revision], { cwd, maxBuffer: 512 * 1024 * 1024 }), maxBuffer: 64 * 1024 * 1024 });
    return await use(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * E-BL1-08 across one growth commit (an entry of `growthCommits`): the catalog digest of the tree at `parent` and of
 * the tree at `commit`, each compiled by this checkout's compiler without the sources of the blocks the commit added or
 * changed (`excludedDirectories`). The commit holds when the digests are equal, so the digest changed only for those
 * sources, and when it changed no `digestAffectingPaths` file, which the same-compiler comparison cannot see. A
 * growth commit that edits any other source, a close-out block included, or the catalog package version, moves the digest.
 * A tree from before Decision 0028 or before block categories became catalog data is normalized first (`normalizeLegacyManifest`).
 */
export async function catalogAcrossCommit({ cwd = repositoryRoot, commit, parent, excludedDirectories, digestAffectingPathsChanged }) {
  const excluded = ({ path }) => excludedDirectories.some((directory) => path.startsWith(directory));
  const digestAt = (revision) => withTree(cwd, revision, async (directory) => {
    await normalizeLegacyManifest(directory);
    return (await compileBundle((entry) => !excluded(entry), directory)).bundle.catalogDigest;
  });
  const [digestBefore, digestAfter] = await Promise.all([digestAt(parent), digestAt(commit)]);
  const identical = digestBefore === digestAfter;
  return { digestBefore, digestAfter, identical, holds: identical && digestAffectingPathsChanged.length === 0 };
}
