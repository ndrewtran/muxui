/**
 * generated/ is one flat directory: src/x.mjs and src/<dir>/x.mjs ship as x.mjs,
 * src/<dir>/index.(mjs|js|ts) as <dir>.(mjs|js), and a TypeScript source as its emitted
 * x.js and x.d.ts. Module specifiers are found by parsing each module, so text in
 * comments, strings, and templates that only looks like an import is never rewritten.
 */
import { posix } from 'node:path';
import { parseAst } from 'vite';

const RELATIVE = /^\.{1,2}\//u;
// A specifier that names a file rather than a package: relative or absolute.
const PATH = /^\.{0,2}\//u;

/**
 * The flat name a source module ships as. A subdirectory's index takes the directory's name
 * whatever its extension (`markdown/index.ts` and an emitted `../markdown/index.js` specifier
 * both give `markdown.js`), so two subpath modules never share the root barrel's `index`.
 */
export function flatModuleName(sourcePath) {
  const file = posix.basename(sourcePath);
  const directory = posix.basename(posix.dirname(sourcePath));
  const name = /^index\.(?:mjs|js|ts)$/u.test(file) && directory !== 'src' ? file.replace(/^index/u, directory) : file;
  return name.replace(/\.ts$/u, '.js');
}

const langOf = (path) => (/\.d\.m?ts$/u.test(path) ? 'dts' : /\.m?ts$/u.test(path) ? 'ts' : 'js');

// The specifier node of every static import, re-export, dynamic import, type-level
// import('...'), and `import x = require('...')` in a module.
export function moduleSpecifiers(text, lang, label) {
  let program;
  try {
    program = parseAst(text, { lang });
  } catch (error) {
    throw new Error(`MUXUI_REACT_FLAT_IMPORT_UNPARSED: ${label}: ${error.message}`);
  }
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration':
        if (node.source) found.push(node.source);
        break;
      case 'ImportExpression': found.push(node.source); break;
      case 'TSImportType': found.push(node.source); break;
      case 'TSExternalModuleReference': found.push(node.expression); break;
      default: break;
    }
    for (const value of Object.values(node)) if (value !== null && typeof value === 'object') visit(value);
  };
  visit(program);
  return found;
}

// A specifier written as a string or a template without substitutions, with the span of its text.
export function literalSpecifier(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return { value: node.value, start: node.start + 1, end: node.end - 1 };
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    const [quasi] = node.quasis;
    return { value: quasi.value.cooked, start: quasi.start, end: quasi.end };
  }
  return null;
}

/**
 * Rewrites each relative specifier in a shipped module to the flat name of the module it
 * resolves to. `lang` defaults from the source path; an emitted module names its own.
 */
export function flattenImports(sourcePath, text, lang = langOf(sourcePath)) {
  const edits = moduleSpecifiers(text, lang, sourcePath)
    .map(literalSpecifier)
    .filter((specifier) => specifier !== null && RELATIVE.test(specifier.value))
    .sort((left, right) => right.start - left.start);
  let flattened = text;
  for (const { value, start, end } of edits) {
    flattened = `${flattened.slice(0, start)}./${flatModuleName(posix.join(posix.dirname(sourcePath), value))}${flattened.slice(end)}`;
  }
  return flattened;
}

/**
 * Every file a generated module imports must ship beside it as `./<name>`; a declaration
 * file names a sibling .d.ts by its .js specifier. A dynamic import must be a literal,
 * so no relative target can hide in an expression.
 */
export function assertFlatImports(outputs) {
  for (const [name, text] of outputs) {
    const lang = name.endsWith('.d.ts') ? 'dts' : /\.m?js$/u.test(name) ? 'js' : null;
    if (lang === null || text === '') continue;
    for (const node of moduleSpecifiers(text, lang, `generated/${name}`)) {
      const specifier = literalSpecifier(node);
      if (specifier === null) throw new Error(`MUXUI_REACT_FLAT_IMPORT_DYNAMIC: generated/${name} imports a computed specifier`);
      if (!PATH.test(specifier.value)) continue;
      const target = specifier.value.slice(2);
      const shipped = specifier.value.startsWith('./') && !target.includes('/') && (name.endsWith('.d.ts')
        ? target.endsWith('.js') && outputs.has(`${target.slice(0, -3)}.d.ts`)
        : outputs.has(target));
      if (!shipped) throw new Error(`MUXUI_REACT_FLAT_IMPORT_UNSHIPPED: generated/${name} imports ${specifier.value}`);
    }
  }
}
