/*
 * Figma component export CLI. Measures the admitted families in headless
 * Chrome, runs the mode-consistency audit, compiles the component spec, and
 * prints the coverage report, the batch plan, or one ready-to-run applier
 * script. Nothing is written to disk and nothing touches Figma.
 *
 *   pnpm --filter @muxui/figma figma:components report
 *   pnpm --filter @muxui/figma figma:components plan
 *   pnpm --filter @muxui/figma figma:components batch <n>
 *
 * Requires `pnpm generate --package @muxui/react` and Chrome (or
 * MUXUI_CHROME_EXECUTABLE), as the React browser tests do.
 */
import { anatomies } from './anatomy/index.mjs';
import { loadAnatomySources, resolveAnatomy } from './anatomy.mjs';
import { assertModeConsistency, auditSummary } from './audit.mjs';
import { planComponentBatches } from './batches.mjs';
import { loadTokenSource, measureFamilies } from './measure.mjs';
import { bindingCoverageErrors, compileComponentSpec } from './spec.mjs';

const usage = 'usage: figma:components report | plan | batch <n>';
const [command = 'report', argument] = process.argv.slice(2);
if (!['report', 'plan', 'batch'].includes(command)) {
  console.error(usage);
  process.exit(2);
}

const resolvedFamilies = [];
for (const anatomy of anatomies) resolvedFamilies.push(resolveAnatomy(anatomy, await loadAnatomySources(anatomy)));
const measurements = await measureFamilies(resolvedFamilies);
try {
  assertModeConsistency(measurements);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const { source } = await loadTokenSource();
const spec = compileComponentSpec({ resolvedFamilies, measurements, source });
const unbound = bindingCoverageErrors(spec);
if (unbound.length) {
  console.error(`MUXUI_FIGMA_BINDING_COVERAGE: ${unbound.length} painted fields are unbound\n${JSON.stringify(unbound, null, 2)}`);
  process.exit(1);
}

if (command === 'report') {
  console.log(JSON.stringify({ provenance: spec.provenance, audit: auditSummary(measurements), coverage: spec.coverage }, null, 2));
} else {
  const batches = planComponentBatches(spec);
  if (command === 'plan') {
    console.log(JSON.stringify({ provenance: spec.provenance, batches: batches.map(({ script, ...batch }) => batch) }, null, 2));
  } else {
    const selected = batches[Number(argument) - 1];
    if (!selected) {
      console.error(`batch must be 1..${batches.length}\n${usage}`);
      process.exit(2);
    }
    process.stdout.write(selected.script);
  }
}
