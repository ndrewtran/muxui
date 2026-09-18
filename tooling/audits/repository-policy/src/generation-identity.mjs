import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditRepository, classifyPath, loadPolicy, walkFiles } from './policy.mjs';
import { verifyGenerationState } from './generation-proof.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

async function snapshot(cleanRoot) {
  const files = (await walkFiles(cleanRoot))
    .filter((path) => path !== '.git' && !path.startsWith('.git/'))
    .sort();
  const snapshotFiles = new Map();
  for (const path of files) {
    snapshotFiles.set(path, createHash('sha256').update(await readFile(resolve(cleanRoot, path))).digest('hex'));
  }
  return snapshotFiles;
}

function run(command, args, cwd, stdio = 'inherit') {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command.toUpperCase()}_FAILED: ${result.stderr?.trim() || `exit ${result.status}`}`,
    );
  }
  return result.stdout ?? '';
}

function generate(cleanRoot) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(cleanRoot, 'tooling/audits/repository-policy/src/run-workspace-task.mjs'),
      'generate',
    ],
    { cwd: cleanRoot, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`GENERATION_COMMAND_FAILED: exit ${result.status ?? 1}`);
  }
}

function status(cleanRoot) {
  return run(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    cleanRoot,
    'pipe',
  );
}

const sourceRevision = run('git', ['rev-parse', 'HEAD'], repositoryRoot, 'pipe').trim();
const policy = await loadPolicy(repositoryRoot);
const temporaryRoot = await mkdtemp(join(tmpdir(), 'muxui-generation-proof-'));
const cleanRoots = ['first', 'second'].map((name) => join(temporaryRoot, name));
const runs = [];

try {
  for (const cleanRoot of cleanRoots) {
    run('git', ['worktree', 'add', '--quiet', '--detach', cleanRoot, sourceRevision], repositoryRoot);
    run(
      'pnpm',
      ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'],
      cleanRoot,
    );
    const beforeFiles = await snapshot(cleanRoot);
    generate(cleanRoot);
    const audit = await auditRepository(cleanRoot);
    if (audit.generatedFiles === 0) {
      throw new Error('GENERATION_NO_PROJECTIONS: clean generation produced no audited projections');
    }
    runs.push({
      beforeFiles,
      files: await snapshot(cleanRoot),
      status: status(cleanRoot),
    });
  }

  const projectionPaths = new Set();
  for (const runResult of runs) {
    for (const path of runResult.files.keys()) {
      if (classifyPath(path, policy) === 'projection') projectionPaths.add(path);
    }
  }
  verifyGenerationState({
    firstBeforeFiles: runs[0].beforeFiles,
    firstFiles: runs[0].files,
    secondBeforeFiles: runs[1].beforeFiles,
    secondFiles: runs[1].files,
    projectionPaths,
    firstStatus: runs[0].status,
    secondStatus: runs[1].status,
  });

  const digest = createHash('sha256');
  for (const [path, fileDigest] of [...runs[0].files].sort(([left], [right]) => left.localeCompare(right))) {
    digest.update(path);
    digest.update('\0');
    digest.update(fileDigest);
    digest.update('\0');
  }

  console.log(
    `[E-G0.0-04] independent clean checkouts ${sourceRevision} generated identical `
      + `projections with clean worktrees (sha256:${digest.digest('hex')})`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const cleanRoot of cleanRoots) {
    spawnSync('git', ['worktree', 'remove', '--force', cleanRoot], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
