// Generates the prerequisites of a standalone package command, for example
// `node <this file> '@muxui/react...'` in an app's `check` or `build` script.
// The workspace runner and CI generate every prerequisite once, serially,
// before any check and set MUXUI_PREREQUISITES_READY=1, so package commands
// they invoke never write generated output again. The variable is internal:
// never export it by hand, or standalone commands check stale output.
import { spawnSync } from 'node:child_process';

export const prerequisitesReadyVariable = 'MUXUI_PREREQUISITES_READY';

if (import.meta.main) {
  const filter = process.argv[2];
  if (!filter || process.argv.length > 3) {
    console.error('MUXUI_PREREQUISITES_USAGE: pass exactly one pnpm filter, for example @muxui/react...');
    process.exit(2);
  }
  if (process.env[prerequisitesReadyVariable] === '1') {
    console.log(`[prerequisites] ${filter}: already generated for this run`);
    process.exit(0);
  }
  // Nested package commands inherit the flag, so this generates each package once.
  const result = spawnSync('pnpm', ['--filter', filter, 'run', 'generate'], {
    stdio: 'inherit',
    env: { ...process.env, [prerequisitesReadyVariable]: '1' },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
