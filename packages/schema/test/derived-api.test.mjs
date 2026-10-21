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
