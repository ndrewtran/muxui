import { canonicalDigest } from './canonical.mjs';
import {
  familyFiles,
  loadFamilySchema,
  resolveSchemaReference,
} from './contracts.mjs';
import { loadFieldOwnershipRegistry } from './field-ownership.mjs';
import { SchemaValidationError } from './validation.mjs';

const AUTHORING_FAMILIES = Object.freeze(['binding', 'component', 'example', 'pattern']);
const EFFECTS = new Set(['editorial', 'compatible', 'incompatible']);
const OPERATIONS = Object.freeze(['add', 'remove', 'replace']);
const REVISION_AXES = new Set(['content', 'binding-content', 'binding-spec', 'pattern-spec']);
const AUTOFIXES = new Set(['trim-outer-whitespace']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapePointer(segment) {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function unescapePointer(segment) {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function pathSegments(path) {
  if (path === '$' || path === '' || path === '#') return [];
  const normalized = path.startsWith('$/')
    ? path.slice(2)
    : path.startsWith('/')
      ? path.slice(1)
      : path;
  return normalized.split('/').filter(Boolean).map(unescapePointer);
}

function completionFor(schema, required) {
  return {
    required,
    ...(schema.const === undefined ? {} : { literal: structuredClone(schema.const) }),
    ...(schema.enum === undefined ? {} : { values: structuredClone(schema.enum) }),
    ...(schema.type === undefined ? {} : { type: structuredClone(schema.type) }),
    ...(schema.pattern === undefined ? {} : { pattern: schema.pattern }),
    ...(schema.items?.type === undefined ? {} : { itemType: schema.items.type }),
  };
}

function normalizeAnnotation(annotation, path) {
  const issues = [];
  if (!isObject(annotation)) {
    issues.push({ path, message: 'is missing x-muxui-authoring metadata' });
  } else {
    const allowed = new Set(['effect', 'effects', 'revisionAxes', 'autofixes']);
    const unknown = Object.keys(annotation).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      issues.push({ path, message: `has unknown authoring keys: ${unknown.join(', ')}` });
    }
    const hasEffect = EFFECTS.has(annotation.effect);
    const hasEffects = isObject(annotation.effects)
      && OPERATIONS.every((operation) => EFFECTS.has(annotation.effects[operation]))
      && Object.keys(annotation.effects).length === OPERATIONS.length;
    if (hasEffect === hasEffects) {
      issues.push({ path, message: 'must declare exactly one effect or complete effects map' });
    }
    if (
      !Array.isArray(annotation.revisionAxes)
      || annotation.revisionAxes.length === 0
      || new Set(annotation.revisionAxes).size !== annotation.revisionAxes.length
      || annotation.revisionAxes.some((axis) => !REVISION_AXES.has(axis))
    ) {
      issues.push({ path, message: 'must declare unique supported revisionAxes' });
    }
    if (
      annotation.autofixes !== undefined
      && (
        !Array.isArray(annotation.autofixes)
        || new Set(annotation.autofixes).size !== annotation.autofixes.length
        || annotation.autofixes.some((autofix) => !AUTOFIXES.has(autofix))
      )
    ) {
      issues.push({ path, message: 'declares an unsupported or duplicate autofix' });
    }
  }
  if (issues.length > 0) {
    throw new SchemaValidationError('MUXUI_SCHEMA_INVALID', issues);
  }
  return {
    effects: Object.fromEntries(OPERATIONS.map((operation) => [
      operation,
      annotation.effect ?? annotation.effects[operation],
    ])),
    revisionAxes: [...annotation.revisionAxes],
    autofixes: [...(annotation.autofixes ?? [])],
  };
}

function collectProperties({
  family,
  fileName,
  node,
  pointer = '#',
  declarations,
  schemas,
  visited = new Set(),
}) {
  if (!isObject(node)) return;
  const visitKey = `${fileName}${pointer}`;
  if (visited.has(visitKey)) return;
  visited.add(visitKey);
  if (isObject(node.properties)) {
    const required = new Set(node.required ?? []);
    for (const [field, propertySchema] of Object.entries(node.properties)) {
      const schemaPointer = `${pointer}/properties/${escapePointer(field)}`;
      const authoring = normalizeAnnotation(
        propertySchema['x-muxui-authoring'],
        `${schemaPointer}/x-muxui-authoring`,
      );
      declarations.push({
        family,
        field,
        schema: fileName,
        schemaPointer,
        completion: completionFor(propertySchema, required.has(field)),
        ...authoring,
      });
      collectProperties({
        family,
        fileName,
        node: propertySchema,
        pointer: schemaPointer,
        declarations,
        schemas,
        visited,
      });
    }
  }
  for (const keyword of ['$defs', 'patternProperties', 'dependentSchemas']) {
    if (!isObject(node[keyword])) continue;
    for (const [name, definition] of Object.entries(node[keyword])) {
      collectProperties({
        family,
        fileName,
        node: definition,
        pointer: `${pointer}/${keyword}/${escapePointer(name)}`,
        declarations,
        schemas,
        visited,
      });
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    for (const [index, definition] of (node[keyword] ?? []).entries()) {
      collectProperties({
        family,
        fileName,
        node: definition,
        pointer: `${pointer}/${keyword}/${index}`,
        declarations,
        schemas,
        visited,
      });
    }
  }
  for (const keyword of [
    'items', 'additionalProperties', 'propertyNames', 'contains',
    'not', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties',
  ]) {
    if (!isObject(node[keyword])) continue;
    collectProperties({
      family,
      fileName,
      node: node[keyword],
      pointer: `${pointer}/${keyword}`,
      declarations,
      schemas,
      visited,
    });
  }
  if (node.$ref) {
    const target = referenceTarget(node.$ref, fileName, schemas);
    collectProperties({
      family,
      fileName: target.fileName,
      node: target.schema,
      pointer: target.pointer,
      declarations,
      schemas,
      visited,
    });
  }
}

function declarationsFor(family, schemas) {
  if (!AUTHORING_FAMILIES.includes(family)) {
    throw new Error(`MUXUI_SCHEMA_INVALID: authoring metadata unavailable for ${family}`);
  }
  const { fileName, schema } = loadFamilySchema(family, schemas);
  const declarations = [];
  collectProperties({
    family,
    fileName,
    node: schema,
    declarations,
    schemas,
  });
  return declarations;
}

export function validateAuthoringMetadata({ schemas, ownership } = {}) {
  const declarations = AUTHORING_FAMILIES
    .flatMap((family) => declarationsFor(family, schemas));
  const registry = ownership ?? loadFieldOwnershipRegistry();
  const owners = new Map(registry.fields.map((field) => [
    `${field.schema}${field.schemaPointer}`,
    field,
  ]));
  for (const declaration of declarations) {
    const owner = owners.get(`${declaration.schema}${declaration.schemaPointer}`);
    if (!owner) {
      throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [{
        path: `${declaration.schema}${declaration.schemaPointer}`,
        message: 'authoring metadata must resolve to the existing field owner',
      }]);
    }
  }
  return declarations.map((declaration) => Object.freeze(structuredClone(declaration)));
}

export function authoringMetadata(family, { schemas, ownership } = {}) {
  validateAuthoringMetadata({ schemas, ownership });
  return Object.freeze(declarationsFor(family, schemas).map((declaration) => (
    Object.freeze(structuredClone(declaration))
  )));
}

function referenceTarget(reference, currentFile, schemas) {
  const [filePart, fragment = ''] = reference.split('#');
  return {
    fileName: filePart || currentFile,
    pointer: fragment ? `#${fragment}` : '#',
    schema: resolveSchemaReference(reference, currentFile, schemas).schema,
  };
}

function findProperty(node, fileName, pointer, segment, schemas, visited = new Set()) {
  if (!isObject(node)) return null;
  const visitKey = `${fileName}${pointer}:${segment}`;
  if (visited.has(visitKey)) return null;
  visited.add(visitKey);
  if (isObject(node.properties) && Object.hasOwn(node.properties, segment)) {
    return {
      fileName,
      pointer: `${pointer}/properties/${escapePointer(segment)}`,
      schema: node.properties[segment],
    };
  }
  if (node.$ref) {
    const target = referenceTarget(node.$ref, fileName, schemas);
    const found = findProperty(
      target.schema,
      target.fileName,
      target.pointer,
      segment,
      schemas,
      visited,
    );
    if (found) return found;
  }
  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    for (const [index, child] of (node[keyword] ?? []).entries()) {
      const found = findProperty(
        child,
        fileName,
        `${pointer}/${keyword}/${index}`,
        segment,
        schemas,
        visited,
      );
      if (found) return found;
    }
  }
  return null;
}

function ownerFor(fileName, schemaPointer, ownership) {
  const field = (ownership ?? loadFieldOwnershipRegistry()).fields.find((entry) => (
    entry.schema === fileName && entry.schemaPointer === schemaPointer
  ));
  if (!field) {
    throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [{
      path: `${fileName}${schemaPointer}`,
      message: 'has no canonical field owner',
    }]);
  }
  return field.owner;
}

/**
 * Authored source may not carry a reserved derived or proved field, and such a
 * field has no schema property. Where the validator forbids one (a record
 * root, a component binding, or a runtime profile), its owner is the reserved
 * row's owner. A row may narrow itself to `families`.
 */
function reservedResolution(family, field, current, ownership) {
  const refs = [current.schema?.$ref, ...(current.schema?.allOf ?? []).map((part) => part.$ref)];
  const forbiddenHere = current.pointer === '#'
    || refs.some((ref) => [familyFiles.binding, '#/$defs/runtimeProfile'].includes(ref));
  if (!forbiddenHere) return null;
  const reserved = (ownership ?? loadFieldOwnershipRegistry()).reservedFields ?? [];
  const index = reserved.findIndex((entry) => (
    entry.name === field && (entry.families === undefined || entry.families.includes(family))
  ));
  if (index === -1) return null;
  return {
    family,
    field,
    schema: 'field-ownership.json',
    schemaPointer: `#/reservedFields/${index}`,
    owner: reserved[index].owner,
    reserved: reserved[index].class,
    completion: { required: false },
    // Never authorable: any presence is a rejection, and no revision axis folds it.
    effects: Object.fromEntries(OPERATIONS.map((operation) => [operation, 'incompatible'])),
    revisionAxes: [],
    autofixes: [],
  };
}

export function resolveAuthoringField(family, path, { schemas, ownership } = {}) {
  validateAuthoringMetadata({ schemas, ownership });
  const { fileName, schema } = loadFamilySchema(family, schemas);
  let current = { fileName, pointer: '#', schema };
  let resolved = null;
  for (const segment of pathSegments(path)) {
    if (Array.isArray(current.schema) || /^\d+$/u.test(segment)) {
      if (current.schema?.items) {
        current = {
          fileName: current.fileName,
          pointer: `${current.pointer}/items`,
          schema: current.schema.items,
        };
      }
      continue;
    }
    const property = findProperty(
      current.schema,
      current.fileName,
      current.pointer,
      segment,
      schemas,
    );
    if (!property) {
      resolved = reservedResolution(family, segment, current, ownership) ?? resolved;
      break;
    }
    const authoring = normalizeAnnotation(
      property.schema['x-muxui-authoring'],
      `${property.pointer}/x-muxui-authoring`,
    );
    resolved = {
      family,
      field: segment,
      schema: property.fileName,
      schemaPointer: property.pointer,
      owner: ownerFor(property.fileName, property.pointer, ownership),
      completion: completionFor(property.schema, false),
      ...authoring,
    };
    current = property;
  }
  if (!resolved) {
    throw new SchemaValidationError('MUXUI_SCHEMA_INVALID', [{
      path,
      message: 'does not resolve to schema-owned authoring metadata',
    }]);
  }
  return Object.freeze(structuredClone(resolved));
}

export function authoringMetadataDigest(options = {}) {
  return canonicalDigest(validateAuthoringMetadata(options));
}
