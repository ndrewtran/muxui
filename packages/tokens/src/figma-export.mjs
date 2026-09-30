/*
 * Figma export CLI. Reads the canonical token source at run time and prints
 * either the lossy/unsupported report, the batch plan, or ready-to-run
 * applier scripts. Nothing is written to disk and nothing touches Figma.
 *
 *   pnpm --filter @muxui/tokens figma:export report
 *   pnpm --filter @muxui/tokens figma:export plan
 *   pnpm --filter @muxui/tokens figma:export batch <n>
 *   pnpm --filter @muxui/tokens figma:export scripts
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseJsonStrict } from '@muxui/schema';
import { compileFigmaExport, planFigmaBatches } from './figma.mjs';

const usage = 'usage: figma:export report | plan | batch <n> | scripts';
const [command = 'report', argument] = process.argv.slice(2);
const sourcePath = resolve(import.meta.dirname, '../../../catalog/tokens/default-theme.json');
const source = parseJsonStrict(await readFile(sourcePath, 'utf8'));
const document = compileFigmaExport({ source });

if (command === 'report') {
  console.log(JSON.stringify({ provenance: document.provenance, ...document.report }, null, 2));
} else if (command === 'plan') {
  const batches = planFigmaBatches(document);
  console.log(JSON.stringify({
    provenance: document.provenance,
    collections: document.collections.map(({ name, modes }) => ({ name, modes: modes.map((mode) => mode.name) })),
    batches: batches.map(({ script, ...batch }) => batch),
  }, null, 2));
} else if (command === 'batch') {
  const batches = planFigmaBatches(document);
  const selected = batches[Number(argument) - 1];
  if (!selected) {
    console.error(`batch must be 1..${batches.length}\n${usage}`);
    process.exit(2);
  }
  process.stdout.write(selected.script);
} else if (command === 'scripts') {
  for (const { batch, script } of planFigmaBatches(document)) {
    process.stdout.write(`${batch > 1 ? '\n' : ''}${script}`);
  }
} else {
  console.error(usage);
  process.exit(2);
}
