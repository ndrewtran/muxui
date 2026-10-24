import { createRef } from 'react';
import type { Key } from 'react';
import {
  MultiSelect,
  TagSelect,
  type MultiSelectItem,
  type MultiSelectProps,
  type MultiSelectRootProps,
  type TagSelectItem,
  type TagSelectProps,
  type TagSelectRootProps,
} from '@muxui/react';

// MultiSelect and TagSelect are generic over the item they list. The item type is the caller's own, so the render function and the
// label function see its fields, and a field the item lacks, or has with another type, is refused.
type Fruit = { id: number; name: string; color: 'red' | 'green' };
const fruits: Fruit[] = [{ id: 1, name: 'Apple', color: 'red' }, { id: 2, name: 'Pear', color: 'green' }];

const inferred = (
  <>
    <MultiSelect.Root items={fruits} onSelectionChange={(keys) => { const selection: Set<Key> | 'all' = keys; void selection; }}>
      {(item) => <MultiSelect.Item textValue={item.name}>{item.color}</MultiSelect.Item>}
    </MultiSelect.Root>
    <TagSelect.Root items={fruits} getItemLabel={(item) => item.name.toUpperCase()} onSelectionChange={(keys) => { const selection: Set<Key> = keys; void selection; }}>
      {(item) => <TagSelect.Item textValue={item.name}>{item.color}</TagSelect.Item>}
    </TagSelect.Root>
  </>
);
void inferred;

// The type argument may be written, and then the items and the functions hold to it.
const explicit = (
  <>
    <MultiSelect.Root<Fruit> items={fruits}>{(item) => item.name}</MultiSelect.Root>
    <TagSelect.Root<Fruit> items={fruits} getItemLabel={(item) => item.name}>{(item) => item.name}</TagSelect.Root>
  </>
);
void explicit;
// @ts-expect-error An explicit type argument that the items do not match is refused.
const wrongArgument = <MultiSelect.Root<Fruit> items={[{ id: 1, name: 'Apple' }]} />;
void wrongArgument;
// @ts-expect-error The same holds for TagSelect.
const wrongTagArgument = <TagSelect.Root<Fruit> items={[{ id: 1, name: 'Apple' }]} />;
void wrongTagArgument;

// A type parameter that is not const keeps the widened type of what the items hold, so the id of an item written in place is a number, not 1.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const widened = (
  <>
    <MultiSelect.Root items={[{ id: 1, name: 'Apple' }]}>{(item) => { const exact: Same<typeof item.id, number> = true; return exact ? item.name : null; }}</MultiSelect.Root>
    <TagSelect.Root items={[{ id: 1, name: 'Apple' }]}>{(item) => { const exact: Same<typeof item.id, number> = true; return exact ? item.name : null; }}</TagSelect.Root>
  </>
);
void widened;

// An item needs a key, and a key is a string or a number.
// @ts-expect-error An item without an id is not a MultiSelect item.
const noId = <MultiSelect.Root items={[{ name: 'Apple' }]} />;
void noId;
// @ts-expect-error An item without an id is not a TagSelect item.
const noTagId = <TagSelect.Root items={[{ name: 'Apple' }]} />;
void noTagId;
// @ts-expect-error An id that is not a key is refused.
const badId = <MultiSelect.Root items={[{ id: { value: 1 } }]} />;
void badId;

// The render function receives the caller's item: a field it lacks is refused, and so is a field used as another type.
// @ts-expect-error Fruit has no weight.
const missingField = <MultiSelect.Root items={fruits}>{(item) => item.weight}</MultiSelect.Root>;
void missingField;
// @ts-expect-error Fruit has no weight.
const missingTagField = <TagSelect.Root items={fruits}>{(item) => item.weight}</TagSelect.Root>;
void missingTagField;
// @ts-expect-error A name is a string, which has no toFixed.
const wrongFieldType = <MultiSelect.Root items={fruits}>{(item) => item.name.toFixed(1)}</MultiSelect.Root>;
void wrongFieldType;
// @ts-expect-error A key is a number here, which a label function must not return.
const wrongLabelType = <TagSelect.Root items={fruits} getItemLabel={(item) => item.id}>{(item) => item.name}</TagSelect.Root>;
void wrongLabelType;
// @ts-expect-error The label function takes the caller's item, so it cannot ask for another shape.
const wrongLabelItem = <TagSelect.Root items={fruits} getItemLabel={(item: { id: string }) => item.id} />;
void wrongLabelItem;

// The selection is a set of keys; TagSelect never selects all.
// @ts-expect-error TagSelect's selection is a set of keys.
const wrongSelection = <TagSelect.Root items={fruits} selectedKeys="all" />;
void wrongSelection;
// @ts-expect-error A selection callback takes the set, not a list.
const wrongCallback = <MultiSelect.Root items={fruits} onSelectionChange={(keys: string[]) => void keys} />;
void wrongCallback;

// With no type argument and no items the item is the constraint, which holds an id and whatever else.
const defaulted: MultiSelectProps = { items: [{ id: 'a', name: 'Apple' }] };
const defaultedTags: TagSelectProps = { items: [{ id: 'a', name: 'Apple' }] };
const rootDefaulted: MultiSelectRootProps = defaulted;
const rootDefaultedTags: TagSelectRootProps = defaultedTags;
const constraint: MultiSelectItem = { id: 1, anything: true };
const tagConstraint: TagSelectItem = { id: 'a', anything: true };
void [rootDefaulted, rootDefaultedTags, constraint, tagConstraint];
const typed: MultiSelectProps<Fruit> = { items: fruits, children: (item) => item.name };
const typedTags: TagSelectProps<Fruit> = { items: fruits, getItemLabel: (item) => item.name, children: (item) => item.name };
void [typed, typedTags];
// @ts-expect-error Fruit's color is a literal, not any string.
const typedWrong: MultiSelectProps<Fruit> = { items: [{ id: 1, name: 'Apple', color: 'blue' }] };
void typedWrong;

// The ref is the root element's.
const rootRef = createRef<HTMLDivElement>();
const buttonRef = createRef<HTMLButtonElement>();
const refs = (
  <>
    <MultiSelect.Root ref={rootRef} items={fruits} />
    <TagSelect.Root ref={rootRef} items={fruits} />
  </>
);
void refs;
// @ts-expect-error The ref is a div's.
const wrongRef = <MultiSelect.Root ref={buttonRef} items={fruits} />;
void wrongRef;
