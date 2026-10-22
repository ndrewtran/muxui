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
  // unknown is no type of its own anywhere in the grammar.
  const keyword = structuredClone(document);
  keyword.api.types.Item.type.members[0].type = { kind: 'unknown' };
  rejects(() => validateDerivedApi(keyword), /api\/types\/Item\/type must match exactly one schema/u);
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
