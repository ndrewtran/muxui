import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFlatImports, flattenImports } from '../src/flat-modules.mjs';

test('flattening rewrites only real import, export, and dynamic-import specifiers', () => {
  const source = `import { Button } from /* the moved component */ '../button.ts';
import './side-effect.mjs';
export { Menu } from "../menu/index.mjs";
export * from './candidate-motion.mjs';
export * as motion from '../motion.mjs';
const lazy = () => import(\`./code-block-highlight.mjs\`);
const listed = import(/* chunk */ './listbox-motion.mjs');
// import { Hidden } from '../hidden.mjs';
const text = "import { Fake } from '../fake.mjs'";
const template = \`export * from '../template.mjs' \${text}\`;
`;
  assert.equal(flattenImports('packages/react/src/supplemental/index.mjs', source), `import { Button } from /* the moved component */ './button.js';
import './side-effect.mjs';
export { Menu } from "./menu.mjs";
export * from './candidate-motion.mjs';
export * as motion from './motion.mjs';
const lazy = () => import(\`./code-block-highlight.mjs\`);
const listed = import(/* chunk */ './listbox-motion.mjs');
// import { Hidden } from '../hidden.mjs';
const text = "import { Fake } from '../fake.mjs'";
const template = \`export * from '../template.mjs' \${text}\`;
`);
  // Declarations parse as TypeScript, including type-only imports and import types.
  const declarations = "import type { ButtonProps } from '../button.js';\nexport type Lazy = typeof import('../menu/index.mjs');\nexport type { ButtonProps };\n";
  assert.equal(flattenImports('packages/react/src/supplemental/index.d.ts', declarations),
    "import type { ButtonProps } from './button.js';\nexport type Lazy = typeof import('./menu.mjs');\nexport type { ButtonProps };\n");
});

test('every generated module imports only shipped flat files, through literal specifiers', () => {
  const shipped = (entries) => new Map([['menu.mjs', ''], ['button.js', 'export {};'], ['button.d.ts', 'export {};'], ...entries]);
  assertFlatImports(shipped([
    ['index.mjs', "import { Menu } from './menu.mjs';\nexport * from './button.js';\nimport('react');\nconst text = \"import './missing.mjs'\";\n"],
    ['index.d.ts', "export type { ButtonProps } from './button.js';\nexport type Lazy = typeof import('./button.js');\n"],
  ]));
  const rejects = (name, text, pattern) => assert.throws(() => assertFlatImports(shipped([[name, text]])), pattern);
  rejects('index.mjs', "import { Gone } from /* moved */ './gone.mjs';\n", /MUXUI_REACT_FLAT_IMPORT_UNSHIPPED: generated\/index\.mjs imports \.\/gone\.mjs/u);
  rejects('index.mjs', 'export * from "../src/menu.mjs";\n', /UNSHIPPED: generated\/index\.mjs imports \.\.\/src\/menu\.mjs/u);
  rejects('index.mjs', 'const later = import(`./gone.mjs`);\n', /UNSHIPPED: generated\/index\.mjs imports \.\/gone\.mjs/u);
  rejects('index.d.ts', "export type Lazy = typeof import('./menu.mjs');\n", /UNSHIPPED: generated\/index\.d\.ts imports \.\/menu\.mjs/u);
  for (const computed of ['import(`./${name}.mjs`)', "import('./' + name)", 'import(name)']) {
    rejects('index.mjs', `const name = 'menu';\nconst later = ${computed};\n`, /MUXUI_REACT_FLAT_IMPORT_DYNAMIC: generated\/index\.mjs imports a computed specifier/u);
  }
});
