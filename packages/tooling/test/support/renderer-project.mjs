import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { canonicalJson } from '@muxui/schema';
import { writeProjection } from './packed-tuple.mjs';

export async function writeJson(path, value) {
  await writeFile(path, `${canonicalJson(value)}\n`);
}

const tokenDigest = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const safetyDigest = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

/**
 * The renderer descriptor and catalog identity for a renderer that installs `installed` of the catalog's `bindings` (web.react
 * binding refs). Like the real catalog, the release lists every binding; a renderer that lacks one is simply missing it.
 */
function rendererDocuments(bundle, bindings, installed) {
  const artifactOf = (binding) => bundle.artifacts.find(({ id }) => id === binding.split('#')[0]);
  const specRevisionOf = (binding) => artifactOf(binding).bindingSpecRevisions[binding.split('#')[1]];
  const descriptor = {
    id: 'renderer-react-compatible',
    descriptorVersion: '1.0.0',
    package: '@muxui/react',
    version: '1.0.1',
    bindingSchemaRange: '^4.0.0',
    tokenContractRange: '^2.0.0',
    bindings: Object.fromEntries(installed.map((binding) => {
      const [id] = binding.split('#');
      return [binding, {
        specRevision: specRevisionOf(binding),
        export: `@muxui/react/${id.split(':').at(-1)}#${artifactOf(binding).name}`,
        lifecycle: 'experimental',
        strategy: 'direct',
        tokenRequirementSetDigests: { 'web.react': tokenDigest },
        platformSafetyRequirementSetDigests: { 'web.react': safetyDigest },
      }];
    })),
  };
  const identity = {
    schema: 'muxui-catalog-package-v2',
    name: '@muxui/catalog',
    version: '3.0.0',
    catalogVersion: '3.0.0',
    catalogDigest: bundle.catalogDigest,
    queryApiVersion: bundle.apiVersion,
    supportedQueryApiVersions: ['3.0.0'],
    schemaRange: '^4.0.0',
    sourceRevision: bundle.sourceRevision,
    provenance: { kind: 'source-revision', value: bundle.sourceRevision },
    tokenRequirementSets: Object.fromEntries(bindings.map((binding) => [`${binding}:web.react`, tokenDigest])),
    platformSafetyContract: {
      version: bundle.platformSafetyContract.contractVersion,
      digest: bundle.platformSafetyContractDigest,
    },
    platformSafetyRequirementSets: Object.fromEntries(bindings.map((binding) => [`${binding}:web.react`, safetyDigest])),
    releaseManifest: {
      id: `muxui-release:1.0.1:${bundle.sourceRevision}`,
      releaseVersion: '1.0.1',
      schemaVersion: '4.0.0',
      queryApiVersion: '3.0.0',
      tokenContractVersion: '2.0.0',
      sourceRevision: bundle.sourceRevision,
      catalog: {
        id: `@muxui/catalog@3.0.0:${bundle.catalogDigest}`,
        version: '3.0.0',
        digest: bundle.catalogDigest,
      },
      bindings: bindings.map((binding) => ({
        descriptor: descriptor.id,
        binding,
        package: '@muxui/react',
        versionRange: '^1.0.0-0',
        exportName: artifactOf(binding).name,
        specRevision: specRevisionOf(binding),
        tokenRequirementSetDigests: { 'web.react': tokenDigest },
        platformSafetyRequirementSetDigests: { 'web.react': safetyDigest },
      })),
    },
    bundle: './catalog.json',
  };
  return { descriptor, identity };
}

/**
 * Writes a pnpm project under `fixtureRoot` whose catalog package holds `bundle`
 * (`writeBundle` copies its files) and whose renderer package can install any of
 * `bindings`, all of which the release lists. `installed` is the subset the
 * renderer descriptor provides. The returned `descriptor` and `identity` stay mutable: change them,
 * `write()` them back, or `install(list)` a different subset.
 */
export async function createRendererProject(fixtureRoot, { bundle, writeBundle, bindings, installed = bindings }) {
  const catalogRoot = join(fixtureRoot, 'catalog');
  const rendererRoot = join(fixtureRoot, 'renderer');
  const generatedCatalog = join(catalogRoot, 'generated');
  const generatedRenderer = join(rendererRoot, 'generated');
  await mkdir(generatedCatalog, { recursive: true });
  await mkdir(generatedRenderer, { recursive: true });
  await writeJson(join(fixtureRoot, 'package.json'), {
    name: 'g0-4-pnpm-fixture',
    version: '1.0.0',
    private: true,
    packageManager: 'pnpm@10.33.0',
    dependencies: {
      '@muxui/catalog': 'workspace:*',
      '@muxui/react': 'workspace:*',
    },
  });
  await writeFile(join(fixtureRoot, 'pnpm-workspace.yaml'), "packages:\n  - catalog\n  - renderer\n");
  await writeJson(join(catalogRoot, 'package.json'), {
    name: '@muxui/catalog',
    version: '3.0.0',
    private: true,
    muxUi: { catalogPackage: './generated/catalog-package.json' },
  });
  await writeJson(join(rendererRoot, 'package.json'), {
    name: '@muxui/react',
    version: '1.0.1',
    private: true,
    exports: Object.fromEntries(bindings.map((binding) => {
      const slug = binding.split('#')[0].split(':').at(-1);
      return [`./${slug}`, `./${slug}.mjs`];
    })),
    muxUi: { rendererDescriptor: './generated/renderer-descriptor.json' },
  });
  await writeBundle(generatedCatalog);
  const project = {
    path: relative(process.cwd(), fixtureRoot).split('\\').join('/'),
    ...rendererDocuments(bundle, bindings, installed),
    async write() {
      await writeProjection(
        join(generatedCatalog, 'catalog-package.json'),
        'packages/catalog/generated/catalog-package.json',
        project.identity,
      );
      await writeProjection(
        join(generatedRenderer, 'renderer-descriptor.json'),
        'packages/react/generated/renderer-descriptor.json',
        project.descriptor,
      );
    },
    async install(list) {
      Object.assign(project, rendererDocuments(bundle, bindings, list));
      await project.write();
    },
  };
  await project.write();
  const install = spawnSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
  assert.equal(install.status, 0, install.stderr);
  return project;
}
