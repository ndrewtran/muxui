import type { MuxUITableRow } from '@muxui/react';

// A row's values are keyed by column id, a string. The public-surface check compares an exported subject's keys but not
// the keys of an object nested under one of its properties, so this holds the nested key: a string index signature would
// widen `keyof` to string | number and let a numeric key stand for a column id.
type RowValues = NonNullable<MuxUITableRow['values']>;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const keyIsString: Equal<keyof RowValues, string> = true;
// @ts-expect-error A numeric key is not a column id.
const numericKey: keyof RowValues = 0;
const stringKey: keyof RowValues = 'name';
void [keyIsString, numericKey, stringKey];
