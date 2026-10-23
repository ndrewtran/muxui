import { canonicalJson } from './canonical.mjs';
import { isObject } from './contracts.mjs';
import { SchemaValidationError, validateContractDocument } from './validation.mjs';

export const DERIVED_API_SCHEMA = 'muxui-derived-api-v1';
/** The typed api fields only a derived block carries; authored bindings may not. */
export const DERIVED_API_FIELDS = Object.freeze(['propDetails', 'eventDetails', 'types', 'partApis']);

function invalid(issues) {
  return new SchemaValidationError('MUXUI_SCHEMA_INVALID', issues);
}

function referencedNames(type, names) {
  switch (type.kind) {
    case 'reference': names.add(type.name); break;
    case 'union': for (const member of type.members) referencedNames(member, names); break;
    case 'array': referencedNames(type.element, names); break;
    case 'tuple':
      for (const element of type.elements) referencedNames(element, names);
      if (type.rest !== undefined) referencedNames(type.rest, names);
      break;
    case 'record': referencedNames(type.value, names); break;
    case 'function':
      for (const parameter of type.parameters) referencedNames(parameter.type, names);
      referencedNames(type.returns, names);
      break;
    case 'object': for (const member of type.members) referencedNames(member.type, names); break;
    case 'host': for (const argument of type.typeArguments ?? []) referencedNames(argument, names); break;
    default: break;
  }
  return names;
}

// Paths where `never` stands anywhere but as an optional object member's type.
function misplacedNever(type, path, found = []) {
  switch (type.kind) {
    case 'never': found.push(path); break;
    case 'union': type.members.forEach((member, index) => misplacedNever(member, `${path}/members/${index}`, found)); break;
    case 'array': misplacedNever(type.element, `${path}/element`, found); break;
    case 'tuple':
      type.elements.forEach((element, index) => misplacedNever(element, `${path}/elements/${index}`, found));
      if (type.rest !== undefined) misplacedNever(type.rest, `${path}/rest`, found);
      break;
    case 'record': misplacedNever(type.value, `${path}/value`, found); break;
    case 'function':
      type.parameters.forEach((parameter, index) => misplacedNever(parameter.type, `${path}/parameters/${index}/type`, found));
      misplacedNever(type.returns, `${path}/returns`, found);
      break;
    case 'object':
      type.members.forEach((member, index) => {
        if (member.type.kind !== 'never' || member.required) misplacedNever(member.type, `${path}/members/${index}/type`, found);
      });
      break;
    case 'host': (type.typeArguments ?? []).forEach((argument, index) => misplacedNever(argument, `${path}/typeArguments/${index}`, found)); break;
    default: break;
  }
  return found;
}

/**
 * Paths where `unknown` stands anywhere but as the sole argument of a `Promise` host that a function returns, directly or as a
 * member of its return union (a callback that may return a promise whose value is never read). `returned` is true only there:
 * each function restarts it for its own return, and nothing else passes it on, so a parameter, an array, a tuple, a record, an
 * object member, or another host's argument holds no unknown. The D1 `additional: "unknown"` marker is no type and is not
 * visited. D3's synthetic erasure of an unconstrained binder (T10b) is serialized as the same `{ kind: 'unknown' }` and needs
 * its own rule here before it can be admitted; this one rejects it.
 */
function misplacedUnknown(type, path, found = [], returned = false) {
  switch (type.kind) {
    case 'unknown': found.push(path); break;
    case 'union': type.members.forEach((member, index) => misplacedUnknown(member, `${path}/members/${index}`, found, returned)); break;
    case 'array': misplacedUnknown(type.element, `${path}/element`, found); break;
    case 'tuple':
      type.elements.forEach((element, index) => misplacedUnknown(element, `${path}/elements/${index}`, found));
      if (type.rest !== undefined) misplacedUnknown(type.rest, `${path}/rest`, found);
      break;
    case 'record': misplacedUnknown(type.value, `${path}/value`, found); break;
    case 'function':
      type.parameters.forEach((parameter, index) => misplacedUnknown(parameter.type, `${path}/parameters/${index}/type`, found));
      misplacedUnknown(type.returns, `${path}/returns`, found, true);
      break;
    case 'object': type.members.forEach((member, index) => misplacedUnknown(member.type, `${path}/members/${index}/type`, found)); break;
    case 'host': {
      const promised = returned && type.name === 'Promise' && type.typeArguments?.length === 1 && type.typeArguments[0].kind === 'unknown';
      (type.typeArguments ?? []).forEach((argument, index) => {
        if (!promised) misplacedUnknown(argument, `${path}/typeArguments/${index}`, found);
      });
      break;
    }
    default: break;
  }
  return found;
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

/**
 * The rules the grammar cannot state, for one block (the root's or a part's): details cover
 * exactly the listed props and events, each event names its on<Event> prop, defaults belong
 * to listed props and their enums, `types` holds exactly the named types the details reach,
 * `never` is only an optional object member's type, and `unknown` is only the argument of a
 * returned `Promise` (`misplacedUnknown`). `at` is the block's path.
 */
function blockIssues(block, at) {
  const issues = [];
  if (!sameSet(block.props, Object.keys(block.propDetails))) {
    issues.push({ path: `${at}/propDetails`, message: 'must describe exactly the listed props' });
  }
  if (!sameSet(block.events, Object.keys(block.eventDetails))) {
    issues.push({ path: `${at}/eventDetails`, message: 'must describe exactly the listed events' });
  }
  for (const prop of block.props.filter((name) => /^on[A-Z]/u.test(name))) {
    issues.push({ path: `${at}/props/${prop}`, message: 'is an on<Event> prop; list it as an event' });
  }
  for (const [event, detail] of Object.entries(block.eventDetails)) {
    if (detail.prop !== `on${event[0].toUpperCase()}${event.slice(1)}`) {
      issues.push({ path: `${at}/eventDetails/${event}/prop`, message: `must be on${event[0].toUpperCase()}${event.slice(1)}` });
    }
  }
  for (const [prop, value] of Object.entries(block.defaults)) {
    const detail = block.propDetails[prop];
    if (!block.props.includes(prop) || detail === undefined) {
      issues.push({ path: `${at}/defaults/${prop}`, message: 'must default a listed prop' });
    } else if (detail.enum !== undefined && !detail.enum.includes(value)) {
      issues.push({ path: `${at}/defaults/${prop}`, message: 'must be one of the prop\'s enum values' });
    }
  }
  const reached = new Set();
  const pending = [...Object.values(block.propDetails), ...Object.values(block.eventDetails)]
    .flatMap(({ type }) => [...referencedNames(type, new Set())]);
  while (pending.length > 0) {
    const name = pending.pop();
    if (reached.has(name)) continue;
    reached.add(name);
    if (!Object.hasOwn(block.types, name)) {
      issues.push({ path: `${at}/types/${name}`, message: 'is referenced but not defined' });
      continue;
    }
    pending.push(...referencedNames(block.types[name].type, new Set()));
  }
  for (const name of Object.keys(block.types).filter((typeName) => !reached.has(typeName))) {
    issues.push({ path: `${at}/types/${name}`, message: 'is defined but no prop or event reaches it' });
  }
  const typed = [
    ...Object.entries(block.propDetails).map(([prop, { type }]) => [`${at}/propDetails/${prop}/type`, type]),
    ...Object.entries(block.eventDetails).map(([event, { type }]) => [`${at}/eventDetails/${event}/type`, type]),
    ...Object.entries(block.types).map(([name, { type }]) => [`${at}/types/${name}/type`, type]),
  ];
  for (const path of typed.flatMap(([typePath, type]) => misplacedNever(type, typePath))) {
    issues.push({ path, message: 'never is only an optional object member\'s type, a member that must be absent' });
  }
  for (const path of typed.flatMap(([typePath, type]) => misplacedUnknown(type, typePath))) {
    issues.push({ path, message: 'unknown is only the sole argument of a Promise that a function returns' });
  }
  return issues;
}

/**
 * Validates a derived API document (packages/react/api/<slug>.json) against
 * derived-api.schema.json and the rules the grammar cannot state, for the root's block
 * and for each part in `partApis` (`blockIssues`). Across blocks, an export member
 * stands for one anatomy part, and a named type that more than one block defines is
 * defined identically in each, since the blocks describe one public type.
 */
export function validateDerivedApi(document) {
  validateContractDocument('derived-api.schema.json', document);
  const { api } = document;
  const { partApis = {}, ...root } = api;
  const issues = blockIssues(root, '$/api');
  const blocks = [['$/api', root], ...Object.entries(partApis).map(([part, block]) => [`$/api/partApis/${part}`, block])];
  for (const [part, block] of Object.entries(partApis)) issues.push(...blockIssues(block, `$/api/partApis/${part}`));
  const owners = new Map();
  for (const [part, { member }] of Object.entries(partApis)) {
    if (owners.has(member)) {
      issues.push({ path: `$/api/partApis/${part}/member`, message: `is also the member of ${owners.get(member)}; an export member stands for one anatomy part` });
    }
    owners.set(member, part);
  }
  const definitions = new Map();
  for (const [at, block] of blocks) {
    for (const [name, definition] of Object.entries(block.types)) {
      const first = definitions.get(name);
      if (first === undefined) definitions.set(name, { at, json: canonicalJson(definition) });
      else if (first.json !== canonicalJson(definition)) {
        issues.push({ path: `${at}/types/${name}`, message: `is defined differently from ${first.at}/types/${name}; a named type has one definition` });
      }
    }
  }
  if (issues.length > 0) throw invalid(issues);
  return document;
}

/**
 * What a component's authored binding apis may not be, given the bindings that take a
 * derived block (Decision 0031): an implemented binding carries exactly one of an
 * authored `api` or a derived block, an authored api carries no derived-only field, an
 * unsupported binding takes neither, and a derived block needs its binding. The
 * compiler (through mergeDerivedApis) and source diagnosis both apply these.
 * @param {object} component
 * @param {Iterable<string>} derivedBindingIds
 * @returns {{ path: string, message: string }[]}
 */
export function authoredApiIssues(component, derivedBindingIds = []) {
  const derived = new Set(derivedBindingIds);
  const bindings = component.bindings ?? {};
  const issues = [];
  for (const [bindingId, binding] of Object.entries(bindings)) {
    const path = `$/bindings/${bindingId}/api`;
    if (binding.strategy === 'unsupported') {
      if (derived.has(bindingId)) issues.push({ path, message: 'an unsupported binding takes no derived API' });
      continue;
    }
    if (isObject(binding.api)) {
      for (const field of DERIVED_API_FIELDS.filter((name) => Object.hasOwn(binding.api, name))) {
        issues.push({ path: `${path}/${field}`, message: 'is derived only and cannot be authored' });
      }
    }
    if (!derived.has(bindingId) && binding.api === undefined) issues.push({ path, message: 'needs an authored api or a derived API source' });
    if (derived.has(bindingId) && binding.api !== undefined) issues.push({ path, message: 'is derived from source; remove the authored api' });
  }
  for (const bindingId of derived) {
    if (!Object.hasOwn(bindings, bindingId)) issues.push({ path: `$/bindings/${bindingId}`, message: 'has a derived API but no binding' });
  }
  return issues;
}

/**
 * Returns the component with each derived block merged into its binding:
 * `api` becomes the derived props, events, defaults, and typed details, with
 * `parts` taken from the concept anatomy, and the part APIs, each of which
 * must belong to a part of that anatomy. `derivedApis` maps a binding id to
 * its derived document. The component must pass authoredApiIssues for those
 * bindings. The input component is not modified.
 */
export function mergeDerivedApis(component, derivedApis = {}) {
  const issues = authoredApiIssues(component, Object.keys(derivedApis));
  const merged = structuredClone(component);
  for (const [bindingId, document] of Object.entries(derivedApis)) {
    const binding = merged.bindings?.[bindingId];
    // Each of these already has an issue.
    if (binding === undefined || binding.strategy === 'unsupported' || binding.api !== undefined) continue;
    validateDerivedApi(document);
    if (document.component !== component.id || document.binding !== bindingId) {
      issues.push({ path: `$/bindings/${bindingId}/api`, message: `the derived API names ${document.component}#${document.binding}` });
      continue;
    }
    const { props, events, defaults, propDetails, eventDetails, types, partApis } = structuredClone(document.api);
    // Each part's API belongs to a part of the component's anatomy, which stays authored.
    for (const part of Object.keys(partApis ?? {}).filter((key) => !component.anatomy.includes(key))) {
      issues.push({ path: `$/bindings/${bindingId}/api/partApis/${part}`, message: 'is not a part of the component anatomy' });
    }
    binding.api = { props, events, parts: [...component.anatomy], defaults, propDetails, eventDetails, types, ...(partApis === undefined ? {} : { partApis }) };
  }
  if (issues.length > 0) throw invalid(issues);
  return merged;
}
