import { isObject } from './contracts.mjs';
import { SchemaValidationError, validateContractDocument } from './validation.mjs';

export const DERIVED_API_SCHEMA = 'muxui-derived-api-v1';
/** The typed api fields only a derived block carries; authored bindings may not. */
export const DERIVED_API_FIELDS = Object.freeze(['propDetails', 'eventDetails', 'types']);

function invalid(issues) {
  return new SchemaValidationError('MUXUI_SCHEMA_INVALID', issues);
}

function referencedNames(type, names) {
  switch (type.kind) {
    case 'reference': names.add(type.name); break;
    case 'union': for (const member of type.members) referencedNames(member, names); break;
    case 'array': referencedNames(type.element, names); break;
    case 'record': referencedNames(type.value, names); break;
    case 'function':
      for (const parameter of type.parameters) referencedNames(parameter.type, names);
      referencedNames(type.returns, names);
      break;
    case 'object': for (const member of type.members) referencedNames(member.type, names); break;
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
    default: break;
  }
  return found;
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

/**
 * Validates a derived API document (packages/react/api/<slug>.json) against
 * derived-api.schema.json and the rules the grammar cannot state: details
 * cover exactly the listed props and events, each event names its on<Event>
 * prop, defaults belong to listed props and their enums, `types` holds
 * exactly the named types the details reach, and `never` is only an optional
 * object member's type.
 */
export function validateDerivedApi(document) {
  validateContractDocument('derived-api.schema.json', document);
  const { api } = document;
  const issues = [];
  if (!sameSet(api.props, Object.keys(api.propDetails))) {
    issues.push({ path: '$/api/propDetails', message: 'must describe exactly the listed props' });
  }
  if (!sameSet(api.events, Object.keys(api.eventDetails))) {
    issues.push({ path: '$/api/eventDetails', message: 'must describe exactly the listed events' });
  }
  for (const prop of api.props.filter((name) => /^on[A-Z]/u.test(name))) {
    issues.push({ path: `$/api/props/${prop}`, message: 'is an on<Event> prop; list it as an event' });
  }
  for (const [event, detail] of Object.entries(api.eventDetails)) {
    if (detail.prop !== `on${event[0].toUpperCase()}${event.slice(1)}`) {
      issues.push({ path: `$/api/eventDetails/${event}/prop`, message: `must be on${event[0].toUpperCase()}${event.slice(1)}` });
    }
  }
  for (const [prop, value] of Object.entries(api.defaults)) {
    const detail = api.propDetails[prop];
    if (!api.props.includes(prop) || detail === undefined) {
      issues.push({ path: `$/api/defaults/${prop}`, message: 'must default a listed prop' });
    } else if (detail.enum !== undefined && !detail.enum.includes(value)) {
      issues.push({ path: `$/api/defaults/${prop}`, message: 'must be one of the prop\'s enum values' });
    }
  }
  const reached = new Set();
  const pending = [...Object.values(api.propDetails), ...Object.values(api.eventDetails)]
    .flatMap(({ type }) => [...referencedNames(type, new Set())]);
  while (pending.length > 0) {
    const name = pending.pop();
    if (reached.has(name)) continue;
    reached.add(name);
    if (!Object.hasOwn(api.types, name)) {
      issues.push({ path: `$/api/types/${name}`, message: 'is referenced but not defined' });
      continue;
    }
    pending.push(...referencedNames(api.types[name].type, new Set()));
  }
  for (const name of Object.keys(api.types).filter((typeName) => !reached.has(typeName))) {
    issues.push({ path: `$/api/types/${name}`, message: 'is defined but no prop or event reaches it' });
  }
  const typed = [
    ...Object.entries(api.propDetails).map(([prop, { type }]) => [`$/api/propDetails/${prop}/type`, type]),
    ...Object.entries(api.eventDetails).map(([event, { type }]) => [`$/api/eventDetails/${event}/type`, type]),
    ...Object.entries(api.types).map(([name, { type }]) => [`$/api/types/${name}/type`, type]),
  ];
  for (const path of typed.flatMap(([at, type]) => misplacedNever(type, at))) {
    issues.push({ path, message: 'never is only an optional object member\'s type, a member that must be absent' });
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
 * `parts` taken from the concept anatomy. `derivedApis` maps a binding id to
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
    const { props, events, defaults, propDetails, eventDetails, types } = structuredClone(document.api);
    binding.api = { props, events, parts: [...component.anatomy], defaults, propDetails, eventDetails, types };
  }
  if (issues.length > 0) throw invalid(issues);
  return merged;
}
