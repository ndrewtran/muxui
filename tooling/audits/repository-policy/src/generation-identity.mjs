import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
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

/** Runs a command with each output line prefixed by `label`, so concurrent roots stay readable. */
function runLabelled(label, command, args, cwd, failureCode = `${command.toUpperCase()}_FAILED`) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const [stream, sink] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      let pending = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        const lines = (pending + chunk).split('\n');
        pending = lines.pop();
        for (const line of lines) sink.write(`[${label}] ${line}\n`);
      });
      stream.on('end', () => {
        if (pending) sink.write(`[${label}] ${pending}\n`);
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${failureCode}: exit ${code ?? 1}`));
    });
  });
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
const cleanRoots = ['first', 'second'].map((name) => ({ name, path: join(temporaryRoot, name) }));

/** One clean root: install, snapshot, generate, audit, snapshot again. */
async function generateRoot({ name, path }) {
  await runLabelled(name, 'pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], path);
  const beforeFiles = await snapshot(path);
  await runLabelled(
    name,
    process.execPath,
    [resolve(path, 'tooling/audits/repository-policy/src/run-workspace-task.mjs'), 'generate'],
    path,
    'GENERATION_COMMAND_FAILED',
  );
  const audit = await auditRepository(path);
  if (audit.generatedFiles === 0) {
    throw new Error('GENERATION_NO_PROJECTIONS: clean generation produced no audited projections');
  }
  return { beforeFiles, files: await snapshot(path), status: status(path) };
}

try {
  // Worktrees are added one at a time, since git locks the shared repository metadata; the roots then generate concurrently.
  for (const { path } of cleanRoots) {
    run('git', ['worktree', 'add', '--quiet', '--detach', path, sourceRevision], repositoryRoot);
  }
  // Wait for both roots even when one fails, so cleanup never removes a worktree a generation is still using.
  const settled = await Promise.allSettled(cleanRoots.map(generateRoot));
  const failure = settled.find(({ status: outcome }) => outcome === 'rejected');
  if (failure) throw failure.reason;
  const runs = settled.map(({ value }) => value);

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
  for (const { path } of cleanRoots) {
    spawnSync('git', ['worktree', 'remove', '--force', path], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
