/**
 * The compact compatibility descriptor the tooling resolver reads from an installed renderer package
 * (`muxUi.rendererDescriptor` in package.json). Nothing here is authored: bindings come from the binding records,
 * revisions and requirement digests from the compiled catalog bundle, and every export identity from the package's
 * own export map.
 */

/** The version of the descriptor format, not of the package. */
export const RENDERER_DESCRIPTOR_VERSION = '1.0.0';

const BINDING_ID = 'web.react';

// A profile-keyed digest map of one binding, from the bundle's `<bindingId>:<profile>` requirement sets.
function profileDigests(binding, requirementSets) {
  const prefix = `${BINDING_ID}:`;
  const digests = Object.fromEntries(Object.entries(requirementSets)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, { digest }]) => [key.slice(prefix.length), digest]));
  if (Object.keys(digests).length === 0) {
    throw new Error(`MUXUI_REACT_RENDERER_DESCRIPTOR_BINDING_UNCOMPILED: ${binding} has no compiled requirement set`);
  }
  return digests;
}

/** `<package>[/<subpath>]#<Name>`, for a module the package's export map names. */
function exportIdentity(manifest, { module, export: name }) {
  if (!Object.hasOwn(manifest.exports, module)) {
    throw new Error(`MUXUI_REACT_RENDERER_DESCRIPTOR_EXPORT_UNMAPPED: ${name} is in ${module}, which package.json does not export`);
  }
  return `${manifest.name}${module === '.' ? '' : module.slice(1)}#${name}`;
}

/**
 * `bindings` are the package's `web.react` bindings (`binding`, `export`, `module`, `lifecycle`, `strategy`); `bundle` is the
 * compiled catalog. The release id repeats the catalog generator's release manifest id for the catalog version and source
 * revision, and the resolver test compares it with the catalog package's own release manifest.
 */
export function buildRendererDescriptor({ manifest, bundle, bindings }) {
  const artifacts = new Map(bundle.artifacts.map((artifact) => [artifact.id, artifact]));
  const tokenContractVersion = bundle.artifacts.find(({ kind }) => kind === 'token')?.record.tokenContractVersion;
  if (tokenContractVersion === undefined) throw new Error('MUXUI_REACT_RENDERER_DESCRIPTOR_TOKEN_CONTRACT_MISSING: the compiled catalog has no token contract');
  return {
    id: `renderer:${manifest.name}`,
    descriptorVersion: RENDERER_DESCRIPTOR_VERSION,
    package: manifest.name,
    version: manifest.version,
    bindingSchemaRange: `^${bundle.schemaVersion}`,
    tokenContractRange: `^${tokenContractVersion}`,
    releaseProvenance: `muxui-release:${bundle.catalogVersion}:${bundle.sourceRevision}`,
    bindings: Object.fromEntries(bindings.map((binding) => {
      const artifact = artifacts.get(binding.binding.slice(0, binding.binding.indexOf('#')));
      const specRevision = artifact?.bindingSpecRevisions[BINDING_ID];
      if (specRevision === undefined) {
        throw new Error(`MUXUI_REACT_RENDERER_DESCRIPTOR_BINDING_UNCOMPILED: ${binding.binding} has no compiled ${BINDING_ID} spec revision`);
      }
      return [binding.binding, {
        specRevision,
        export: exportIdentity(manifest, binding),
        lifecycle: binding.lifecycle,
        strategy: binding.strategy,
        tokenRequirementSetDigests: profileDigests(binding.binding, artifact.tokenRequirementSets),
        platformSafetyRequirementSetDigests: profileDigests(binding.binding, artifact.platformSafetyRequirementSets),
      }];
    })),
  };
}
