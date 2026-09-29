import { escapeJsonPointer, isObject, loadJsonDocument } from './contracts.mjs';

/** Lists every `properties` declaration in a schema, including nested keyword subschemas. */
export function collectSchemaFieldDeclarations(schema, pointer = '#', declarations = []) {
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

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

let policy;
let registry;

/**
 * Returns a frozen copy of the authored policy in `schemas/field-ownership.json`
 * (classes, governed-schema rows, and reserved fields). It never shares objects
 * with the registry view, so validation can compare a supplied view against it.
 */
export function loadFieldOwnershipPolicy() {
  policy ??= deepFreeze(structuredClone(loadJsonDocument('field-ownership.json')));
  return policy;
}

/**
 * Returns the frozen field-ownership registry view: the authored policy plus
 * one `fields` entry per property declared by each governed schema, carrying
 * that schema's single class and owner. Callers that need to mutate it clone it.
 */
export function loadFieldOwnershipRegistry() {
  if (!registry) {
    const view = structuredClone(loadJsonDocument('field-ownership.json'));
    view.fields = view.governedSchemas.flatMap((governed) => (
      collectSchemaFieldDeclarations(loadJsonDocument(governed.file))
        .map(({ name, schemaPointer }) => ({
          class: governed.class,
          name,
          owner: governed.owner,
          schema: governed.file,
          schemaPointer,
        }))
    ));
    registry = deepFreeze(view);
  }
  return registry;
}
