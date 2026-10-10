import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const packageRoot = resolve(import.meta.dirname, '..');
const run = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, npm_config_engine_strict: 'false' } });

// The tarball carries only package files, so an exported module that imports
// anything outside the package fails for consumers even when workspace tests pass.
test('the packed authoring export imports from an unpacked tarball without repository files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muxui-tokens-packed-'));
  try {
    const packed = run('pnpm', ['pack', '--pack-destination', directory], packageRoot);
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const consumer = join(directory, 'consumer');
    const installed = join(consumer, 'node_modules/@muxui/tokens');
    await mkdir(installed, { recursive: true });
    const extracted = run('tar', ['-xzf', join(directory, 'muxui-tokens-2.0.0.tgz'), '--strip-components=1', '-C', installed], directory);
    assert.equal(extracted.status, 0, extracted.stderr);
    // The only runtime dependency of the authoring export is culori; link the workspace copy.
    await symlink(await realpath(join(packageRoot, 'node_modules/culori')), join(consumer, 'node_modules/culori'));
    const script = "const authoring = await import('@muxui/tokens/authoring'); console.log(typeof authoring.compileScalePresetTheme, typeof authoring.validateThemeAuthoringDocument);";
    const imported = run(process.execPath, ['--input-type=module', '--eval', script], consumer);
    assert.equal(imported.status, 0, imported.stderr || imported.stdout);
    assert.equal(imported.stdout.trim(), 'function function');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
