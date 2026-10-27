// Tier 1 of the styling emission proof, shared: every canonical React example of the catalog, server-rendered once. The examples are
// TSX that import `@muxui/react`, so a module hook transpiles them in process and resolves their bare imports from this package.
// The emission test reads the HTML for the part map's rows; the styling reference reads the same HTML as the observations behind
// its element tags, companion hooks and Rendered DOM, so both stand on one render.
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ts from 'typescript-6';
import { classGrammar } from './class-vocabulary.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../..');

/** Runs `render` with console.error and console.warn captured: a React warning or an exception is returned, never swallowed. */
export function captured(render) {
  const messages = [];
  const { error, warn } = console;
  console.error = (...arguments_) => messages.push(String(arguments_[0]).slice(0, 160));
  console.warn = (...arguments_) => messages.push(String(arguments_[0]).slice(0, 160));
  let html = '';
  try {
    html = render();
  } catch (caught) {
    messages.push(`threw: ${String(caught?.message ?? caught).slice(0, 160)}`);
  } finally {
    console.error = error;
    console.warn = warn;
  }
  return { html, messages };
}

/**
 * Server-renders every canonical example of the given catalog families, in family and file order.
 * `source` is the repository-relative example file; `owned` is the Mux classes the example styles for itself in a <style> block.
 * @param {readonly string[]} slugs The catalog family slugs.
 * @returns {Promise<{ family: string, name: string, source: string, html: string, errors: string[], owned: Set<string> }[]>}
 */
export async function renderCatalogExamples(slugs) {
  const anchor = pathToFileURL(resolve(packageRoot, 'test/anchor.mjs')).href;
  const catalogUrl = pathToFileURL(resolve(repositoryRoot, 'catalog')).href;
  const hooks = registerHooks({
    resolve: (specifier, context, next) => next(specifier, context.parentURL?.startsWith(catalogUrl) && !/^[./]/u.test(specifier) ? { ...context, parentURL: anchor } : context),
    load(url, context, next) {
      if (!url.endsWith('.tsx') || !url.startsWith(catalogUrl)) return next(url, context);
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
      return { format: 'module', shortCircuit: true, source };
    },
  });
  const examples = [];
  try {
    for (const family of slugs) {
      const directory = resolve(repositoryRoot, `catalog/components/${family}/examples/react`);
      for (const file of (await readdir(directory)).filter((name) => name.endsWith('.tsx')).sort()) {
        const path = resolve(directory, file);
        const text = await readFile(path, 'utf8');
        const module = await import(pathToFileURL(path).href);
        const Example = Object.values(module).find((value) => typeof value === 'function');
        if (!Example) throw new Error(`${family}/${file} exports no component`);
        // A class the example styles for itself in a <style> block is the example's, not Mux's.
        const owned = new Set([...text.matchAll(/\.(muxui-[a-z0-9-]+)/gu)].map(([, name]) => name).filter((name) => !classGrammar(slugs)(name)));
        const { html, messages } = captured(() => renderToString(React.createElement(Example)));
        examples.push({ family, name: `${family}/${file.replace(/\.tsx$/u, '')}`, source: `catalog/components/${family}/examples/react/${file}`, html, errors: messages, owned });
      }
    }
  } finally {
    hooks.deregister();
  }
  return examples;
}
