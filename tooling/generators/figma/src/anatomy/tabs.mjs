const filled = (variant) => variant.axes.variant !== 'underline';

/** @type {import('../anatomy.mjs').Anatomy} */
export default {
  family: 'tabs',
  component: 'Tabs',
  name: 'Tabs',
  axes: ['variant', 'size'],
  states: ['rest', 'hover', 'pressed', 'focus-visible', 'disabled'],
  // The second tab carries the state; the first stays selected at rest.
  stateTarget: '.muxui-tab[data-key="b"]',
  fixture: {
    'aria-label': 'Sections',
    items: [{ id: 'a', label: 'Selected', panel: 'Selected panel' }, { id: 'b', label: 'Tab', panel: 'Tab panel' }],
  },
  parts: [
    { id: 'root', node: 'FRAME', selector: '.muxui-tabs-motion', bind: ['fill', 'radius'], layout: { direction: 'HORIZONTAL' } },
    { id: 'list', parent: 'root', node: 'FRAME', selector: '.muxui-tab-list', bind: ['fill', 'stroke', 'radius', 'padding', 'gap'], layout: { direction: 'HORIZONTAL' } },
    {
      id: 'selected',
      parent: 'list',
      node: 'FRAME',
      selector: '.muxui-tab[data-key="a"]',
      bind: ['fill', 'overlay', 'stroke', 'radius', 'padding', 'gap', 'size', 'shadow'],
      layout: { direction: 'HORIZONTAL', align: 'CENTER', justify: 'CENTER', centerInMinHeight: true },
    },
    {
      id: 'indicator-shape',
      parent: 'selected',
      node: 'FRAME',
      selector: '.muxui-tabs-motion-underline',
      bind: ['fill', 'radius'],
      layout: { placement: 'fill' },
      when: filled,
    },
    {
      id: 'selected-label',
      parent: 'selected',
      node: 'TEXT',
      selector: '.muxui-tab[data-key="a"] .muxui-tab-label',
      bind: ['text'],
      measureFrom: (variant) => (filled(variant) ? { color: '.muxui-tabs-motion-foreground .muxui-tabs-motion-label:first-child' } : {}),
    },
    {
      id: 'indicator-bar',
      parent: 'selected',
      node: 'FRAME',
      selector: '.muxui-tabs-motion-underline',
      bind: ['fill', 'radius', 'size'],
      layout: { placement: 'bottom-bar', ignore: { width: 'The motion runtime sizes the underline to the label; Figma stretches it across the tab content.' } },
      when: (variant) => !filled(variant),
    },
    {
      id: 'tab',
      parent: 'list',
      node: 'FRAME',
      selector: '.muxui-tab[data-key="b"]',
      bind: ['fill', 'overlay', 'stroke', 'radius', 'padding', 'gap', 'size', 'shadow'],
      layout: { direction: 'HORIZONTAL', align: 'CENTER', justify: 'CENTER', centerInMinHeight: true },
    },
    { id: 'label', parent: 'tab', node: 'TEXT', selector: '.muxui-tab[data-key="b"] .muxui-tab-label', bind: ['text'] },
  ],
  preview: [
    'variant=underline,size=md,state=rest',
    'variant=underline,size=md,state=focus-visible',
    'variant=pill,size=md,state=rest',
    'variant=segment,size=md,state=rest',
    'variant=overflow,size=md,state=rest',
  ],
  notes: [
    'The moving indicator becomes a child of the selected tab: a bottom bar for underline, a filled shape behind the label otherwise.',
    'Filled variants paint the selected label through an animated foreground copy; its colour is measured there.',
    'The second tab carries the interaction state; the selected tab stays at rest.',
    'Disabled disables the whole tab list, as the component prop does.',
  ],
};
