import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const schemaDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '../schemas',
);

export const familyFiles = Object.freeze({
  'artifact-ref': 'artifact-ref.schema.json',
  binding: 'binding.schema.json',
  capability: 'capability.schema.json',
  component: 'component.schema.json',
  diagnostic: 'diagnostic.schema.json',
  example: 'example.schema.json',
  guide: 'guide.schema.json',
  'query-envelope': 'query-envelope.schema.json',
  'section-page': 'section-page.schema.json',
  'token-section-page-budget-profile': 'token-section-page-budget-profile.schema.json',
  'token-source': 'token-source.schema.json',
});

const documentCache = new Map();

export function loadJsonDocument(fileName) {
  if (!documentCache.has(fileName)) {
    const path = join(schemaDirectory, fileName);
    documentCache.set(fileName, JSON.parse(readFileSync(path, 'utf8')));
  }
  return documentCache.get(fileName);
}

export function loadFamilySchema(family, documents) {
  const fileName = Object.hasOwn(familyFiles, family) ? familyFiles[family] : undefined;
  if (!fileName) throw new Error(`SCHEMA_FAMILY_UNKNOWN: ${family}`);
  return {
    fileName,
    schema: documents?.[fileName] ?? loadJsonDocument(fileName),
  };
}

export function resolveJsonPointer(value, pointer) {
  if (!pointer || pointer === '#') return value;
  const path = pointer.replace(/^#\/?/, '');
  if (!path) return value;
  return path.split('/').reduce((current, segment) => {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current == null || !Object.hasOwn(current, key)) {
      throw new Error(`SCHEMA_POINTER_INVALID: ${pointer}`);
    }
    return current[key];
  }, value);
}

export function resolveSchemaReference(reference, currentFile, documents) {
  const [filePart, fragment = ''] = reference.split('#');
  const fileName = filePart || currentFile;
  const document = documents?.[fileName] ?? loadJsonDocument(fileName);
  return {
    fileName,
    schema: resolveJsonPointer(document, fragment ? `#${fragment}` : '#'),
  };
}
