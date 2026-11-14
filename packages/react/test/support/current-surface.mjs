// The public surface of the current build, read by the TypeScript checker from the declarations `pnpm generate` wrote:
// for each typed entry of the package's export map, the exported type names, the exported value names, and the static
// parts of exported components at any depth (`Sidebar.Provider`). Tests that hold a projection (the declaration
// reference, the Docs pages) to what the package ships derive their expectation from here, independently of the reader
// that wrote the projection.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SignatureKind, SymbolFlags } from 'typescript/unstable/sync';
import { exportedDeclarations, withDeclarationProject } from './declaration-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');
// Bundler resolution reads the package export map the way a packed consumer does.
const PROJECT_OPTIONS = { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', skipLibCheck: false };
// The depth static parts are followed to (`Sidebar.AccountCard.Something`); a cycle stops sooner.
const MAX_PART_DEPTH = 4;

let cached;

/**
 * `{ [entry]: { types, values, parts } }` for every typed entry of the export map, in export-map order, each list sorted.
 * The package is copied with its export map into a scratch directory beside one copy of the React types, so its
 * self-imports (`@muxui/react`) resolve into it. Read once per process.
 */
export function currentSurface() {
  if (cached) return cached;
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'muxui-current-surface-')));
  try {
    const { name, version, exports } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    const directory = join(root, 'package');
    mkdirSync(join(directory, 'generated'), { recursive: true });
    writeFileSync(join(directory, 'package.json'), `${JSON.stringify({ name, version, type: 'module', exports })}\n`);
    for (const file of readdirSync(join(packageRoot, 'generated')).filter((entry) => entry.endsWith('.d.ts'))) {
      writeFileSync(join(directory, 'generated', file), readFileSync(join(packageRoot, 'generated', file)));
    }
    mkdirSync(join(root, 'node_modules/@types'), { recursive: true });
    for (const types of ['react', 'react-dom']) symlinkSync(resolve(packageRoot, 'node_modules/@types', types), join(root, 'node_modules/@types', types), 'junction');
    const classify = join(root, 'classify.ts');
    writeFileSync(classify, "import type { JSXElementConstructor } from 'react';\nexport type Component = JSXElementConstructor<never>;\n");
    const entries = Object.entries(exports)
      .filter(([, target]) => typeof target?.types === 'string')
      .map(([key, target]) => ({ key, path: join(directory, target.types) }));

    cached = withDeclarationProject({ files: [classify, ...entries.map(({ path }) => path)], directory: root, compilerOptions: PROJECT_OPTIONS }, ({ checker, program }) => {
      const [componentSymbol] = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(classify)));
      const componentType = checker.getDeclaredTypeOfSymbol(componentSymbol);
      // A component is an uppercase name a JSX tag can use that React accepts as an element constructor.
      const isComponent = (memberName, type) => /^[A-Z]/u.test(memberName) && checker.isTypeAssignableTo(checker.getNonNullableType(type), componentType);
      const walkParts = (parts, type, path, seen) => {
        if (path.length > MAX_PART_DEPTH || seen.has(type.id)) return;
        seen.add(type.id);
        for (const property of checker.getPropertiesOfType(type)) {
          if (!/^[A-Z]/u.test(property.name)) continue;
          const declared = checker.getTypeOfSymbol(property);
          const propertyType = declared && checker.getNonNullableType(declared);
          if (!propertyType) continue;
          const partPath = [...path, property.name];
          if (isComponent(property.name, propertyType)) parts.add(partPath.join('.'));
          if (isComponent(property.name, propertyType) || checker.getSignaturesOfType(propertyType, SignatureKind.Call).length === 0) walkParts(parts, propertyType, partPath, seen);
        }
      };
      const surface = {};
      for (const { key, path } of entries) {
        const lists = { types: new Set(), values: new Set(), parts: new Set() };
        for (const exported of checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(path)))) {
          const { symbol } = exportedDeclarations(checker, exported);
          if (symbol.flags & SymbolFlags.Type) lists.types.add(exported.name);
          if (symbol.flags & SymbolFlags.Value) {
            lists.values.add(exported.name);
            walkParts(lists.parts, checker.getTypeOfSymbol(symbol), [exported.name], new Set());
          }
        }
        surface[key] = Object.fromEntries(Object.entries(lists).map(([list, names]) => [list, [...names].sort()]));
      }
      return surface;
    });
    return cached;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
