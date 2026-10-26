// Fixtures for the rows no canonical example renders (styling-emission.test.mjs, test/browser/hook-only-reach.test.mjs). A canonical
// example shows a family in its default state; these show it where the part exists only in another one: invalid with a description
// and an error, open, with items, with a selection, with a prop the examples never pass. Each fixture belongs to one family, names
// the state it covers, and builds its element from `lib` (`h` is React.createElement, `M` the package index, `TextEditor` its own
// entry), so this module imports nothing and the browser entry can load it too. `steps` drive the mounted fixture the way a user
// would; the test looks for the family's rows after the render and after each step. Nothing here names the part map.

const options = [{ value: 'a', label: 'A' }];
const items = [{ id: 'a', label: 'A' }];
const invalid = { label: 'Label', description: 'Description', errorMessage: 'Error', invalid: true };

/** Props-driven families that show their description and error parts when given a description and an invalid state. */
const invalidField = (family, component, extra = {}, props = invalid) => ({
  family, name: `${component} invalid with description`, state: 'invalid',
  element: ({ h, M }) => h(M[component], { ...props, ...extra }),
});

/** The pointer sequence of a press, as React Aria listens for it. */
export function press(window, element) {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) element.dispatchEvent(new window.MouseEvent(type, { bubbles: true }));
}

/** The first element matching `selector` in the document, or a failure that names it. */
export function find(document, selector) {
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`no element matches ${selector}`);
  return element;
}

/** @type {readonly { family: string, name: string, state: string, element: (lib: any) => any, steps?: readonly ((context: any) => Promise<void> | void)[] }[]} */
export const clientFixtures = [
  invalidField('checkbox-group', 'CheckboxGroup', { options }),
  invalidField('color-field', 'ColorField'),
  invalidField('date-field', 'DateField'),
  invalidField('date-picker', 'DatePicker'),
  invalidField('date-range-picker', 'DateRangePicker'),
  invalidField('number-field', 'NumberField'),
  invalidField('radio-group', 'RadioGroup', { options }),
  invalidField('search-field', 'SearchField'),
  invalidField('select', 'Select', { items }),
  invalidField('text-field', 'TextField'),
  invalidField('time-field', 'TimeField'),
  invalidField('select-native', 'SelectNative', { options }),
  {
    family: 'tag-select', name: 'TagSelect invalid with description', state: 'invalid',
    element: ({ h, M }) => h(M.TagSelect.Root, { label: 'Label', items, invalid: true, errorMessage: 'Error', description: 'Description' }, (item) => item.label),
  },
  {
    family: 'switch', name: 'Switch invalid with description', state: 'invalid',
    element: ({ h, M }) => h(M.Switch, { label: 'Label', description: 'Description', errorMessage: 'Error', invalid: true }),
  },
  {
    family: 'color-slider', name: 'ColorSlider with a label', state: 'labelled',
    element: ({ h, M }) => h(M.ColorSlider, { label: 'Hue', defaultValue: '#ff0000', channel: 'hue', colorSpace: 'hsl' }),
  },
  {
    family: 'range-calendar', name: 'RangeCalendar with a label', state: 'labelled',
    element: ({ h, M }) => h(M.RangeCalendar, { label: 'Dates' }),
  },
  {
    family: 'checkbox-field', name: 'CheckboxField invalid', state: 'invalid',
    element: ({ h, M }) => h(M.CheckboxField.Root, { invalid: true },
      h(M.CheckboxField.Button, null, h(M.CheckboxField.Indicator), 'Option'), h(M.CheckboxField.Description, null, 'Description'), h(M.CheckboxField.Error, null, 'Error')),
  },
  {
    family: 'input', name: 'Input invalid', state: 'invalid',
    element: ({ h, M }) => h(M.Input.Root, { invalid: true },
      h(M.Input.Label, null, 'Label'), h(M.Input.Input), h(M.Input.Description, null, 'Description'), h(M.Input.Error, null, 'Error')),
  },
  {
    family: 'input-tags', name: 'InputTags invalid', state: 'invalid',
    element: ({ h, M }) => h(M.InputTags.Root, { label: 'Tags', defaultValue: ['a'], invalid: true, errorMessage: 'Error', description: 'Description' }),
  },
  {
    family: 'payment-input', name: 'PaymentInput invalid', state: 'invalid',
    element: ({ h, M }) => h(M.PaymentInput.Root, { invalid: true },
      h(M.PaymentInput.Label, null, 'Label'), h(M.PaymentInput.Group, null, h(M.PaymentInput.Input), h(M.PaymentInput.CardIcon)),
      h(M.PaymentInput.Description, null, 'Description'), h(M.PaymentInput.Error, null, 'Error')),
  },
  {
    family: 'radio-field', name: 'RadioField invalid', state: 'invalid',
    element: ({ h, M }) => h(M.RadioGroup, { label: 'Plan', invalid: true },
      h(M.RadioField.Root, { value: 'a', invalid: true },
        h(M.RadioField.Button, null, h(M.RadioField.Indicator, null, h(M.RadioField.Dot)), 'A'), h(M.RadioField.Description, null, 'Description'), h(M.RadioField.Error, null, 'Error'))),
  },
  {
    family: 'switch-field', name: 'SwitchField invalid', state: 'invalid',
    element: ({ h, M }) => h(M.SwitchField.Root, { invalid: true },
      h(M.SwitchField.Button, null, h(M.SwitchField.Thumb), 'Notify'), h(M.SwitchField.Description, null, 'Description'), h(M.SwitchField.Error, null, 'Error')),
  },
  {
    family: 'text-area', name: 'TextArea invalid', state: 'invalid',
    element: ({ h, M }) => h(M.TextArea.Root, { invalid: true },
      h(M.TextArea.Label, null, 'Label'), h(M.TextArea.TextArea), h(M.TextArea.Description, null, 'Description'), h(M.TextArea.Error, null, 'Error')),
  },
  {
    family: 'text-editor', name: 'TextEditor invalid', state: 'invalid',
    element: ({ h, TextEditor }) => h(TextEditor, { label: 'Label', description: 'Description', invalid: true, errorMessage: 'Error', toolbar: true }),
  },
  {
    family: 'alert-dialog', name: 'AlertDialog open', state: 'open',
    element: ({ h, M }) => h(M.AlertDialog.Root, { defaultOpen: true },
      h(M.AlertDialog.Trigger, null, 'Delete report'),
      h(M.AlertDialog.Backdrop, null, h(M.AlertDialog.Popup, null, h(M.AlertDialog.Content, null,
        h(M.AlertDialog.Title, null, 'Delete the report?'), h(M.AlertDialog.Description, null, 'This cannot be undone.'),
        h(M.AlertDialog.Actions, null, h(M.AlertDialog.Close, null, 'Cancel'), h(M.Button, null, 'Delete')))))),
  },
  {
    family: 'dialog', name: 'Dialog open', state: 'open',
    element: ({ h, M }) => h(M.Dialog, { title: 'Settings', description: 'Review the settings.', actions: h(M.Button, null, 'Save'), defaultOpen: true }, 'Body'),
  },
  {
    family: 'lightbox', name: 'Lightbox open with controls', state: 'open',
    element: ({ h, M }) => h(M.Lightbox, { items: [{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }], defaultOpen: true, renderContent: (item) => h('p', null, item.label) },
      h(M.LightboxTrigger, { itemKey: 'one' }, 'Open'),
      h(M.LightboxBackdrop, null, h(M.LightboxPopup, null, h(M.LightboxContent), h(M.LightboxCaption), h(M.LightboxPrevious), h(M.LightboxNext), h(M.LightboxClose)))),
  },
  {
    family: 'popover', name: 'Popover open', state: 'open',
    element: ({ h, M }) => h(M.Popover, { 'aria-label': 'Details', defaultOpen: true, trigger: h(M.Button, null, 'Details') }, 'Contextual content'),
  },
  {
    family: 'preview-trigger', name: 'PreviewTrigger open', state: 'open',
    element: ({ h, M }) => h(M.PreviewTrigger, { 'aria-label': 'Preview', defaultOpen: true, trigger: h('a', { href: '/x' }, 'Link') }, 'Preview content'),
  },
  {
    family: 'tooltip', name: 'Tooltip open', state: 'open',
    element: ({ h, M }) => h(M.Tooltip, { defaultOpen: true, trigger: h(M.Button, null, 'Help'), content: 'Tip' }),
  },
  {
    family: 'menu', name: 'Menu.Root open with sections', state: 'open',
    element: ({ h, M }) => h(M.Menu.Root, { defaultOpen: true },
      h(M.Menu.Trigger, null, 'Actions'),
      h(M.Menu.Popup, null, h(M.Menu.List, { 'aria-label': 'Actions' },
        h(M.Menu.Section, null, h(M.Menu.Header, null, 'Edit'), h(M.Menu.Item, { id: 'copy' }, 'Copy')),
        h(M.Menu.Separator),
        h(M.Menu.Item, { id: 'paste' }, 'Paste')))),
  },
  {
    family: 'select', name: 'Select open', state: 'open',
    element: ({ h, M }) => h(M.Select, { label: 'City', items: ['Melbourne', 'Sydney'], defaultOpen: true }),
  },
  {
    family: 'combo-box', name: 'ComboBox opened from its trigger', state: 'open',
    element: ({ h, M }) => h(M.ComboBox, { label: 'City', items: ['Melbourne', 'Sydney'] }),
    steps: [({ window, document }) => press(window, find(document, '.muxui-combo-box__trigger'))],
  },
  {
    family: 'autocomplete', name: 'Autocomplete opened by the arrow key', state: 'open',
    element: ({ h, M }) => h(M.Autocomplete, { label: 'City', items: ['Melbourne', 'Sydney'] }),
    steps: [({ window, document }) => {
      const input = find(document, 'input');
      input.focus();
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }],
  },
  {
    family: 'multi-select', name: 'MultiSelect open with items', state: 'open',
    element: ({ h, M }) => h(M.MultiSelect.Root, { label: 'Technologies', items: [{ id: 'react', label: 'React' }, { id: 'css', label: 'CSS' }] },
      (item) => h(M.MultiSelect.Item, { id: item.id, textValue: item.label }, item.label)),
    steps: [({ window, document }) => press(window, find(document, 'button'))],
  },
  {
    family: 'multi-select', name: 'MultiSelect open with no items', state: 'empty',
    element: ({ h, M }) => h(M.MultiSelect.Root, { label: 'Technologies', items: [], placeholder: 'Pick' }),
    steps: [({ window, document }) => press(window, find(document, 'button'))],
  },
  {
    family: 'tag-select', name: 'TagSelect opened by the arrow key', state: 'open',
    element: ({ h, M }) => h(M.TagSelect.Root, { label: 'Tags', description: 'Pick tags', items: [{ id: 'react', label: 'React' }, { id: 'css', label: 'CSS' }], defaultSelectedKeys: ['css'] }, (item) => item.label),
    steps: [({ window, document }) => {
      const input = find(document, 'input');
      input.focus();
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }],
  },
  {
    family: 'date-picker', name: 'DatePicker open', state: 'open',
    element: ({ h, M }) => h(M.DatePicker, { label: 'Date', defaultOpen: true }),
  },
  {
    family: 'date-range-picker', name: 'DateRangePicker open', state: 'open',
    element: ({ h, M }) => h(M.DateRangePicker, { label: 'Dates', defaultOpen: true }),
  },
  {
    family: 'virtualizer', name: 'Virtualizer with a measured viewport', state: 'measured',
    element: ({ h, M }) => h(M.Virtualizer, { 'aria-label': 'Documents', items: Array.from({ length: 20 }, (_, index) => ({ id: String(index), label: `Document ${index}` })) }),
    // jsdom has no layout: give the virtualizer a viewport and a ResizeObserver that reports its size when observation starts.
    layout: { width: 400, height: 400 },
  },
  {
    family: 'toast', name: 'Toast shown', state: 'shown',
    element: ({ h, M }) => {
      const Action = () => { const { add } = M.useToast(); return h(M.Button, { onActivate: () => add('Your changes are saved.', { title: 'Saved' }) }, 'Save'); };
      return h(M.ToastProvider, null, h(Action));
    },
    steps: [({ window, document }) => press(window, find(document, 'button'))],
  },
  {
    family: 'command-palette', name: 'CommandPalette open with every part', state: 'open',
    element: ({ h, M }) => {
      const CP = M.CommandPalette;
      return h(CP.Root, { open: true, onOpenChange() {} },
        h(CP.Trigger, null, 'Commands'),
        h(CP.Backdrop, null, h(CP.Popup, { 'aria-label': 'Commands' },
          h(CP.Title, null, 'Commands'), h(CP.Description, null, 'Search the commands.'), h(CP.Close, { 'aria-label': 'Close' }, 'x'),
          h(CP.Content, null,
            h(CP.SearchField, { defaultValue: 'a' }, h(CP.Input, { 'aria-label': 'Search' }), h(CP.ClearButton, null)),
            h(CP.Chips, null, h(CP.Chip, null, 'Help', h(CP.ChipRemove, { 'aria-label': 'Remove Help' }))),
            h(CP.ListBox, { 'aria-label': 'Commands' },
              h(CP.Section, null, h(CP.SectionHeader, null, 'Workspace'),
                h(CP.Item, { id: 'a', textValue: 'A' }, h(CP.ItemIcon, null, '*'), h(CP.ItemContent, null, h(CP.ItemTitle, null, 'A'), h(CP.ItemDescription, null, 'The first')), h(CP.ItemMeta, null, 'Meta'))),
              h(CP.Item, { id: 'b', textValue: 'B' }, 'B')),
            h(CP.Separator, null),
            h(CP.LoadMoreItem, null, h(M.Button, null, 'Load more')),
            h(CP.Empty, null, 'No commands'),
            h(CP.Footer, null, 'Footer')))));
    },
  },
  {
    family: 'sidebar', name: 'Sidebar with navigation, a feature card and an account menu', state: 'default',
    element: ({ h, M }) => {
      const S = M.Sidebar;
      return h(S.Provider, null, h(S.Root, { 'aria-label': 'Navigation' },
        h(S.Toggle, null), h(S.Header, null, 'Header'), h(S.Divider, null),
        h(S.NavList, null, h(S.Section, { label: 'Section' }, h(S.NavButton, { href: '#a', label: 'A', current: true })), h(S.NavItem, { href: '#b' }, 'B')),
        h(S.FeatureCard, { title: 'Feature', description: 'Description', dismissLabel: 'Dismiss', onDismiss() {} }),
        h(S.AccountCard, { name: 'Sample user', email: 'sample@example.com' }, h(S.AccountMenu, null, h(M.Menu.Item, { id: 'profile' }, 'Profile')))));
    },
    steps: [({ window, document }) => press(window, find(document, '.muxui-sidebar__account-card button'))],
  },
  {
    family: 'data-diff', name: 'DataDiff with no rows', state: 'empty',
    element: ({ h, M }) => h(M.DataDiff, { label: 'Changes', columns: [{ id: 'name', label: 'Name' }], rows: [], emptyMessage: 'Nothing changed' }),
  },
  {
    family: 'prompt-composer', name: 'PromptComposer with an error and attachments', state: 'error',
    element: ({ h, M }) => h(M.PromptComposer, { 'aria-label': 'Composer', error: 'Message failed', attachments: [{ id: 'file', name: 'notes.txt' }] }),
  },
  {
    family: 'prompt-composer', name: 'PromptComposer with suggestions', state: 'suggesting',
    element: ({ h, M }) => h(M.PromptComposer, { 'aria-label': 'Composer', sources: [{ id: 'alpha', label: 'Alpha' }] }),
    steps: [({ window, document }) => {
      const textarea = find(document, 'textarea');
      textarea.focus();
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, '@a');
      textarea.setSelectionRange(2, 2);
      // React DOM is imported before the DOM exists, as in the package's own tests, so it reads the changed value on a key event.
      textarea.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    }],
  },
  {
    family: 'text-editor', name: 'TextEditor with a selection and a bubble menu', state: 'selected',
    element: ({ h, TextEditor }) => h(TextEditor, {
      label: 'Draft', toolbar: 'advanced', bubbleMenu: true, selectionActions: [{ id: 'explain', label: 'Explain' }], onSelectionRequest() {},
      defaultValue: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Checklist holds the top slot all weekend.' }] }] },
    }),
    steps: [async ({ window, document, sleep }) => {
      await sleep(100);
      const editor = find(document, '.ProseMirror');
      editor.focus();
      const text = editor.querySelector('p').firstChild;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 9);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new window.Event('selectionchange'));
      await sleep(200);
    }],
  },
  {
    family: 'text-editor', name: 'TextEditor color popup', state: 'open',
    element: ({ h, TextEditor }) => h(TextEditor, { label: 'Draft', toolbar: 'advanced' }),
    steps: [({ window, document }) => press(window, find(document, '[aria-label="Text color"]'))],
  },
];

/**
 * One static or controlled-open element for each part-map row marked `hookOnly` (a documented hook no authored rule selects), keyed
 * `family.part`. The emission test renders each in jsdom and requires the row's selector to match; the browser test mounts the same
 * element with the shipped stylesheets and a consumer's rule on the selector and checks the rule reaches the element.
 * @type {Readonly<Record<string, { name: string, element: (lib: any) => any }>>}
 */
export const hookOnlyFixtures = {
  'lightbox.root': {
    name: 'Lightbox open',
    element: ({ h, M }) => h(M.Lightbox, { items: [{ key: 'one', label: 'One' }], defaultOpen: true, renderContent: (item) => h('p', null, item.label) },
      h(M.LightboxTrigger, { itemKey: 'one' }, 'Open'), h(M.LightboxBackdrop, null, h(M.LightboxPopup, null, h(M.LightboxContent)))),
  },
  'text.root': {
    name: 'Text',
    element: ({ h, M }) => h(M.Text, { as: 'p' }, 'Plain text'),
  },
  'command-palette.separator': {
    name: 'CommandPalette open with a separator',
    element: ({ h, M }) => h(M.CommandPalette.Root, { open: true, onOpenChange() {} },
      h(M.CommandPalette.Backdrop, null, h(M.CommandPalette.Popup, { 'aria-label': 'Commands' },
        h(M.CommandPalette.Content, null, h(M.CommandPalette.ListBox, { 'aria-label': 'Commands' }, h(M.CommandPalette.Item, { id: 'a', textValue: 'A' }, 'A')), h(M.CommandPalette.Separator, null))))),
  },
  'data-diff.body': {
    name: 'DataDiff with rows',
    element: ({ h, M }) => h(M.DataDiff, { label: 'Changes', columns: [{ id: 'name', label: 'Name' }], rows: [{ id: 'a', label: 'A', kind: 'added', values: { name: 'A' } }] }),
  },
  'menu.list': {
    name: 'Menu.Root open',
    element: ({ h, M }) => h(M.Menu.Root, { defaultOpen: true }, h(M.Menu.Trigger, null, 'Actions'),
      h(M.Menu.Popup, null, h(M.Menu.List, { 'aria-label': 'Actions' }, h(M.Menu.Section, null, h(M.Menu.Header, null, 'Edit'), h(M.Menu.Item, { id: 'copy' }, 'Copy'))))),
  },
  'menu.section': {
    name: 'Menu.Root open with a section',
    element: ({ h, M }) => h(M.Menu.Root, { defaultOpen: true }, h(M.Menu.Trigger, null, 'Actions'),
      h(M.Menu.Popup, null, h(M.Menu.List, { 'aria-label': 'Actions' }, h(M.Menu.Section, null, h(M.Menu.Header, null, 'Edit'), h(M.Menu.Item, { id: 'copy' }, 'Copy'))))),
  },
  'sidebar.toggle': {
    name: 'Sidebar with a toggle',
    element: ({ h, M }) => h(M.Sidebar.Provider, null, h(M.Sidebar.Root, { 'aria-label': 'Navigation' }, h(M.Sidebar.Toggle, null), h(M.Sidebar.NavList, null, h(M.Sidebar.NavItem, { href: '#a' }, 'A')))),
  },
  'tabs.panels': {
    name: 'Tabs',
    element: ({ h, M }) => h(M.Tabs, { 'aria-label': 'Sections', items: [{ id: 'one', label: 'One', panel: 'First' }, { id: 'two', label: 'Two', panel: 'Second' }] }),
  },
  'date-range-picker.start': {
    name: 'DateRangePicker',
    element: ({ h, M }) => h(M.DateRangePicker, { label: 'Dates' }),
  },
  'date-range-picker.end': {
    name: 'DateRangePicker',
    element: ({ h, M }) => h(M.DateRangePicker, { label: 'Dates' }),
  },
  'text-editor.image-picker': {
    name: 'TextEditor with the advanced toolbar',
    element: ({ h, TextEditor }) => h(TextEditor, { label: 'Draft', toolbar: 'advanced' }),
  },
  'markdown.heading': {
    name: 'Markdown with headings',
    element: ({ h, Markdown }) => h(Markdown, { source: '# One\n\n## Two\n\nText' }),
  },
};

/**
 * The rows whose composed root class is conditional: the element can be the caller's (a Popover's `trigger`, a FileTrigger's child).
 * `mux` is the form that brings its own `muxui-button` (a Mux component, or FileTrigger's default button) and `native` a native
 * `<button>` the caller supplies, which carries the hook and nothing else. Server-rendered by styling-emission.test.mjs.
 */
export const callerElementFixtures = {
  'popover.trigger': {
    mux: ({ h, M }) => h(M.Popover, { 'aria-label': 'Details', trigger: h(M.Button, null, 'Details') }, 'Content'),
    native: ({ h, M }) => h(M.Popover, { 'aria-label': 'Details', trigger: h('button', { type: 'button' }, 'Details') }, 'Content'),
  },
  'file-trigger.root': {
    mux: ({ h, M }) => h(M.FileTrigger, null, 'Choose files'),
    native: ({ h, M }) => h(M.FileTrigger, null, h('button', { type: 'button' }, 'Choose files')),
  },
};
