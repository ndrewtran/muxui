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
