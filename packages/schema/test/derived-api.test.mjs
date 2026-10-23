import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SchemaValidationError,
  mergeDerivedApis,
  validateDerivedApi,
  validateFamily,
} from '../src/index.mjs';
import { component } from './fixtures.mjs';

function derived() {
  return {
    schema: 'muxui-derived-api-v1',
    generatedFrom: 'packages/react/src/button.ts',
    component: 'muxui:component:button',
    binding: 'web.react',
    export: 'Button',
    api: {
      props: ['disabled', 'variant'],
      events: ['activate'],
      defaults: { variant: 'primary' },
      propDetails: {
        disabled: { type: { kind: 'boolean' }, required: false, description: 'Prevents activation.' },
        variant: {
          type: { kind: 'reference', name: 'ButtonVariant' },
          required: false,
          enum: ['primary', 'secondary'],
        },
      },
      eventDetails: {
        activate: {
          prop: 'onActivate',
          type: {
            kind: 'function',
            parameters: [{ name: 'event', type: { kind: 'reference', name: 'ActivationEvent' }, required: true }],
            returns: { kind: 'void' },
          },
          required: false,
        },
      },
      types: {
        ActivationEvent: {
          type: {
            kind: 'object',
            members: [{
              name: 'pointerType',
              type: { kind: 'union', members: [{ kind: 'literal', value: 'mouse' }, { kind: 'literal', value: 'keyboard' }] },
              required: true,
              readonly: true,
            }],
          },
        },
        ButtonVariant: {
          type: { kind: 'union', members: [{ kind: 'literal', value: 'primary' }, { kind: 'literal', value: 'secondary' }] },
        },
      },
    },
  };
}

/** The fixture component with its web.react api left to a derived block. */
function authored() {
  const record = component();
  delete record.bindings['web.react'].api;
  return record;
}

function rejects(callback, message) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof SchemaValidationError);
    assert.equal(error.code, 'MUXUI_SCHEMA_INVALID');
    if (message) assert.match(error.message, message);
    return true;
  });
}

test('a derived block merges into its binding with parts from the concept anatomy', () => {
  const record = authored();
  const before = structuredClone(record);
  const merged = mergeDerivedApis(record, { 'web.react': derived() });
  assert.deepEqual(record, before, 'the authored record is not modified');
  assert.deepEqual(merged.bindings['web.react'].api, {
    props: ['disabled', 'variant'],
    events: ['activate'],
    parts: ['root', 'label'],
    defaults: { variant: 'primary' },
    propDetails: derived().api.propDetails,
    eventDetails: derived().api.eventDetails,
    types: derived().api.types,
  });
  assert.deepEqual(merged.bindings['web.html'], record.bindings['web.html']);
  validateFamily('component', merged);
  // The authored record without the api still validates; the merge supplies it.
  validateFamily('component', record);
  assert.deepEqual(mergeDerivedApis(component()), component(), 'authored apis need no derived block');
});

test('every implemented binding takes exactly one of an authored or a derived api', () => {
  rejects(() => mergeDerivedApis(component(), { 'web.react': derived() }), /remove the authored api/u);
  rejects(() => mergeDerivedApis(authored()), /needs an authored api or a derived API source/u);
  const unsupported = authored();
  unsupported.bindings['web.react'] = { schemaVersion: '2.0.0', strategy: 'unsupported', reason: 'Not yet.', platformSafety: unsupported.bindings['web.react'].platformSafety };
  rejects(() => mergeDerivedApis(unsupported, { 'web.react': derived() }), /unsupported binding takes no derived API/u);
  rejects(() => mergeDerivedApis(authored(), { 'web.react': derived(), 'web.vue': derived() }), /has a derived API but no binding/u);
  const elsewhere = derived();
  elsewhere.component = 'muxui:component:link';
  rejects(() => mergeDerivedApis(authored(), { 'web.react': elsewhere }), /names muxui:component:link#web\.react/u);
  const typedAuthored = component();
  typedAuthored.bindings['web.html'].api.propDetails = {};
  rejects(() => mergeDerivedApis(typedAuthored), /propDetails is derived only/u);
});

test('a derived document must be internally consistent', () => {
  validateDerivedApi(derived());
  const cases = [
    [(document) => { document.api.propDetails.variant.type = { kind: 'symbol' }; }, /api\/propDetails\/variant\/type/u],
    [(document) => { document.api.extra = true; }, /api\/extra is an unknown field/u],
    [(document) => { document.binding = 'web.html'; }, /\$\/binding must equal/u],
    [(document) => { document.generatedFrom = 'packages/react/src/button.mjs'; }, /generatedFrom does not match/u],
    [(document) => { document.api.props.push('size'); }, /describe exactly the listed props/u],
    [(document) => { delete document.api.eventDetails.activate; }, /describe exactly the listed events/u],
    [(document) => { document.api.eventDetails.activate.prop = 'onPress'; }, /must be onActivate/u],
    [(document) => {
      document.api.props.push('onPress');
      document.api.propDetails.onPress = { type: { kind: 'boolean' }, required: false };
    }, /list it as an event/u],
    [(document) => { document.api.defaults.size = 'md'; }, /defaults\/size must default a listed prop/u],
    [(document) => { document.api.defaults.variant = 'ghost'; }, /enum values/u],
    [(document) => { delete document.api.types.ActivationEvent; }, /ActivationEvent is referenced but not defined/u],
    [(document) => { document.api.types.Unused = { type: { kind: 'string' } }; }, /Unused is defined but no prop or event reaches it/u],
  ];
  for (const [mutate, message] of cases) {
    const document = derived();
    mutate(document);
    rejects(() => validateDerivedApi(document), message);
  }
  // A named type reached only through another named type is not an orphan.
  const nested = derived();
  const [pointer] = nested.api.types.ActivationEvent.type.members;
  nested.api.types.Pointer = { type: pointer.type };
  pointer.type = { kind: 'reference', name: 'Pointer' };
  validateDerivedApi(nested);
});

test('never is only an optional object member\'s type, a member that must be absent', () => {
  const absent = (type) => {
    const document = derived();
    document.api.props.push('rows');
    document.api.propDetails.rows = { type, required: false };
    return document;
  };
  const member = (required) => ({ kind: 'object', members: [{ name: 'before', type: { kind: 'never' }, required, readonly: true }] });
  validateDerivedApi(absent(member(false)));
  rejects(() => validateDerivedApi(absent(member(true))), /propDetails\/rows\/type\/members\/0\/type never is only an optional object member's type/u);
  rejects(() => validateDerivedApi(absent({ kind: 'never' })), /propDetails\/rows\/type never is only/u);
  rejects(() => validateDerivedApi(absent({ kind: 'array', element: { kind: 'never' }, readonly: true })), /rows\/type\/element never is only/u);
  rejects(() => validateDerivedApi(absent({ kind: 'union', members: [{ kind: 'string' }, { kind: 'never' }] })), /rows\/type\/members\/1 never is only/u);
  rejects(() => validateDerivedApi(absent({ kind: 'record', value: { kind: 'never' }, readonly: true })), /rows\/type\/value never is only/u);
});

test('a record holds caller-keyed values, and the names its values reach are defined', () => {
  const document = derived();
  document.api.props.push('values');
  document.api.propDetails.values = { type: { kind: 'reference', name: 'Values' }, required: false };
  document.api.types.Values = { type: { kind: 'record', value: { kind: 'reference', name: 'Value' }, readonly: true } };
  document.api.types.Value = { type: { kind: 'union', members: [{ kind: 'string' }, { kind: 'null' }] } };
  validateDerivedApi(document);
  // The record's value type reaches Value, so removing it leaves a dangling reference.
  const dangling = structuredClone(document);
  delete dangling.api.types.Value;
  rejects(() => validateDerivedApi(dangling), /Value is referenced but not defined/u);
  for (const mutate of [
    (record) => { delete record.readonly; },
    (record) => { record.key = { kind: 'number' }; },
    (record) => { delete record.value; },
  ]) {
    const invalid = structuredClone(document);
    mutate(invalid.api.types.Values.type);
    rejects(() => validateDerivedApi(invalid), /api\/types\/Values\/type/u);
  }
});

test('a host type may carry type arguments, and the names and never they hold are checked like any type', () => {
  const application = (...typeArguments) => ({ kind: 'host', name: 'AsyncIterable', typeArguments });
  const withItems = (...typeArguments) => {
    const document = derived();
    document.api.props.push('items');
    document.api.propDetails.items = { type: application(...typeArguments), required: false };
    return document;
  };
  const excluded = { kind: 'host', name: 'Exclude', typeArguments: [{ kind: 'host', name: 'React.ReactNode' }, { kind: 'union', members: [{ kind: 'null' }, { kind: 'undefined' }, { kind: 'boolean' }] }] };
  const document = derived();
  document.api.props.push('title');
  document.api.propDetails.title = { type: excluded, required: false };
  validateDerivedApi(document);

  // A Mux UI-owned type reached only through an argument is reached: it must be defined, and defined means used.
  const reached = withItems({ kind: 'reference', name: 'Item' });
  rejects(() => validateDerivedApi(reached), /Item is referenced but not defined/u);
  reached.api.types.Item = { type: { kind: 'object', members: [{ name: 'id', type: { kind: 'string' }, required: true, readonly: true }] } };
  validateDerivedApi(reached);
  const orphan = withItems({ kind: 'string' });
  orphan.api.types.Item = reached.api.types.Item;
  rejects(() => validateDerivedApi(orphan), /Item is defined but no prop or event reaches it/u);

  // A name reached through a nested application is reached too, and never is out of place inside an argument.
  const nested = withItems({ kind: 'host', name: 'Promise', typeArguments: [{ kind: 'reference', name: 'Item' }] });
  rejects(() => validateDerivedApi(nested), /Item is referenced but not defined/u);
  rejects(() => validateDerivedApi(withItems({ kind: 'never' })), /propDetails\/items\/type\/typeArguments\/0 never is only an optional object member's type/u);
  rejects(() => validateDerivedApi(withItems({ kind: 'union', members: [{ kind: 'string' }, { kind: 'never' }] })), /propDetails\/items\/type\/typeArguments\/0\/members\/1 never is only/u);

  // The schema: an application has at least one argument, as an array of types, and no other key.
  for (const mutate of [
    (type) => { type.typeArguments = []; },
    (type) => { type.typeArguments = { kind: 'string' }; },
    (type) => { type.typeArguments = [{ kind: 'symbol' }]; },
    (type) => { type.typeArguments = [{ kind: 'string' }]; type.arguments = true; },
  ]) {
    const invalid = withItems({ kind: 'string' });
    mutate(invalid.api.propDetails.items.type);
    rejects(() => validateDerivedApi(invalid), /api\/propDetails\/items\/type/u);
  }
});

/** An open item as `interface Item { id?: string; [key: string]: unknown }` extracts. */
const openItem = () => ({ kind: 'object', members: [{ name: 'id', type: { kind: 'string' }, required: false, readonly: false }], additional: 'unknown' });

test('an object type may carry additional "unknown", and nothing else carries or spells it', () => {
  const document = derived();
  document.api.props.push('items');
  document.api.propDetails.items = { type: { kind: 'array', element: { kind: 'reference', name: 'Item' }, readonly: false }, required: false };
  document.api.types.Item = { type: openItem() };
  validateDerivedApi(document);
  // The marker is a constant: another value, a record, a union, or a missing members list is not it.
  for (const mutate of [
    (type) => { type.additional = 'string'; },
    (type) => { type.additional = true; },
    (type) => { type.additional = { kind: 'unknown' }; },
    (type) => { type.kind = 'record'; type.value = { kind: 'string' }; type.readonly = false; delete type.members; },
    (type) => { delete type.members; },
  ]) {
    const invalid = structuredClone(document);
    mutate(invalid.api.types.Item.type);
    rejects(() => validateDerivedApi(invalid), /api\/types\/Item\/type/u);
  }
  // The marker is no type: unknown as a member's type is refused by its place, as everywhere but a returned Promise.
  const keyword = structuredClone(document);
  keyword.api.types.Item.type.members[0].type = { kind: 'unknown' };
  rejects(() => validateDerivedApi(keyword), /api\/types\/Item\/type\/members\/0\/type unknown is only the sole argument of a Promise that a function returns/u);
});

/** The document with one more prop, `rows`, of the given type, and the named types it reaches. */
function withRows(type, types = {}) {
  const document = derived();
  document.api.props.push('rows');
  document.api.propDetails.rows = { type: structuredClone(type), required: false };
  Object.assign(document.api.types, structuredClone(types));
  return document;
}

/** The same prop in the `label` part of a compound, so a rule is checked at the part's own path. */
function withPartRows(type, types = {}) {
  const document = compound();
  const block = document.api.partApis.label;
  block.props.push('rows');
  block.propDetails.rows = { type: structuredClone(type), required: false };
  Object.assign(block.types, structuredClone(types));
  return document;
}

const string = { kind: 'string' };
const block = { kind: 'reference', name: 'Block' };
const blockTypes = () => ({ Block: { type: { kind: 'object', members: [{ name: 'content', type: { kind: 'tuple', elements: [{ kind: 'reference', name: 'Block' }], rest: { kind: 'reference', name: 'Block' } }, required: false, readonly: false }] } } });

test('a tuple is a non-empty prefix and an optional rest, and the names and never in it are checked like any type', () => {
  for (const make of [withRows, withPartRows]) {
    const at = make === withRows ? 'api' : 'api/partApis/label';
    validateDerivedApi(make({ kind: 'tuple', elements: [string, { kind: 'number' }] }));
    validateDerivedApi(make({ kind: 'tuple', elements: [string], rest: { kind: 'union', members: [{ kind: 'number' }, { kind: 'null' }] } }));
    // A recursive tuple reaches its own name through its elements and its rest.
    validateDerivedApi(make(block, blockTypes()));
    for (const [path, tuple] of [
      ['elements/0', { kind: 'tuple', elements: [block] }],
      ['rest', { kind: 'tuple', elements: [string], rest: block }],
      ['elements/1', { kind: 'tuple', elements: [string, block] }],
    ]) {
      rejects(() => validateDerivedApi(make(tuple)), /Block is referenced but not defined/u, `${at} ${path}`);
      // Reached only through a tuple, so the name is defined and used.
      validateDerivedApi(make(tuple, { Block: { type: string } }));
    }
    const unreached = make(string, { Block: { type: string } });
    rejects(() => validateDerivedApi(unreached), /Block is defined but no prop or event reaches it/u);
    // The shape: kind, a non-empty elements array of types, an optional rest type, and nothing more.
    for (const mutate of [
      (type) => { type.elements = []; },
      (type) => { delete type.elements; },
      (type) => { type.elements = string; },
      (type) => { type.elements = [{ kind: 'symbol' }]; },
      (type) => { type.rest = [string]; },
      (type) => { type.rest = { kind: 'symbol' }; },
      (type) => { type.optional = true; },
    ]) {
      const invalid = make({ kind: 'tuple', elements: [string], rest: string });
      mutate(invalid.api.propDetails?.rows?.type ?? invalid.api.partApis.label.propDetails.rows.type);
      rejects(() => validateDerivedApi(invalid), new RegExp(`${at}/propDetails/rows/type`, 'u'));
    }
    // never stays out of a tuple, as everywhere but an optional object member.
    rejects(() => validateDerivedApi(make({ kind: 'tuple', elements: [{ kind: 'never' }] })), new RegExp(`${at}/propDetails/rows/type/elements/0 never is only`, 'u'));
    rejects(() => validateDerivedApi(make({ kind: 'tuple', elements: [string, { kind: 'never' }], rest: string })), new RegExp(`${at}/propDetails/rows/type/elements/1 never is only`, 'u'));
    rejects(() => validateDerivedApi(make({ kind: 'tuple', elements: [string], rest: { kind: 'never' } })), new RegExp(`${at}/propDetails/rows/type/rest never is only`, 'u'));
  }
});

test('unknown is only the sole argument of a Promise that a function returns, directly or in its return union', () => {
  const promised = { kind: 'host', name: 'Promise', typeArguments: [{ kind: 'unknown' }] };
  const fn = (returns, parameters = []) => ({ kind: 'function', parameters, returns });
  const parameter = (type) => ({ name: 'value', type, required: true });
  const handler = (type) => ({ kind: 'object', members: [{ name: 'done', type, required: true, readonly: false }] });
  for (const make of [withRows, withPartRows]) {
    const at = make === withRows ? 'api' : 'api/partApis/label';
    const rows = (type) => make(type);
    // Direct, in a union with void, in a nested union, in a function that is a parameter, and in a function that is a member.
    validateDerivedApi(rows(fn(promised)));
    validateDerivedApi(rows(fn({ kind: 'union', members: [{ kind: 'void' }, promised] })));
    validateDerivedApi(rows(fn({ kind: 'union', members: [{ kind: 'union', members: [{ kind: 'void' }, promised] }, string] })));
    validateDerivedApi(rows(fn({ kind: 'void' }, [parameter(fn(promised))])));
    validateDerivedApi(rows(handler(fn(promised))));
    validateDerivedApi(rows(fn(promised, [parameter(fn(promised))])));

    const misplaced = [
      ['bare, as a prop type', { kind: 'unknown' }, 'type'],
      ['bare, as a return', fn({ kind: 'unknown' }), 'type/returns'],
      ['bare, in a return union', fn({ kind: 'union', members: [{ kind: 'void' }, { kind: 'unknown' }] }), 'type/returns/members/1'],
      ['the promise as a prop type', promised, 'type/typeArguments/0'],
      ['the promise as a parameter', fn({ kind: 'void' }, [parameter(promised)]), 'type/parameters/0/type/typeArguments/0'],
      ['the promise as a parameter, beside a returned one', fn(promised, [parameter(promised)]), 'type/parameters/0/type/typeArguments/0'],
      ['the promise in an array return', fn({ kind: 'array', element: promised, readonly: false }), 'type/returns/element/typeArguments/0'],
      ['the promise in a tuple return', fn({ kind: 'tuple', elements: [promised] }), 'type/returns/elements/0/typeArguments/0'],
      ['the promise in a tuple rest', fn({ kind: 'tuple', elements: [string], rest: promised }), 'type/returns/rest/typeArguments/0'],
      ['the promise in a record return', fn({ kind: 'record', value: promised, readonly: false }), 'type/returns/value/typeArguments/0'],
      ['the promise as a member of an object return', fn(handler(promised)), 'type/returns/members/0/type/typeArguments/0'],
      ['the promise as a member of an object', handler(promised), 'type/members/0/type/typeArguments/0'],
      ['unknown in the argument union', fn({ kind: 'host', name: 'Promise', typeArguments: [{ kind: 'union', members: [{ kind: 'unknown' }, { kind: 'void' }] }] }), 'type/returns/typeArguments/0/members/0'],
      ['another host with unknown', fn({ kind: 'host', name: 'Set', typeArguments: [{ kind: 'unknown' }] }), 'type/returns/typeArguments/0'],
      ['a nested promise', fn({ kind: 'host', name: 'Promise', typeArguments: [promised] }), 'type/returns/typeArguments/0/typeArguments/0'],
      ['a promise of two arguments', fn({ kind: 'host', name: 'Promise', typeArguments: [{ kind: 'unknown' }, string] }), 'type/returns/typeArguments/0'],
      ['a prefixed Promise', fn({ kind: 'host', name: 'React.Promise', typeArguments: [{ kind: 'unknown' }] }), 'type/returns/typeArguments/0'],
    ];
    for (const [label, type, path] of misplaced) {
      rejects(() => validateDerivedApi(rows(type)), new RegExp(`${at}/propDetails/rows/${path} unknown is only the sole argument of a Promise that a function returns`, 'u'), label);
    }
    // The same place in a named type and in an event: a named type holds a function, and an event is one.
    const named = make({ kind: 'reference', name: 'Later' }, { Later: { type: fn(promised) } });
    validateDerivedApi(named);
    const badNamed = make({ kind: 'reference', name: 'Later' }, { Later: { type: handler(promised) } });
    rejects(() => validateDerivedApi(badNamed), new RegExp(`${at}/types/Later/type/members/0/type/typeArguments/0 unknown is only`, 'u'));
  }
  const event = derived();
  event.api.eventDetails.activate.type.returns = promised;
  validateDerivedApi(event);
  event.api.eventDetails.activate.type.parameters.push({ name: 'later', type: promised, required: true });
  rejects(() => validateDerivedApi(event), /api\/eventDetails\/activate\/type\/parameters\/1\/type\/typeArguments\/0 unknown is only/u);
});

test('a method is a required, writable, function-valued member of an object with no marker', () => {
  const run = (overrides = {}) => ({
    name: 'run', type: { kind: 'function', parameters: [], returns: { kind: 'boolean' } }, required: true, readonly: false, method: true, description: 'Runs it.', ...overrides,
  });
  const object = (...members) => ({ kind: 'object', members });
  const prop = { name: 'label', type: string, required: false, readonly: true };
  for (const make of [withRows, withPartRows]) {
    const at = make === withRows ? 'api' : 'api/partApis/label';
    validateDerivedApi(make(object(run(), prop)));
    // In a callback's parameter, in a named type, and beside the function property it differs from.
    validateDerivedApi(make({ kind: 'function', parameters: [{ name: 'actions', type: object(run()), required: true }], returns: { kind: 'void' } }));
    validateDerivedApi(make({ kind: 'reference', name: 'Actions' }, { Actions: { type: object(run(), prop) } }));

    // The grammar reports a bad type where the type starts, as it does for every shape it refuses.
    const invalid = [
      ['optional', run({ required: false })],
      ['readonly', run({ readonly: true })],
      ['string-valued', run({ type: string })],
      ['optional and string-valued', run({ required: false, type: string })],
      ['readonly and string-valued', run({ readonly: true, type: string })],
      ['a union of functions', run({ type: { kind: 'union', members: [run().type, run().type] } })],
      ['a reference', run({ type: { kind: 'reference', name: 'Fn' } })],
      ['false', run({ method: false })],
      ['a string', run({ method: 'true' })],
    ];
    for (const [label, member] of invalid) {
      const document = make(object(member));
      Object.assign(document.api.types, { Fn: { type: run().type } });
      rejects(() => validateDerivedApi(document), new RegExp(`${at}/propDetails/rows/type must match exactly one schema`, 'u'), label);
    }
    // A method beside the D1 marker is refused whatever else holds, and a property beside it is not.
    validateDerivedApi(make({ ...object(prop), additional: 'unknown' }));
    rejects(() => validateDerivedApi(make({ ...object(run(), prop), additional: 'unknown' })), new RegExp(`${at}/propDetails/rows/type must match exactly one schema`, 'u'));
    rejects(() => validateDerivedApi(make({ ...object(prop, run()), additional: 'unknown' })), new RegExp(`${at}/propDetails/rows/type must match exactly one schema`, 'u'));
    // The flag is a member's: no prop, event, or named type carries it, and a record or array has no members for it.
    const flagged = make(string);
    (flagged.api.partApis?.label ?? flagged.api).propDetails.rows.method = true;
    rejects(() => validateDerivedApi(flagged), new RegExp(`${at}/propDetails/rows/method is an unknown field`, 'u'));
    const flaggedType = make(string);
    (flaggedType.api.partApis?.label ?? flaggedType.api).propDetails.rows.type.method = true;
    rejects(() => validateDerivedApi(flaggedType), new RegExp(`${at}/propDetails/rows/type must match exactly one schema`, 'u'));
  }
  // An event's type is a function; its parameters' object types hold methods like any other.
  const event = derived();
  event.api.eventDetails.activate.type.parameters.push({ name: 'actions', type: object(run()), required: true });
  validateDerivedApi(event);
  event.api.eventDetails.activate.method = true;
  rejects(() => validateDerivedApi(event), /api\/eventDetails\/activate\/method is an unknown field/u);
});

/** A document whose compound has a root block and two parts, as ListBox does with its section and item. */
function compound() {
  const document = derived();
  document.api.partApis = {
    label: {
      member: 'Label',
      props: ['title'],
      events: [],
      defaults: {},
      propDetails: { title: { type: { kind: 'string' }, required: false } },
      eventDetails: {},
      types: {},
    },
    item: {
      member: 'Item',
      props: ['id', 'tone'],
      events: ['action'],
      defaults: { tone: 'quiet' },
      propDetails: {
        id: { type: { kind: 'string' }, required: true },
        tone: { type: { kind: 'union', members: [{ kind: 'literal', value: 'quiet' }, { kind: 'literal', value: 'loud' }] }, required: false, enum: ['quiet', 'loud'] },
      },
      eventDetails: {
        action: { prop: 'onAction', type: { kind: 'function', parameters: [{ name: 'item', type: { kind: 'reference', name: 'ActivationEvent' }, required: false }], returns: { kind: 'void' } }, required: false },
      },
      // The same ActivationEvent as the root defines.
      types: { ActivationEvent: structuredClone(document.api.types.ActivationEvent) },
    },
  };
  return document;
}

test('partApis keys each part\'s API by anatomy part, and merges into the binding under the component\'s own anatomy', () => {
  const document = compound();
  validateDerivedApi(document);
  const record = authored();
  record.anatomy = ['root', 'label', 'item'];
  const merged = mergeDerivedApis(record, { 'web.react': document });
  assert.deepEqual(merged.bindings['web.react'].api.partApis, document.api.partApis);
  assert.deepEqual(merged.bindings['web.react'].api.parts, ['root', 'label', 'item']);
  assert.deepEqual(Object.keys(merged.bindings['web.react'].api), ['props', 'events', 'parts', 'defaults', 'propDetails', 'eventDetails', 'types', 'partApis']);
  validateFamily('component', merged);
  // Without partApis the merged api carries none.
  assert.equal(Object.hasOwn(mergeDerivedApis(record, { 'web.react': derived() }).bindings['web.react'].api, 'partApis'), false);
  // A key that is no anatomy part is rejected at the merge, whatever the document says.
  const stray = compound();
  stray.api.partApis.popup = { ...structuredClone(stray.api.partApis.item), member: 'Popup' };
  validateDerivedApi(stray);
  rejects(() => mergeDerivedApis(record, { 'web.react': stray }), /partApis\/popup is not a part of the component anatomy/u);
  // The document is merged into a copy: the input is untouched.
  assert.deepEqual(document, compound());
  // An authored api may not carry partApis.
  const typedAuthored = component();
  typedAuthored.bindings['web.html'].api.partApis = {};
  rejects(() => mergeDerivedApis(typedAuthored), /partApis is derived only/u);
});

test('a part block obeys the root\'s rules at its own path, and a repeated member or type is rejected across blocks', () => {
  const cases = [
    // The grammar: the map is non-empty and keyed by an anatomy-shaped name; each part is closed and complete.
    [(api) => { api.partApis = {}; }, /api\/partApis/u],
    [(api) => { api.partApis.Item = api.partApis.item; delete api.partApis.item; }, /api\/partApis/u],
    [(api) => { api.partApis.item.extra = true; }, /api\/partApis\/item\/extra is an unknown field/u],
    [(api) => { delete api.partApis.item.defaults; }, /api\/partApis\/item/u],
    [(api) => { delete api.partApis.item.member; }, /api\/partApis\/item/u],
    [(api) => { api.partApis.item.member = 'item'; }, /api\/partApis\/item\/member/u],
    [(api) => { api.partApis.item.propDetails.id.type = { kind: 'symbol' }; }, /api\/partApis\/item\/propDetails\/id\/type/u],
    // Each part is checked on its own, with the path of its block.
    [(api) => { api.partApis.item.props.push('size'); }, /api\/partApis\/item\/propDetails must describe exactly the listed props/u],
    [(api) => { delete api.partApis.item.eventDetails.action; }, /api\/partApis\/item\/eventDetails must describe exactly the listed events/u],
    [(api) => { api.partApis.item.eventDetails.action.prop = 'onPress'; }, /api\/partApis\/item\/eventDetails\/action\/prop must be onAction/u],
    [(api) => { api.partApis.item.defaults.size = 'md'; }, /api\/partApis\/item\/defaults\/size must default a listed prop/u],
    [(api) => { api.partApis.item.defaults.tone = 'loudest'; }, /api\/partApis\/item\/defaults\/tone must be one of the prop's enum values/u],
    [(api) => { delete api.partApis.item.types.ActivationEvent; }, /api\/partApis\/item\/types\/ActivationEvent is referenced but not defined/u],
    [(api) => { api.partApis.label.types.Unused = { type: { kind: 'string' } }; }, /api\/partApis\/label\/types\/Unused is defined but no prop or event reaches it/u],
    [(api) => {
      api.partApis.item.propDetails.id.type = { kind: 'object', members: [{ name: 'x', type: { kind: 'never' }, required: true, readonly: false }] };
    }, /api\/partApis\/item\/propDetails\/id\/type\/members\/0\/type never is only/u],
    // The root's types do not define a part's references, and a part's do not define the root's.
    [(api) => { delete api.partApis.item.types.ActivationEvent; api.partApis.item.eventDetails.action.type.parameters = [{ name: 'item', type: { kind: 'reference', name: 'ButtonVariant' }, required: false }]; }, /api\/partApis\/item\/types\/ButtonVariant is referenced but not defined/u],
    // Across blocks, one member stands for one anatomy part.
    [(api) => { api.partApis.label.member = 'Item'; }, /api\/partApis\/item\/member is also the member of label/u],
    // A named type one block defines differently from another is two types of one name.
    [(api) => { api.partApis.item.types.ActivationEvent.type.members[0].required = false; }, /api\/partApis\/item\/types\/ActivationEvent is defined differently from \$\/api\/types\/ActivationEvent/u],
    [(api) => { api.partApis.item.types.ActivationEvent.description = 'The event.'; }, /api\/partApis\/item\/types\/ActivationEvent is defined differently/u],
    [(api) => {
      api.partApis.label.props.push('event');
      api.partApis.label.propDetails.event = { type: { kind: 'reference', name: 'ActivationEvent' }, required: false };
      api.partApis.label.types.ActivationEvent = { type: { kind: 'string' } };
    }, /api\/partApis\/label\/types\/ActivationEvent is defined differently from \$\/api\/types\/ActivationEvent/u],
  ];
  for (const [mutate, message] of cases) {
    const document = compound();
    mutate(document.api);
    rejects(() => validateDerivedApi(document), message);
  }
  // The same named type repeated identically, in the root and in two parts, is one type.
  const repeated = compound();
  repeated.api.partApis.label.props.push('event');
  repeated.api.partApis.label.propDetails.event = { type: { kind: 'reference', name: 'ActivationEvent' }, required: false };
  repeated.api.partApis.label.types.ActivationEvent = structuredClone(repeated.api.types.ActivationEvent);
  validateDerivedApi(repeated);
  // A part's open item is the same type as the root's open item when written alike, and a different one when not.
  const open = compound();
  for (const block of [open.api, open.api.partApis.label]) {
    block.props.push('items');
    block.propDetails.items = { type: { kind: 'reference', name: 'Item' }, required: false };
    block.types.Item = { type: openItem() };
  }
  validateDerivedApi(open);
  delete open.api.partApis.label.types.Item.type.additional;
  rejects(() => validateDerivedApi(open), /api\/partApis\/label\/types\/Item is defined differently from \$\/api\/types\/Item/u);
});
