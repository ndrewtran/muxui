import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const appRoot = resolve(import.meta.dirname, '..');
const output = await mkdtemp(join(tmpdir(), 'muxui-scale-build-'));

// Validate the production bundle without retaining a second source projection.
try {
  await build({ root: appRoot, build: { outDir: output, emptyOutDir: true } });
  const tests = (await readdir(join(appRoot, 'test')))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join(appRoot, 'test', name));
  process.exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, ['--test', ...tests], { cwd: appRoot, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolveExit(code ?? 1));
  });
} finally {
  await rm(output, { recursive: true, force: true });
}
