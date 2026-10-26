import { partSelector } from '../../../../../packages/react/test/support/styling-parts.ts';

/** @type {import('../anatomy.mjs').Anatomy} */
export default {
  family: 'checkbox',
  component: 'Checkbox',
  name: 'Checkbox',
  axes: ['size'],
  // A Checkbox takes its size from an enclosing CheckboxGroup when it sets none, so the catalog states no default; a Checkbox on its own is md.
  axisDefaults: { size: 'md' },
  selection: { name: 'Value', values: { unchecked: {}, checked: { defaultChecked: true }, indeterminate: { indeterminate: true } } },
  states: ['rest', 'hover', 'pressed', 'focus-visible', 'disabled', 'invalid'],
  stateTarget: '.muxui-checkbox',
  fixture: { children: 'Label' },
  parts: [
    { id: 'root', node: 'FRAME', selector: partSelector('checkbox', 'root'), bind: ['gap', 'size'], layout: { direction: 'HORIZONTAL', align: 'CENTER' } },
    {
      id: 'indicator',
      parent: 'root',
      node: 'FRAME',
      selector: partSelector('checkbox', 'indicator'),
      bind: ['fill', 'overlay', 'stroke', 'radius', 'size', 'shadow'],
      layout: { direction: 'HORIZONTAL', align: 'CENTER', justify: 'CENTER' },
    },
    {
      id: 'glyph',
      parent: 'indicator',
      node: 'GLYPH',
      selector: '.muxui-checkbox__indicator svg',
      bind: ['size', 'text'],
      glyph: (variant) => (variant.selection === 'indeterminate' ? 'lucide-minus' : 'lucide-check'),
      when: (variant) => variant.selection !== 'unchecked',
    },
    { id: 'label', parent: 'root', node: 'TEXT', selector: partSelector('checkbox', 'label'), bind: ['text'] },
  ],
  preview: [
    'size=md,value=unchecked,state=rest',
    'size=md,value=unchecked,state=hover',
    'size=md,value=unchecked,state=focus-visible',
    'size=md,value=checked,state=rest',
    'size=md,value=checked,state=hover',
    'size=md,value=indeterminate,state=rest',
    'size=md,value=unchecked,state=disabled',
    'size=md,value=checked,state=disabled',
    'size=md,value=unchecked,state=invalid',
  ],
  notes: [
    'The unchecked glyph is CSS-hidden, so unchecked variants omit the glyph instance.',
    'Invalid is modelled as a state at rest; its edge also wins under hover in CSS.',
  ],
};
