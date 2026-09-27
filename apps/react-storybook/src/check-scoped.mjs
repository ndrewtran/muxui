import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { resolveStorybookPageSelection } from '../test/storybook-page-selection.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const testFiles = Object.freeze({
  selection: 'test/storybook-page-selection.test.mjs',
  a11y: 'test/storybook-a11y.test.mjs',
  colours: 'test/storybook-colors.test.mjs',
});

export function scopedStorybookCheckPlan(selection) {
  if (selection.proof === 'full') return { command: 'pnpm', args: ['check'], label: 'full package audit' };

  const files = [testFiles.selection];
  let testNamePattern;
  if (selection.proof === 'story' || selection.proof === 'component') {
    files.push(testFiles.a11y, testFiles.colours);
    const selectedPageTests = selection.pages.some(({ id }) => id === 'muxui-react-r1-2-number-field--sizing')
      ? ['NumberField sizing story computes fit-content, 12rem, and full container widths']
      : [];
    testNamePattern = [
      'storybook page|storybook scoped check runner',
      'selected Mux UI React Storybook pages are axe-clean in light and dark',
      ...selectedPageTests,
      'Storybook colour audit recognizes canonical token mixes and shadow-only focus opacity',
      'selected Storybook pages paint only canonical Mux colours in light and dark',
    ].join('|');
  } else if (selection.proof === 'theme') {
    files.push(testFiles.a11y);
    files.push(testFiles.colours);
    testNamePattern = [
      'storybook page|storybook scoped check runner',
      'all selected Storybook pages meet theme contrast in light and dark',
      'Storybook colour audit recognizes canonical token mixes and shadow-only focus opacity',
      'selected Storybook pages paint only canonical Mux colours in light and dark',
    ].join('|');
  } else if (selection.proof === 'chrome') {
    files.push(testFiles.colours);
    testNamePattern = [
      'storybook page|storybook scoped check runner',
      'Storybook manager and docs paint only canonical Mux colours in light and dark',
    ].join('|');
  } else {
    throw new Error(`MUXUI_STORYBOOK_AUDIT_PROOF_UNKNOWN: ${selection.proof}`);
  }

  return {
    command: process.execPath,
    args: [
      '--test',
      '--test-concurrency=1',
      `--test-name-pattern=${testNamePattern}`,
      ...files,
    ],
    label: `${selection.proof} proof (${selection.pages.length} selected pages)`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!process.env.MUXUI_STORYBOOK_AUDIT_PROOF) {
    throw new Error('MUXUI_STORYBOOK_AUDIT_PROOF_REQUIRED: choose a scoped proof or set proof=full explicitly');
  }
  const selection = resolveStorybookPageSelection();
  const plan = scopedStorybookCheckPlan(selection);
  process.stdout.write(`[storybook-check] ${plan.label}\n`);
  const result = spawnSync(plan.command, plan.args, {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
