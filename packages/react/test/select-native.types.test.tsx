import * as React from 'react';
import { SelectNative, type SelectNativeProps, type SelectNativeVisualSize } from '@muxui/react';

const selectRef = React.createRef<HTMLSelectElement>();
const visualSize: SelectNativeVisualSize = 'sm';
const props: SelectNativeProps = {
  id: 'panel',
  label: 'Saved panel',
  name: 'panel',
  defaultValue: 'inbox',
  size: visualSize,
  onChange: (event) => {
    const select: HTMLSelectElement = event.currentTarget;
    void select;
  },
};
const nativeList = <SelectNative ref={selectRef} {...props} size={4} multiple>
  <option value="inbox">Inbox</option>
</SelectNative>;
const nativeAttrs = <SelectNative ref={selectRef} aria-label="Panel" form="settings" autoComplete="off" title="Panel URL">
  <option value="inbox">Inbox</option>
</SelectNative>;
void [nativeList, nativeAttrs];

// Mux visual sizes are finite while numeric values retain native list sizing.
// @ts-expect-error SelectNative does not accept arbitrary visual size strings.
const invalidSize = <SelectNative label="Panel" size="medium" />;
void invalidSize;

// The forwarded ref targets the visible native select.
// @ts-expect-error SelectNative refs are HTMLSelectElement refs.
const wrongRef = <SelectNative label="Panel" ref={React.createRef<HTMLInputElement>()} />;
void wrongRef;
