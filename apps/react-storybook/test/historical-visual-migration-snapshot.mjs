import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { appRoot } from '../src/visual-migration.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(appRoot, '../..');
export const historicalVisualMigrationCommit = 'e3b17be2d35631ee7ceae8ae63405860d1c8729f';

const historicalMuxuiSourcePaths = Object.freeze([
  'apps/react-storybook/src/migration-visual.fixture.mjs',
  'apps/react-storybook/src/storybook-factory.mjs',
  'apps/react-storybook/src/visual-migration-fixture-map.mjs',
  'apps/react-storybook/test/run-visual-migration.mjs',
]);

async function gitOutput(args, options = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    ...options,
  });
  return stdout;
}

async function historicalBlob(path) {
  await gitOutput(['cat-file', '-e', `${historicalVisualMigrationCommit}:${path}`]);
  const { stdout } = await execFileAsync('git', ['show', `${historicalVisualMigrationCommit}:${path}`], {
    cwd: repositoryRoot,
    encoding: 'buffer',
  });
  const blobSha = createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${stdout.byteLength}\0`, 'utf8'), stdout]))
    .digest('hex');
  const expectedSha = (await gitOutput(['rev-parse', `${historicalVisualMigrationCommit}:${path}`])).trim();
  if (blobSha !== expectedSha) throw new Error(`historical Git blob verification failed for ${path}`);
  return stdout;
}

async function historicalGeneratedPaths() {
  const output = await gitOutput([
    'ls-tree', '-r', '--name-only', historicalVisualMigrationCommit, '--', 'packages/react/generated',
  ]);
  const paths = output.trim().split('\n').filter(Boolean);
  if (paths.length !== 28) throw new Error(`historical generated React tree must contain 28 files, found ${paths.length}`);
  return paths;
}

async function writeHistoricalFile(stagingRoot, path, bytes) {
  const target = join(stagingRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

/**
 * Stage the exact pinned Mux source tree beside the current sealed migration
 * artifacts. Production validators then run unchanged against this temporary
 * repository root, proving historical evidence without resealing it.
 */
export async function stageHistoricalVisualMigrationRoot() {
  const stagingRoot = await mkdtemp(join('/tmp', 'muxui-historical-visual-migration-'));
  try {
    const stagedAppRoot = join(stagingRoot, 'apps/react-storybook');
    await cp(resolve(appRoot, 'visual-migration'), join(stagedAppRoot, 'visual-migration'), { recursive: true });

    const paths = [...historicalMuxuiSourcePaths, ...(await historicalGeneratedPaths())];
    for (const path of paths) await writeHistoricalFile(stagingRoot, path, await historicalBlob(path));

    return {
      appRoot: stagedAppRoot,
      async cleanup() {
        await rm(stagingRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}
