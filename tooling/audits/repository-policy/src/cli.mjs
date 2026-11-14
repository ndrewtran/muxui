import { resolve } from 'node:path';

const repositoryRoot = resolve(process.env.MUXUI_REPOSITORY ?? resolve(import.meta.dirname, '../../../..'));

try {
  const { auditRepository } = await import('./policy.mjs');
  const result = await auditRepository(repositoryRoot);
  console.log(
    `[E-G0.0-03] repository policy passed (${result.generatedFiles} projections, `
      + `${result.artifacts} artifacts, ${result.claimedNames} slugs/aliases)`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
