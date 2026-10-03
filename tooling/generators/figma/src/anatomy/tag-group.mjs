const removable = (variant) => variant.selection === 'true';

/** @type {import('../anatomy.mjs').Anatomy} */
export default {
  family: 'tag-group',
  component: 'TagGroup',
  name: 'TagGroup',
  axes: [],
  // The story's default tag is not removable; `onRemove` adds the remove action.
  selection: { name: 'Removable', values: { false: {}, true: { onRemove: '$noop' } } },
  states: ['rest', 'hover', 'pressed', 'focus-visible', 'disabled'],
  stateTarget: '.muxui-tag',
  fixture: { label: 'Tags', items: ['Design'] },
  parts: [
    { id: 'root', node: 'FRAME', selector: '.muxui-tag-group', bind: ['gap'], layout: { direction: 'VERTICAL' } },
    { id: 'label', parent: 'root', node: 'TEXT', selector: '.muxui-field-label', bind: ['text'] },
    { id: 'list', parent: 'root', node: 'FRAME', selector: '.muxui-tag-list', bind: ['gap'], layout: { direction: 'HORIZONTAL' } },
    {
      id: 'tag',
      parent: 'list',
      node: 'FRAME',
      selector: '.muxui-tag',
      bind: ['fill', 'overlay', 'stroke', 'radius', 'padding', 'gap', 'size', 'shadow'],
      layout: { direction: 'HORIZONTAL', align: 'CENTER' },
    },
    { id: 'tag-label', parent: 'tag', node: 'TEXT', selector: '.muxui-tag', bind: ['text'] },
    {
      id: 'remove',
      parent: 'tag',
      node: 'FRAME',
      selector: '.muxui-tag-remove',
      bind: ['fill', 'overlay', 'stroke', 'radius', 'padding', 'size', 'shadow'],
      layout: { direction: 'HORIZONTAL', align: 'CENTER', justify: 'CENTER' },
      when: removable,
    },
    { id: 'remove-glyph', parent: 'remove', node: 'GLYPH', selector: '.muxui-tag-remove svg', bind: ['size', 'text'], glyph: () => 'lucide-x', when: removable },
  ],
  preview: [
    'removable=false,state=rest',
    'removable=false,state=hover',
    'removable=false,state=pressed',
    'removable=false,state=focus-visible',
    'removable=false,state=disabled',
  ],
  notes: [
    'The tag text is a bare text node, so the tag label is measured on the tag element.',
    'The remove action is a ghost IconButton; its X glyph is a lucide glyph instance. Removable=true variants add it, as onRemove does.',
  ],
};
