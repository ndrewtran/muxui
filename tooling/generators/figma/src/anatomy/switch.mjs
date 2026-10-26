import { partSelector } from '../../../../../packages/react/test/support/styling-parts.ts';

/** @type {import('../anatomy.mjs').Anatomy} */
export default {
  family: 'switch',
  component: 'Switch',
  name: 'Switch',
  axes: ['size'],
  selection: { name: 'Selected', values: { off: {}, on: { defaultSelected: true } } },
  states: ['rest', 'hover', 'pressed', 'focus-visible', 'disabled', 'invalid'],
  stateTarget: '.muxui-switch',
  fixture: { label: 'Label' },
  parts: [
    {
      id: 'root',
      node: 'FRAME',
      selector: partSelector('switch', 'root'),
      bind: ['padding', 'gap', 'size'],
      layout: {
        direction: 'HORIZONTAL',
        align: 'CENTER',
        expressionTokens: { itemSpacing: 'semantic.layout.inset-tiny', from: 'padding-left' },
        ignore: { paddingLeft: 'CSS reserves the absolutely positioned track in the start padding; Figma lays the track out as a child.' },
      },
    },
    {
      id: 'track',
      parent: 'root',
      node: 'FRAME',
      selector: partSelector('switch', 'root'),
      pseudo: 'before',
      bind: ['fill', 'overlay', 'stroke', 'radius', 'size', 'shadow'],
      layout: {
        direction: 'HORIZONTAL',
        align: 'CENTER',
        justify: (variant) => (variant.selection === 'on' ? 'MAX' : 'MIN'),
        paddingFrom: { part: 'thumb', longhand: 'left' },
      },
    },
    { id: 'thumb', parent: 'track', node: 'FRAME', selector: partSelector('switch', 'indicator'), bind: ['fill', 'radius', 'size', 'shadow', 'inset'] },
    { id: 'label', parent: 'root', node: 'TEXT', selector: partSelector('switch', 'label'), bind: ['text'] },
  ],
  preview: [
    'size=md,selected=off,state=rest',
    'size=md,selected=off,state=hover',
    'size=md,selected=on,state=rest',
    'size=md,selected=on,state=hover',
    'size=md,selected=off,state=focus-visible',
    'size=md,selected=off,state=disabled',
    'size=md,selected=on,state=disabled',
    'size=md,selected=off,state=invalid',
  ],
  notes: [
    'The track is the ::before pseudo-element; it becomes a real frame holding the thumb.',
    'The thumb travels by transform in CSS; Figma aligns it to the start (off) or end (on) of the track.',
    'Track and thumb sizes are component-local CSS literals, not tokens.',
  ],
};
