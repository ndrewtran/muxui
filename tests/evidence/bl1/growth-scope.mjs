// The growth scope of E-BL1-08 and E-BL1-09 (see tests/evidence/bl1/README.md, "Adding a block").
//
// A growth capture can run on a main that other pull requests changed since the close-out (a component, a
// dependency, the `@muxui/react` sources), and those changes are under their own authority. Comparing the
// close-out with the head would blame the blocks for them, so the two claims are evaluated across the
// growth itself: every commit on the first-parent history of the source revision that added a block the
// close-out did not measure, each against its first parent. Blocks that arrived in more than one commit
// are audited one commit at a time. The head need not be the growth commit.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compileBundle, repositoryRoot } from './regression.mjs';

export const growthScopeRule = 'Each commit on the first-parent history of the source revision that added a block the close-out did not measure is compared with its first parent. E-BL1-08: the catalog compiled without the sources that commit added has the same digest before and after. E-BL1-09: across that commit @muxui/react (sources, package.json, stylesheet names), every dependency and the lockfile, and the component, token, capability, and React family records are unchanged. Changes other pull requests made between the close-out and the capture are outside both claims.';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (text) => text.split('\n').filter(Boolean);
const manifestPath = 'packages/catalog/catalog-sources.json';

/** The pattern record paths the source manifest lists at `revision`, as a map from pattern id to the record's path. */
function patternRecords(cwd, revision) {
  const { records } = JSON.parse(git(cwd, 'show', `${revision}:${manifestPath}`));
  return new Map(records.filter(({ family }) => family === 'pattern').map(({ path }) => [JSON.parse(git(cwd, 'show', `${revision}:${path}`)).id, path]));
}

/**
 * The commits that added the patterns `patternIds`, oldest first, each as `{ commit, parent, subject, addedPatterns }`.
 * A commit is found on the first-parent history of `head` as the one that added the pattern's record, so a squash
 * merge, a merge commit, and a branch of plain commits are each one pull request's worth of history. A pattern
 * that no such commit added, or a commit with no parent, throws.
 */
export function growthCommits({ cwd = repositoryRoot, head = 'HEAD', patternIds }) {
  const records = patternRecords(cwd, head);
  const order = new Map(lines(git(cwd, 'rev-list', '--first-parent', '--reverse', head)).map((commit, index) => [commit, index]));
  const byCommit = new Map();
  for (const id of patternIds) {
    const path = records.get(id);
    if (path === undefined) throw new Error(`BL1_GROWTH_COMMIT_MISSING: ${id} is not a pattern of ${head}`);
    const added = lines(git(cwd, 'log', '--first-parent', '--diff-filter=A', '--format=%H', head, '--', path));
    if (added.length === 0) throw new Error(`BL1_GROWTH_COMMIT_MISSING: no commit on the first-parent history of ${head} added ${path}`);
    for (const commit of added) byCommit.set(commit, [...(byCommit.get(commit) ?? []), id]);
  }
  return [...byCommit].sort(([left], [right]) => order.get(left) - order.get(right)).map(([commit, ids]) => {
    const addedPatterns = ids.sort();
    const parents = lines(git(cwd, 'rev-list', '--parents', '-n', '1', commit)).flatMap((line) => line.split(' ').slice(1));
    if (parents.length === 0) throw new Error(`BL1_GROWTH_COMMIT_MISSING: ${commit} has no parent to compare with`);
    return { commit, parent: parents[0], subject: git(cwd, 'log', '-1', '--format=%s', commit), addedPatterns };
  });
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
 * E-BL1-08 across one growth commit: the catalog digest of the tree at `parent` and of the tree at `commit`,
 * each compiled by this checkout's compiler without the sources `addedPatterns` brought. Equal digests mean
 * the digest changed only for the added sources. A growth commit that edits any other source, an existing
 * block included, or the catalog package version, moves the digest.
 * `compilerPathsChanged` lists the compiler and schema files the commit touched: both sides are compiled by
 * the same compiler, so a compiler change is shown, not detected.
 */
export async function catalogAcrossCommit({ cwd = repositoryRoot, commit, parent, addedPatterns }) {
  const records = patternRecords(cwd, commit);
  const missing = addedPatterns.filter((id) => !records.has(id));
  if (missing.length > 0) throw new Error(`BL1_GROWTH_COMMIT_MISSING: ${commit} has no pattern record for ${missing.join(', ')}`);
  const directories = addedPatterns.map((id) => `${dirname(records.get(id))}/`);
  const excluded = ({ path }) => directories.some((directory) => path.startsWith(directory));
  const digestAt = (revision) => withTree(cwd, revision, async (directory) => (await compileBundle((entry) => !excluded(entry), directory)).bundle.catalogDigest);
  const [before, after] = [await digestAt(parent), await digestAt(commit)];
  const { records: entries } = JSON.parse(git(cwd, 'show', `${commit}:${manifestPath}`));
  return {
    commit,
    parent,
    addedPatterns,
    excludedEntries: entries.filter(excluded).map(({ family, path }) => ({ family, path })),
    digestBefore: before,
    digestAfter: after,
    identical: before === after,
    compilerPathsChanged: lines(git(cwd, 'diff', '--name-only', parent, commit, '--', 'packages/catalog/src', 'packages/catalog/package.json', 'packages/schema/src', 'packages/tokens/src')),
  };
}
