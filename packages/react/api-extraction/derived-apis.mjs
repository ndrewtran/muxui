/**
 * The committed web.react API projections (Decision 0031): one
 * packages/react/api/<slug>.json per moved component, extracted from tsc's
 * emitted declarations and the component's executable source. Never authored;
 * the catalog compiler merges each into its component's web.react binding,
 * and React generation reads the merged record the same way.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DERIVED_API_SCHEMA, mergeDerivedApis, validateDerivedApi } from '@muxui/schema';
import { extractApis } from './extract.mjs';

/** The components whose web.react API is derived from their TypeScript source. */
export const DERIVED_API_COMPONENTS = Object.freeze([
  { slug: 'button', name: 'Button', source: 'packages/react/src/button.ts' },
  { slug: 'icon-button', name: 'IconButton', source: 'packages/react/src/supplemental/icon-button.ts' },
  { slug: 'select-native', name: 'SelectNative', source: 'packages/react/src/supplemental/select-native.ts' },
  { slug: 'image', name: 'Image', source: 'packages/react/src/supplemental/image.ts' },
  // A compound: its API is that of Avatar.Root, the part the binding's root renders.
  { slug: 'avatar', name: 'Avatar', part: 'Root', source: 'packages/react/src/supplemental/avatar.ts' },
  { slug: 'message', name: 'Message', source: 'packages/react/src/supplemental/message.ts' },
  { slug: 'activity', name: 'Activity', source: 'packages/react/src/supplemental/activity.ts' },
  { slug: 'data-diff', name: 'DataDiff', source: 'packages/react/src/supplemental/data-diff.ts' },
]);

const SOURCE_ROOT = 'packages/react/src/';

function documentText(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Each derived component's document by slug. With `declarationRoot` (the tsc
 * output directory) it extracts them; without one (--list-outputs, which runs
 * no tsc) it reads the committed files.
 */
export async function deriveApis({ packageRoot, repositoryRoot, declarationRoot, components = DERIVED_API_COMPONENTS }) {
  if (components.length === 0) return new Map();
  if (declarationRoot === undefined) {
    return new Map(await Promise.all(components.map(async ({ slug }) => [
      slug,
      validateDerivedApi(JSON.parse(await readFile(resolve(packageRoot, 'api', `${slug}.json`), 'utf8'))),
    ])));
  }
  const apis = extractApis({
    declarationRoot,
    components: components.map(({ name, part, source }) => ({
      name,
      part,
      declarations: resolve(declarationRoot, source.slice(SOURCE_ROOT.length).replace(/\.ts$/u, '.d.ts')),
      source: resolve(repositoryRoot, source),
    })),
  });
  return new Map(components.map(({ slug, name, source }) => [slug, validateDerivedApi({
    schema: DERIVED_API_SCHEMA,
    generatedFrom: source,
    component: `muxui:component:${slug}`,
    binding: 'web.react',
    export: name,
    api: apis.get(name),
  })]));
}

/** The component record with its derived web.react API merged in, when it has one. */
export function withDerivedApi(artifact, documents) {
  const document = documents.get(artifact.id.slice('muxui:component:'.length));
  return document === undefined ? artifact : mergeDerivedApis(artifact, { 'web.react': document });
}

/** Writes packages/react/api/ (or, when `checking`, fails on any drift), holding exactly `documents`. */
export async function syncDerivedApis({ packageRoot, documents, checking }) {
  const directory = resolve(packageRoot, 'api');
  const expected = new Map([...documents].map(([slug, document]) => [`${slug}.json`, documentText(document)]));
  const present = await readdir(directory).catch(() => []);
  if (checking) {
    for (const [name, text] of expected) {
      if (await readFile(resolve(directory, name), 'utf8').catch(() => null) !== text) {
        throw new Error(`MUXUI_REACT_GENERATED_DRIFT: api/${name}`);
      }
    }
    const unexpected = present.filter((name) => !expected.has(name));
    if (unexpected.length > 0) throw new Error(`MUXUI_REACT_GENERATED_DRIFT: api/${unexpected[0]} is not a derived API output`);
    return;
  }
  if (expected.size > 0) await mkdir(directory, { recursive: true });
  for (const [name, text] of expected) await writeFile(resolve(directory, name), text);
  for (const name of present.filter((entry) => !expected.has(entry))) await rm(resolve(directory, name), { recursive: true, force: true });
  if (expected.size === 0) await rm(directory, { recursive: true, force: true });
}
