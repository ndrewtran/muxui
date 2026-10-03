/** @type {import('../anatomy.mjs').Anatomy} */
export default {
  family: 'text-field',
  component: 'TextField',
  name: 'TextField',
  axes: ['size'],
  states: ['rest', 'hover', 'focus-visible', 'disabled', 'invalid'],
  stateTarget: '.muxui-field-input',
  fixture: { label: 'Label', description: 'Description', defaultValue: 'Value' },
  parts: [
    { id: 'root', node: 'FRAME', selector: '.muxui-text-field', bind: ['gap', 'size'], layout: { direction: 'VERTICAL', previewWidth: 208 } },
    { id: 'label', parent: 'root', node: 'TEXT', selector: '.muxui-field-label', bind: ['text'] },
    {
      id: 'input',
      parent: 'root',
      node: 'FRAME',
      selector: '.muxui-field-input',
      bind: ['fill', 'overlay', 'stroke', 'radius', 'padding', 'size', 'shadow'],
      layout: { direction: 'HORIZONTAL', align: 'CENTER', centerInMinHeight: true },
    },
    { id: 'value', parent: 'input', node: 'TEXT', selector: '.muxui-field-input', bind: ['text'] },
    { id: 'description', parent: 'root', node: 'TEXT', selector: '.muxui-field-description', bind: ['text'] },
  ],
  preview: [
    'size=md,state=rest',
    'size=md,state=hover',
    'size=md,state=focus-visible',
    'size=md,state=invalid',
    'size=md,state=disabled',
  ],
  notes: [
    'The input value is a text child of the input frame, measured on the input element.',
    'The field is 100% wide in CSS; the component takes a fixed 208px preview width and the input fills it.',
    'Pressed does not apply to a text input; the error message part is not modelled in this batch.',
  ],
};
