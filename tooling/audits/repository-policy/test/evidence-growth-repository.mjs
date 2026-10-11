// The throwaway repository the BL1 growth tests audit (`evidence-growth-*.test.mjs`), kept here so those files share it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const repositoryRoot = resolve(import.meta.dirname, '../../../..');

/** Runs `git` in `cwd` as a fixed author without signing, and returns its trimmed output. */
export const gitIn = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();

/** An edit for `edit(path, ...)`: parses the JSON text, applies `change`, and writes it back the way the repository formats it. */
export const jsonEdit = (change) => (text) => `${JSON.stringify(change(JSON.parse(text)), null, 2)}\n`;

/** An edit that changes a record's summary. */
export const summaryEdit = jsonEdit((record) => ({ ...record, summary: `${record.summary} Edited.` }));

/**
 * A throwaway repository holding this checkout's HEAD tree without `tests/evidence`, rebuilt so its last two patterns arrive in two
 * growth commits: `base` has neither, `first` adds the first, `second` adds the other. The audit and the catalog compiler read the
 * archived tree, never the retained evidence (the audit reads that from this checkout), and the evidence is more than half of its
 * bytes; the drift test holds `second` to HEAD's tree minus `tests/evidence/`, so the fixture cannot stop standing for the repository.
 * `variant(change)` branches from `first`, adds the other pattern back, and applies `change`, as a growth commit that also changes
 * something else. Its growth commits are squash merges (their subjects end with a pull request number), as growth commits must be;
 * `rebased()` builds the pull request that is not one. Every commit adds its files with `git add -f`, so what HEAD's `.gitignore` ignores
 * (a hosting file the fixture writes as a negative control) cannot drop one of the fixture's own changes.
 *
 * `derive(head, patternIds)` selects the growth commits after `base`; `audit(growth, growthGate)` runs the growth-scoped checks over
 * them and `failed` lists the checks that fail.
 */
export async function growthRepository() {
  const { growthCommits } = await import('../../../../tests/evidence/bl1/growth-scope.mjs');
  const { auditBoundary, growthScopedChecks } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  // Both directories are created here, and are the only ones `dispose` removes.
  const cwd = await mkdtemp(join(tmpdir(), 'muxui-bl1-growth-repo-'));
  const stash = await mkdtemp(join(tmpdir(), 'muxui-bl1-growth-stash-'));
  gitIn(cwd, 'init', '-q', '-b', 'main');
  gitIn(cwd, 'config', 'gc.auto', '0');
  execFileSync('tar', ['-x', '-C', cwd], { input: execFileSync('git', ['archive', '--format=tar', 'HEAD', '--', '.', ':(exclude)tests/evidence'], { cwd: repositoryRoot, maxBuffer: 1 << 29 }), maxBuffer: 1 << 26 });
  const manifestPath = 'packages/catalog/catalog-sources.json';
  const original = await readFile(join(cwd, manifestPath), 'utf8');
  const manifest = JSON.parse(original);
  const records = manifest.records.filter(({ family }) => family === 'pattern');
  const entries = records.slice(-2);
  const [directoryA, directoryB] = entries.map(({ path }) => dirname(path));
  const [patternA, patternB] = entries.map(({ path }) => JSON.parse(readFileSync(join(cwd, path), 'utf8')).id);
  const earlier = JSON.parse(readFileSync(join(cwd, records[0].path), 'utf8')).id;
  // The manifest without the entries under the two directories, except those under `kept`.
  const listing = (...kept) => JSON.stringify({ ...manifest, records: manifest.records.filter(({ path }) => ![directoryA, directoryB].some((directory) => path.startsWith(`${directory}/`)) || kept.some((directory) => path.startsWith(`${directory}/`))) }, null, 2);
  const commitAll = (message) => {
    gitIn(cwd, 'add', '-A', '-f');
    gitIn(cwd, 'commit', '-q', '-m', message);
    return gitIn(cwd, 'rev-parse', 'HEAD');
  };
  for (const directory of [directoryA, directoryB]) {
    await mkdir(join(stash, directory, '..'), { recursive: true });
    await cp(join(cwd, directory), join(stash, directory), { recursive: true });
    await rm(join(cwd, directory), { recursive: true });
  }
  const restore = (directory) => cp(join(stash, directory), join(cwd, directory), { recursive: true });
  const edit = async (path, change) => writeFile(join(cwd, path), change(await readFile(join(cwd, path), 'utf8')));
  await writeFile(join(cwd, manifestPath), listing());
  const base = commitAll('base: neither block');
  await restore(directoryA);
  await writeFile(join(cwd, manifestPath), listing(directoryA));
  const first = commitAll('first: adds one block (#101)');
  await restore(directoryB);
  await writeFile(join(cwd, manifestPath), original);
  const second = commitAll('second: adds the other block (#102)');
  const variant = async (change) => {
    gitIn(cwd, 'checkout', '-q', '--detach', first);
    await restore(directoryB);
    await writeFile(join(cwd, manifestPath), original);
    await change(edit);
    return commitAll('growth that also changes something else (#103)');
  };
  // A later commit on top of `second`: the growth is over, and this one changes the second block, as a follow-up to the pull request does.
  const modify = async (change) => {
    gitIn(cwd, 'checkout', '-q', '--detach', second);
    await change(edit, cwd);
    return commitAll('a later commit that changes the second block (#104)');
  };
  // One pull request rebase-merged as two commits on `base`, neither with a pull request number: the first adds a block, the second adds a
  // workflow and touches no block.
  const rebased = async () => {
    gitIn(cwd, 'checkout', '-q', '--detach', base);
    await restore(directoryA);
    await writeFile(join(cwd, manifestPath), listing(directoryA));
    const block = commitAll('feat(catalog): add the block');
    await mkdir(join(cwd, '.github/workflows'), { recursive: true });
    await writeFile(join(cwd, '.github/workflows/x.yml'), 'name: x\n');
    return { block, workflow: commitAll('ci: add a workflow') };
  };
  // The retained close-out stands at `base`: neither new block exists yet, and the older blocks predate it.
  const derive = (head, patternIds = [patternA, patternB]) => growthCommits({ cwd, head, since: base, patternIds });
  const audit = (growth, growthGate) => auditBoundary({ cwd, base, head: growth.at(-1), mergeRevision: base, closeoutBase: null, growthCommits: growth, offline: true, only: growthScopedChecks, growthGate });
  const failed = (growth, growthGate) => audit(growth, growthGate).checks.filter(({ pass }) => !pass).map(({ id }) => id);
  const commitsOf = (head) => derive(head).map(({ commit }) => commit);
  const dispose = () => Promise.all([cwd, stash].map((path) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
  return { cwd, base, first, second, variant, modify, rebased, edit, derive, audit, failed, commitsOf, patternA, patternB, directoryA, directoryB, earlier, records, dispose };
}
