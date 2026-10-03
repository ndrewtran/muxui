import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const supplementalMappingPath = 'catalog/react-r1-6/supplemental-components.json';
const supplementalMappingSchema = 'muxui-react-r1-6-supplemental-components-v2';
const derivedFields = ['artifact', 'binding', 'apiOwner', 'stateOwner', 'anatomyOwner'];

// The one reader of the R1.6 supplemental mapping. Every component's catalog
// owners and export name follow from its slug and family, so the mapping
// authors only module, isolation, sources, and examples; authored copies of a
// derived field are rejected so they can never drift from the template.
export function readSupplementalMapping(repositoryRoot) {
  const mapping = JSON.parse(readFileSync(resolve(repositoryRoot, supplementalMappingPath), 'utf8'));
  if (mapping.schema !== supplementalMappingSchema || !Array.isArray(mapping.components)) {
    throw new Error(`MUXUI_REACT_R16_MAPPING_SCHEMA_DRIFT: expected ${supplementalMappingSchema}`);
  }
  return mapping.components.map((entry) => {
    if (derivedFields.some((field) => field in entry) || 'name' in (entry.export ?? {})) {
      throw new Error(`MUXUI_REACT_R16_MAPPING_DERIVED_FIELD_AUTHORED: ${entry.slug}`);
    }
    const artifact = `catalog/components/${entry.slug}/artifact.json`;
    return {
      ...entry,
      artifact,
      binding: `muxui:component:${entry.slug}#web.react`,
      apiOwner: `${artifact}#/bindings/web.react/api`,
      stateOwner: `${artifact}#/states`,
      anatomyOwner: `${artifact}#/anatomy`,
      export: { name: entry.family, ...entry.export },
    };
  });
}
