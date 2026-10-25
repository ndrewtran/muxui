import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { compileTailwindConsumer } from '../../../packages/tokens/src/tailwind.mjs';

const fixtureRoot = resolve(import.meta.dirname);
const run = (command, args, options) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${stderr}`)));
});

const tempRoot = await mkdtemp(join(fixtureRoot, '.tmp-'));
const inputPath = join(tempRoot, 'input.css');
const outputPath = join(tempRoot, 'output.css');
// The consumer declares its own layer order first; Mux's stylesheet declares the same three layers itself.
const layerOrder = '@layer theme, base, muxui.tokens, muxui.components, muxui.utilities, components, utilities;';
// The consumer assigns a theme variable and reads it through Tailwind utilities. This proves the assignment and the
// utilities compile. That a Mux Button follows the Button component variables is proven by the React package's browser tests.
const input = `${layerOrder}\n@import "tailwindcss";\n${compileTailwindConsumer(source, { muxuiCss: '@import "../../../../packages/react/generated/styles.css";' })}\n@layer components { .consumer-button { --muxui-component-button-background: #7c3aed; @apply bg-muxui-component-button-background text-muxui-component-button-foreground rounded-muxui-component-button-radius font-muxui-reference-typography-body-font leading-muxui-semantic-typography-body-line-height ease-muxui-reference-motion-easing-linear duration-muxui-reference-motion-duration-fast text-muxui-semantic-typography-body-size tracking-muxui-semantic-typography-display-letter-spacing font-muxui-semantic-typography-body-weight shadow-muxui-reference-effect-shadow-m; } }\n`;
await writeFile(inputPath, input);
await run('pnpm', ['exec', 'tailwindcss', '-i', inputPath, '-o', outputPath, '--minify'], { cwd: fixtureRoot });
const output = await readFile(outputPath, 'utf8');
assert.match(output, /\.consumer-button\{[^}]*--muxui-component-button-background:#7c3aed/u);
assert.match(output, /background-color:var\(--muxui-component-button-background\)/u);
assert.match(output, /color:var\(--muxui-component-button-foreground\)/u);
assert.match(output, /border-radius:var\(--muxui-component-button-radius\)/u);
assert.match(output, /font-family:var\(--muxui-reference-typography-body-font\)/u);
assert.match(output, /transition-timing-function:var\(--muxui-reference-motion-easing-linear\)/u);
assert.match(output, /transition-duration:var\(--muxui-reference-motion-duration-fast\)/u);
assert.match(output, /font-size:var\(--muxui-semantic-typography-body-size\)/u);
assert.match(output, /font-weight:var\(--muxui-semantic-typography-body-weight\)/u);
assert.match(output, /letter-spacing:var\(--muxui-semantic-typography-display-letter-spacing\)/u);
assert.match(output, /line-height:var\(--muxui-semantic-typography-body-line-height\)/u);
assert.ok(output.includes('.muxui-button'));
// Tailwind's minifier folds the order statement into block order, so the consumer's order shows as the
// blocks' order: Mux's layers sit between Tailwind's base and its components and utilities.
const layerBlocks = ['theme', 'base', 'muxui.tokens', 'muxui.components', 'components', 'utilities'].map((name) => output.indexOf(`@layer ${name}{`));
assert.ok(layerBlocks.every((index, at) => index >= 0 && (at === 0 || index > layerBlocks[at - 1])), layerBlocks.join(','));
assert.ok(output.indexOf('@layer components{') < output.indexOf('.consumer-button{'));
assert.ok(!output.includes('muxui.muxui'));
await rm(tempRoot, { recursive: true, force: true });
console.log('[tailwind-consumer] compiled isolated Tailwind 4.1.13 consumer with Mux variables and a consumer theme-variable override');
