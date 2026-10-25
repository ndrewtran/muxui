// Source guards behind the state attribute rename (Decision 0031 item 19), called from styling-tokens.test.mjs. They
// read the TypeScript syntax tree (typescript-6, which has the JS API), not text, and take source text so a control can
// feed a mutant to the same function the real check uses.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript-6';

/**
 * The React Aria versions whose DOM readers were audited for the rename (the audit is in PR 2 of the Stage 2 plan:
 * the one closed-list state a dependency reads from the DOM is `data-placeholder`, on date segments). Bumping any of
 * them fails the guard until someone repeats the audit and updates this table; `react-stately` is not a direct
 * dependency, so it is resolved through React Aria Components.
 */
export const auditedReactAria = Object.freeze({
  'react-aria-components': '1.20.0',
  'react-aria': '3.51.0',
  'react-stately': '3.49.0',
});

/** What is wrong with the declared and installed React Aria versions, given the package manifest path. */
export function reactAriaVersionProblems(manifestPath, audited = auditedReactAria) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const resolveFrom = (from, name) => JSON.parse(readFileSync(createRequire(from).resolve(`${name}/package.json`), 'utf8')).version;
  const racManifest = createRequire(manifestPath).resolve('react-aria-components/package.json');
  const problems = [];
  for (const [name, version] of Object.entries(audited)) {
    const declared = manifest.dependencies[name];
    if (declared !== undefined && declared !== version) problems.push(`${name} is declared as ${declared}, audited at ${version}`);
    const installed = resolveFrom(name === 'react-stately' ? racManifest : manifestPath, name);
    if (installed !== version) problems.push(`${name} is installed at ${installed}, audited at ${version}`);
  }
  return problems;
}

const parse = (text) => ts.createSourceFile('substrate.ts', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const builders = new Set(['withMuxState', 'withMuxListBoxState']);

/**
 * What is wrong with src/substrate.ts, and the React Aria exports it wraps. Every export must be an `Aria<Name>`
 * constant built by `withMuxState` or `withMuxListBoxState` from one `RAC.<Name>`, marked `/** @internal *\/` and
 * `/*#__PURE__*\/`; a raw re-export (`export const AriaDateInput = RAC.DateInput`), another kind of export or a wrapper
 * of the wrong component is a finding. A component left raw renders the React Aria state names.
 */
export function substrateWrappers(text) {
  const sf = parse(text);
  const problems = [];
  const wrapped = [];
  for (const statement of sf.statements) {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      problems.push(`line ${lineOf(sf, statement)}: an export that is not a wrapper declaration`);
      continue;
    }
    if (!ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (!ts.isVariableStatement(statement)) {
      problems.push(`line ${lineOf(sf, statement)}: an exported ${ts.SyntaxKind[statement.kind]}; only Aria wrappers are exported`);
      continue;
    }
    const comments = text.slice(statement.getFullStart(), statement.getStart(sf));
    for (const declaration of statement.declarationList.declarations) {
      const name = ts.isIdentifier(declaration.name) ? declaration.name.text : '';
      const where = `line ${lineOf(sf, declaration)} ${name}`;
      const init = declaration.initializer;
      if (!/^Aria[A-Z]/u.test(name)) problems.push(`${where}: not named Aria<Name>`);
      if (!/@internal/u.test(comments)) problems.push(`${where}: no @internal comment`);
      if (!/\/\*#__PURE__\*\//u.test(text.slice(declaration.getFullStart(), init?.getStart(sf) ?? declaration.getEnd()))) problems.push(`${where}: no /*#__PURE__*/ annotation`);
      if (!init || !ts.isCallExpression(init) || !ts.isIdentifier(init.expression) || !builders.has(init.expression.text)) {
        problems.push(`${where}: not built by withMuxState or withMuxListBoxState`);
        continue;
      }
      const target = init.arguments[0];
      if (!target || !ts.isPropertyAccessExpression(target) || !ts.isIdentifier(target.expression) || target.expression.text !== 'RAC') {
        problems.push(`${where}: does not wrap a React Aria export`);
        continue;
      }
      if (name !== `Aria${target.name.text.replace(/^UNSTABLE_/u, '')}`) problems.push(`${where}: wraps ${target.name.text}`);
      if (init.expression.text === 'withMuxState' && init.arguments.length < 2) problems.push(`${where}: no element`);
      wrapped.push(target.name.text);
    }
  }
  for (const component of wrapped.filter((name, index) => wrapped.indexOf(name) !== index)) problems.push(`${component} is wrapped twice`);
  return { problems, wrapped };
}
