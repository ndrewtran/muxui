// A mirror of the repository with some files changed, for tests that show a derivation reads the sources it says it reads.
// Every directory on the way to a changed file is a real directory of links to the original, so a write never goes through a link,
// and the changed file is a copy. `readStylingFacts(directory)` then imports the part map and the token core from the mirror.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Runs `run` with the path of a mirror of `repositoryRoot` in which each key of `changes` (a repository-relative path) is the file
 * rewritten by its function, then removes the mirror. A change that leaves its file unchanged fails, so a mutation never silently
 * misses its target.
 * @template T
 * @param {string} repositoryRoot
 * @param {Record<string, (text: string) => string>} changes
 * @param {(directory: string) => Promise<T> | T} run
 * @returns {Promise<T>}
 */
export async function withMirror(repositoryRoot, changes, run) {
  const destination = mkdtempSync(join(tmpdir(), 'muxui-mirror-'));
  try {
    const real = new Set();
    const realize = (relative) => {
      const target = join(destination, relative);
      if (real.has(target)) return;
      if (relative !== '') rmSync(target);
      mkdirSync(target, { recursive: true });
      for (const entry of readdirSync(join(repositoryRoot, relative))) if (entry !== '.git') symlinkSync(join(repositoryRoot, relative, entry), join(target, entry));
      real.add(target);
    };
    realize('');
    for (const [path, edit] of Object.entries(changes)) {
      const segments = path.split('/');
      for (let index = 1; index < segments.length; index += 1) realize(segments.slice(0, index).join('/'));
      const original = readFileSync(join(repositoryRoot, path), 'utf8');
      const changed = edit(original);
      assert.notEqual(changed, original, `${path}: the mutation changes the file`);
      rmSync(join(destination, path));
      writeFileSync(join(destination, path), changed);
    }
    return await run(destination);
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}
