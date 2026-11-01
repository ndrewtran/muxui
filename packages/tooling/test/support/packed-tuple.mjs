import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { canonicalJson } from '@muxui/schema';

const run = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../../../..');

/** The publish set, in install order (Decision 0032 item 3). */
export const PACKED_SLUGS = ['schema', 'catalog', 'tooling', 'react'];

/** `pnpm pack` of one workspace package into `destination`, without lifecycle scripts; returns the tarball path. */
export function packWorkspacePackage(slug, destination) {
  const packed = spawnSync('pnpm', [
    '--config.ignore-scripts=true', '--config.engine-strict=false',
    'pack', '--json', '--pack-destination', destination,
  ], { cwd: join(repositoryRoot, 'packages', slug), encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  return JSON.parse(packed.stdout).filename;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Writes `value` as a generated projection, with the provenance sidecar the pnpm adapter verifies. */
export async function writeProjection(path, canonicalPath, value) {
  const bytes = `${canonicalJson(value)}\n`;
  const body = `${canonicalJson({ path: canonicalPath, sha256: sha256(bytes) })}\n`;
  await writeFile(path, bytes);
  await writeFile(
    `${path}.provenance`,
    `// @generated-from: synthetic-g0.4-adapter-fixture\n// @generated-content-sha256: ${sha256(body)}\n${body}`,
  );
}

/**
 * Packs schema, catalog, tooling and React from the checkout and installs them with pnpm into a consumer under the OS
 * temp directory, away from the checkout's `node_modules`. The consumer declares the catalog, React and (for the
 * `muxui` bin) tooling by their packed versions; overrides map every `@muxui/*` name, including the catalog and schema
 * that tooling depends on, to its tarball. Resolution prefers the pnpm cache, so it is offline when the cache is warm.
 *
 * The caller owns the result and must `dispose()` it; only the two directories created here are removed.
 */
export async function installPackedTuple() {
  const tarballs = await mkdtemp(join(tmpdir(), 'muxui-tuple-tarballs-'));
  const root = await mkdtemp(join(tmpdir(), 'muxui-tuple-consumer-'));
  const versions = {};
  try {
    const overrides = {};
    for (const slug of PACKED_SLUGS) {
      const { name, version } = JSON.parse(await readFile(join(repositoryRoot, 'packages', slug, 'package.json'), 'utf8'));
      versions[name] = version;
      overrides[name] = `file:${packWorkspacePackage(slug, tarballs)}`;
    }
    const { packageManager } = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
    await writeFile(join(root, 'package.json'), `${JSON.stringify({
      name: 'packed-tuple-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
      packageManager,
      dependencies: { '@muxui/catalog': versions['@muxui/catalog'], '@muxui/react': versions['@muxui/react'] },
      devDependencies: { '@muxui/tooling': versions['@muxui/tooling'] },
      pnpm: { overrides },
    }, null, 2)}\n`);
    const install = spawnSync('pnpm', [
      'install', '--prefer-offline', '--no-frozen-lockfile', '--ignore-scripts',
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr || install.stdout);
  } catch (error) {
    await Promise.all([tarballs, root].map((path) => rm(path, { recursive: true, force: true })));
    throw error;
  }

  return {
    root,
    /** The packed versions by package name. */
    versions,
    /** Runs the installed `muxui` bin from the consumer; resolves with the exit status and both streams. */
    async muxui(args) {
      try {
        const { stdout, stderr } = await run(join(root, 'node_modules/.bin/muxui'), args, { cwd: root, maxBuffer: 1 << 26 });
        return { status: 0, stdout, stderr };
      } catch (error) {
        if (typeof error.code !== 'number') throw error;
        return { status: error.code, stdout: error.stdout, stderr: error.stderr };
      }
    },
    /**
     * Runs an ES module `script` in the consumer, so its bare imports resolve to the installed packages. The script
     * sees the JSON `input` as a constant and prints its result with `console.log(JSON.stringify(...))`.
     */
    async inConsumer(script, input) {
      const pending = run(process.execPath, [
        '--input-type=module', '-e',
        `import { readFileSync } from 'node:fs';\nconst input = JSON.parse(readFileSync(0, 'utf8'));\n${script}`,
      ], { cwd: root, maxBuffer: 1 << 26 });
      pending.child.stdin.end(JSON.stringify(input));
      const { stdout } = await pending;
      return JSON.parse(stdout.trim().split('\n').at(-1));
    },
    dispose: () => Promise.all([tarballs, root].map((path) => rm(path, { recursive: true, force: true }))),
  };
}
