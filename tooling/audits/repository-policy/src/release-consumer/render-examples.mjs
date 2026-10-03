// Server half of the packed SSR/hydration proof. Run from a clean consumer:
// `node render-examples.mjs <plan.json> <result.json>`. Renders every planned
// component with react-dom/server and records markup for the hydration half.
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

const [planPath, resultPath] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

const exportKeys = {};
for (const specifier of plan.exportModules) exportKeys[specifier] = Object.keys(await import(specifier)).sort();

const renders = [];
const failures = [];
const started = performance.now();
for (const { file, components } of plan.modules) {
  const module = await import(pathToFileURL(resolve(file)).href);
  const names = components ?? Object.keys(module).filter((name) => typeof module[name] === 'function');
  if (names.length === 0) failures.push(`${file}: no component export`);
  for (const name of names) {
    const id = `${file}#${name}`;
    const renderStarted = performance.now();
    try {
      const html = renderToString(React.createElement(module[name]));
      renders.push({ id, file, name, html, milliseconds: performance.now() - renderStarted, covers: module.fixtureCoverage?.[name] ?? [] });
    } catch (error) {
      failures.push(`${id}: ${error?.stack ?? error}`);
    }
  }
}
const ssrMilliseconds = performance.now() - started;

let valueExports = [];
if (plan.valueChecks) {
  try {
    valueExports = (await import(pathToFileURL(resolve(plan.valueChecks.file)).href))[plan.valueChecks.name]();
  } catch (error) {
    failures.push(`${plan.valueChecks.file}: ${error?.message ?? error}`);
  }
}

writeFileSync(resultPath, `${JSON.stringify({ exportKeys, renders, failures, ssrMilliseconds, valueExports })}\n`);
if (failures.length !== 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
