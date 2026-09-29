import { loadJsonDocument } from './contracts.mjs';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeJsonPointer(segment) {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** Lists every `properties` declaration in a schema, including nested keyword subschemas. */
function collectSchemaFieldDeclarations(schema, pointer = '#', declarations = []) {
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => collectSchemaFieldDeclarations(
      item,
      `${pointer}/${index}`,
      declarations,
    ));
    return declarations;
  }
  if (!isObject(schema)) return declarations;
  for (const [keyword, value] of Object.entries(schema)) {
    const keywordPointer = `${pointer}/${escapeJsonPointer(keyword)}`;
    if (keyword === 'properties' && isObject(value)) {
      for (const [name, propertySchema] of Object.entries(value)) {
        const schemaPointer = `${keywordPointer}/${escapeJsonPointer(name)}`;
        declarations.push({ name, schemaPointer });
        collectSchemaFieldDeclarations(propertySchema, schemaPointer, declarations);
      }
    } else {
      collectSchemaFieldDeclarations(value, keywordPointer, declarations);
    }
  }
  return declarations;
}

function synthesize(policy) {
  const fields = policy.governedSchemas.flatMap((governed) => (
    collectSchemaFieldDeclarations(loadJsonDocument(governed.file))
      .map(({ name, schemaPointer }) => ({
        class: governed.class,
        name,
        owner: governed.owner,
        schema: governed.file,
        schemaPointer,
      }))
  ));
  return { ...policy, fields };
}

let defaultRegistry;

/**
 * Returns the field-ownership registry view: the canonical policy in
 * `schemas/field-ownership.json` plus one `fields` entry per property declared
 * by each governed schema, carrying that schema's single class and owner.
 * The view is built once and shared, so callers that mutate it must clone first.
 */
export function loadFieldOwnershipRegistry() {
  defaultRegistry ??= synthesize(loadJsonDocument('field-ownership.json'));
  return defaultRegistry;
}
