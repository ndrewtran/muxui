/*
 * One-time R1.6 donor capture renderer.
 *
 * This module deliberately contains only the adapter from the finite Mux
 * fixture contract to the pinned Tale component composition.  The package
 * namespaces are supplied by r1-6-donor-entry.mjs so the renderer stays
 * usable by the capture runner without making Tale a runtime dependency.
 */

const DEFAULT_ITEMS = [
  { id: 'melbourne', label: 'Melbourne' },
  { id: 'sydney', label: 'Sydney' },
  { id: 'brisbane', label: 'Brisbane' },
];

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function dataFor(fixture) {
  return fixture?.data && typeof fixture.data === 'object' ? fixture.data : {};
}

function copyFor(fixture, fallback = 'Name') {
  return typeof fixture?.copy === 'string' && fixture.copy.trim() ? fixture.copy : fallback;
}

function itemsFor(data) {
  const source = Array.isArray(data.items) ? data.items : DEFAULT_ITEMS;
  return source.map((item, index) => {
    if (item && typeof item === 'object') {
      const id = item.id ?? item.value ?? item.name ?? `item-${index + 1}`;
      return { ...item, id: String(id), label: String(item.label ?? item.name ?? item.value ?? id) };
    }
    return { id: String(item), label: String(item) };
  });
}

function actionFor(entry) {
  if (typeof entry?.action === 'string') return { type: entry.action };
  if (entry?.action && typeof entry.action === 'object') return entry.action;
  return undefined;
}

function stateProps(entry) {
  const input = entry?.props && typeof entry.props === 'object' ? entry.props : {};
  const state = entry?.state;
  const props = { ...input };

  const bool = (name, stateName) => {
    if (typeof props[name] === 'boolean') return props[name];
    return state === stateName ? true : undefined;
  };

  props.isDisabled = bool('disabled', 'disabled');
  props.isInvalid = bool('invalid', 'invalid');
  props.isRequired = bool('required', 'required');
  props.isReadOnly = bool('readOnly', 'read-only') ?? bool('readonly', 'readonly');
  props.isSelected = bool('selected', 'selected') ?? bool('checked', 'checked');
  props.isIndeterminate = bool('indeterminate', 'indeterminate');
  props.isPending = bool('pending', 'pending');
  props.isCurrent = bool('current', 'current');

  delete props.disabled;
  delete props.invalid;
  delete props.required;
  delete props.readOnly;
  delete props.readonly;
  delete props.selected;
  delete props.checked;
  delete props.indeterminate;
  delete props.pending;
  delete props.current;
  delete props.open;
  delete props.defaultOpen;
  delete props.attached;
  delete props.mode;
  return props;
}

function textFor(item) {
  if (item && typeof item === 'object') return String(item.label ?? item.name ?? item.value ?? item.id);
  return String(item);
}

function asSelection(values) {
  return new Set(Array.isArray(values) ? values.map(String) : []);
}

function pickProps(props, names) {
  const picked = {};
  for (const name of names) {
    if (props[name] !== undefined) picked[name] = props[name];
  }
  return picked;
}

function fieldChildren(h, p, model, tag = 'field') {
  return [
    h(p.Label, { key: `${tag}-label` }, model.label),
    h(p.Input ?? p.TextArea, {
      key: `${tag}-input`,
      placeholder: model.placeholder,
      size: model.size,
      rows: model.rows,
    }),
    h(p.Description, { key: `${tag}-description` }, model.description),
    h(p.ErrorMessage ?? p.Error, { key: `${tag}-error` }, model.error),
  ];
}

function renderAlertDialog(h, p, props, model) {
  const open = props.open ?? ['open', 'closing'].includes(model.state);
  const rootProps = typeof props.open === 'boolean' ? { isOpen: props.open } : model.state === 'opening' ? {} : model.state === 'closing' ? { defaultOpen: true } : { isOpen: open };
  return h(
    p.Root,
    rootProps,
    h(p.Trigger, { isDisabled: props.isDisabled, 'data-muxui-action-target': 'true' }, 'Delete item'),
    h(
      p.Backdrop,
      null,
      h(
        p.Popup,
        null,
        h(
          p.Content,
          null,
          h(p.Title, null, 'Delete item?'),
          h(p.Description, null, 'This action cannot be undone.'),
          h(p.Actions, null, h(p.Close, null, 'Cancel'), h(p.Close, null, 'Delete')),
        ),
      ),
    ),
  );
}

function renderButtonGroup(h, p, props) {
  return h(
    p.ButtonGroup,
    { ...pickProps(props, ['orientation']), isAttached: typeof props.isAttached === 'boolean' ? props.isAttached : props.state === 'attached', 'aria-label': 'Document actions' },
    h('button', { type: 'button', disabled: props.isDisabled, 'data-muxui-action-target': 'true' }, 'Save'),
    h('button', { type: 'button', disabled: props.isDisabled }, 'Share'),
  );
}

function renderCard(h, p, props, model) {
  const variant = props.variant ?? (
    model.state === 'elevated' ? 'elevated' : model.state === 'filled' ? 'filled' : model.state === 'outlined' ? 'outlined' : undefined
  );
  const interactive = props.isSelected !== undefined || props.isPending !== undefined || props.isDisabled || model.state === 'focused';
  const children = [
    h(p.Header, { key: 'header' }, model.label),
    h(p.Body, { key: 'body' }, model.description),
    h(p.Footer, { key: 'footer' }, 'View details'),
  ];
  if (interactive) {
    return h(p.Button, { ...pickProps(props, ['isSelected', 'isPending', 'isDisabled']), variant, 'data-muxui-action-target': 'true', 'aria-label': model.label }, ...children);
  }
  return h(p.Root, { variant, padding: props.padding }, ...children);
}

function renderCheckboxField(h, p, props, model) {
  return h(
    p.Root,
    pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'isReadOnly', 'isSelected', 'isIndeterminate', 'size']),
    h(
      p.Button,
      { ...pickProps(props, ['isDisabled']), 'data-muxui-action-target': 'true' },
      h(p.Indicator, null, '✓'),
      model.label,
    ),
    h(p.Description, null, model.description),
    h(p.Error, null, model.error),
  );
}

function renderCommandPalette(h, p, props, model) {
  const state = props.state ?? model.state;
  const isOpen = props.open ?? !['closed', 'opening'].includes(state);
  const sourceItems = Array.isArray(props.items) ? itemsFor({ items: props.items }) : model.items;
  const items = state === 'empty' ? [] : state === 'filtered' ? sourceItems.slice(0, 1) : sourceItems;
  const selectedKeys = hasOwn(props, 'selectedKeys') ? (props.selectedKeys === 'all' ? 'all' : asSelection(props.selectedKeys)) : state === 'selected' ? asSelection([items[0]?.id]) : undefined;
  const disabledItem = props.disabledItem ?? state === 'item-disabled';
  const rootProps = typeof props.open === 'boolean' ? { open: isOpen } : state === 'opening' ? {} : state === 'closing' ? { defaultOpen: true } : { open: isOpen };
  return h(
    p.Root,
    { ...rootProps, size: props.size, closeOnSelect: false },
    h(p.Trigger, { isDisabled: props.isDisabled, 'data-muxui-action-target': 'true' }, 'Search'),
    h(
      p.Backdrop,
      null,
      h(
        p.Popup,
        { 'aria-label': 'Command palette' },
        h(
          p.Content,
          null,
          h(p.Title, null, 'Command palette'),
          h(p.SearchField, null, h(p.Input, { placeholder: 'Search commands' }), h(p.ClearButton, { 'aria-label': 'Clear search' })),
          h(
            p.ListBox,
            { 'aria-label': 'Commands', selectionMode: selectedKeys === undefined ? undefined : 'single', selectedKeys },
            h(
              p.Section,
              null,
              h(p.SectionHeader, null, 'Suggestions'),
              items.map((item, index) =>
                h(
                  p.Item,
                  { key: item.id, id: item.id, textValue: item.label, isDisabled: item.disabled === true || (disabledItem && index === 0) },
                  h(p.ItemContent, null, h(p.ItemTitle, null, item.label)),
                  h(p.ItemMeta, null, h(p.Shortcut, { keys: ['Mod', 'K'] })),
                ),
              ),
            ),
          ),
          items.length === 0 ? h(p.Empty, null, 'No commands found') : null,
        ),
      ),
    ),
  );
}

function renderHeaderNav(h, p, model, Button, current) {
  const links = [
    h(p.NavButton, { key: 'overview', href: '#overview', current }, 'Overview'),
    h(p.NavButton, { key: 'settings', href: '#settings' }, 'Settings'),
  ];
  const secondary = h(p.Secondary, { key: 'secondary' }, links);
  return h(
    p.Root,
    null,
    h(p.Logo, { href: '#home', key: 'logo' }, 'Tale'),
    secondary,
    h(p.Actions, { key: 'actions' }, h(Button, { variant: 'neutral' }, 'Account')),
    h(p.MobileTrigger, { key: 'mobile' }, secondary),
  );
}

function renderInputTags(h, p, props, model) {
  return h(p.Root, {
    ...pickProps(props, ['isDisabled', 'isInvalid', 'isRequired']),
    tagPlacement: props.tagPlacement ?? (model.state === 'below' ? 'below' : 'inline'),
    size: props.size ?? 'md',
    label: model.label,
    placeholder: model.placeholder,
    defaultValue: model.items.slice(0, 2).map(textFor),
    description: model.description,
    errorMessage: model.error,
  });
}

function renderInput(h, p, props, model) {
  return h(p.Root, { ...pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'isReadOnly']), defaultValue: model.value }, ...fieldChildren(h, p, { ...model, size: props.size }, 'input'));
}

function renderLightbox(h, p, props, model) {
  const items = model.items.map((item, index) => ({ ...item, src: item.src ?? `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%23${index ? '475569' : '334155'}'/%3E%3C/svg%3E` }));
  const selectedKey = items[0]?.id ?? null;
  return h(
    p.Root,
    {
      items,
      getKey: (item) => item.id,
      getLabel: (item) => item.label,
      renderContent: (item) => h('img', { src: item.src, alt: item.label, width: 640, height: 360 }),
      ...(typeof props.open === 'boolean' ? { isOpen: props.open } : model.state === 'opening' ? {} : model.state === 'closing' ? { defaultOpen: true } : { isOpen: ['open', 'closing'].includes(model.state) }),
      defaultSelectedKey: selectedKey,
      loop: props.loop ?? model.state === 'loop',
      swipeNavigation: props.swipeNavigation ?? model.state === 'swipe',
    },
    h(p.Trigger, { itemKey: selectedKey, isDisabled: props.isDisabled, 'data-muxui-action-target': 'true' }, 'Open gallery'),
    h(
      p.Backdrop,
      null,
      h(
        p.Popup,
        null,
        h(p.Content, null),
        h(p.Caption, null, 'Gallery'),
        h(p.Previous, { 'aria-label': 'Previous image' }),
        h(p.Next, { 'aria-label': 'Next image' }),
        h(p.Close, { 'aria-label': 'Close gallery' }),
      ),
    ),
  );
}

function renderMarkdown(h, p, props, model) {
  const source = props.source ?? model.markdown ?? `# ${model.label}\n\n${model.description}`;
  return h(p.Markdown, { baseUrl: props.baseUrl, 'data-muxui-markdown': 'true' }, source);
}

function renderMultiSelect(h, p, props, model) {
  const items = Array.isArray(props.items) ? itemsFor({ items: props.items }) : model.items;
  const selected = model.state === 'selected' ? new Set([items[0]?.id]) : undefined;
  return h(
    p.Root,
    {
      ...pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'size', 'showSearch', 'showFooter']),
      label: model.label,
      placeholder: model.placeholder,
      items,
      defaultSelectedKeys: undefined,
      selectedKeys: Array.isArray(props.selectedKeys) ? asSelection(props.selectedKeys) : props.selectedKeys ?? selected,
      showSearch: typeof props.showSearch === 'boolean' ? props.showSearch : true,
      showFooter: typeof props.showFooter === 'boolean' ? props.showFooter : true,
      description: model.description,
      errorMessage: model.error,
    },
    (item) => h(p.Item, { id: item.id, textValue: item.label, isDisabled: item.disabled === true }, item.label),
  );
}

function renderPaymentInput(h, p, props, model) {
  const cardValues = {
    visa: '4242424242424242',
    mastercard: '5555555555554444',
    amex: '378282246310005',
    discover: '6011111111111117',
    unknown: '9999999999999999',
  };
  const paymentProps = { ...pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'isReadOnly']) };
  if (model.state !== 'typed') paymentProps.value = hasOwn(props, 'value') ? props.value : cardValues[model.state] ?? '';
  return h(
    p.Root,
    paymentProps,
    h(p.Label, null, model.label),
    h(
      p.Group,
      null,
      h(p.Input, { 'aria-label': model.label, placeholder: '1234 5678 9012 3456' }),
      h(p.CardIcon, { 'aria-hidden': true }),
    ),
    h(p.Description, null, model.description),
    h(p.ErrorMessage, null, model.error),
  );
}

function renderProgressCircle(h, p, props, model) {
  const hasValue = Object.prototype.hasOwnProperty.call(props, 'value');
  const value = hasValue ? props.value : model.state === 'indeterminate' ? null : model.state === 'zero' ? 0 : model.state === 'complete' ? 100 : 64;
  const rangeProps = {};
  if (Object.prototype.hasOwnProperty.call(props, 'minValue')) rangeProps.minValue = props.minValue;
  if (Object.prototype.hasOwnProperty.call(props, 'maxValue')) rangeProps.maxValue = props.maxValue;
  return h(
    p.Root,
    { ...pickProps(props, ['size']), ...rangeProps, size: props.size ?? (['sm', 'md', 'lg'].includes(model.state) ? model.state : undefined), value, 'aria-label': model.label },
    h(p.Track, null),
    h(p.Label, null, model.label),
    h(p.Value, null),
  );
}

function renderRadioField(h, p, props, model) {
  const Root = p.Root;
  const Group = p.Group;
  const value = String(props.value ?? 'plan');
  const field = h(
    Root,
    { ...pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'isReadOnly', 'size']), value },
    h(p.Button, { ...pickProps(props, ['isDisabled']), 'data-muxui-action-target': 'true' }, h(p.Indicator, null, h(p.Dot, null)), model.label),
    h(p.Description, null, model.description),
    props.omitError ? null : h(p.Error, null, model.error),
  );
  return h(Group, { label: 'Plan', defaultValue: props.isSelected === true ? value : undefined, ...pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'isReadOnly']) }, field);
}

function renderResizable(h, p, props, model) {
  const sizes = props.sizes ?? props.defaultSizes ?? { main: 60, side: 40 };
  return h(
    p.Root,
    { orientation: props.orientation ?? 'horizontal', defaultSizes: props.sizes ? undefined : sizes, sizes: props.sizes, ...pickProps(props, ['isDisabled', 'isReadOnly']) },
    h(p.Panel, { id: 'main', minSize: 20, maxSize: 80 }, h('strong', null, 'Main'), h('p', null, model.description)),
    h(p.Handle, { id: 'main-side', before: 'main', after: 'side', 'aria-label': 'Resize panels', 'data-muxui-action-target': 'true' }),
    h(p.Panel, { id: 'side', minSize: 20, maxSize: 80 }, h('strong', null, 'Side'), h('p', null, 'Details')),
  );
}

function renderSidebar(h, p, model, props, rawProps) {
  if (model.state === 'mobile') {
    return h(p.MobileTrigger, { logo: 'Workspace' }, h(p.NavList, null,
      h(p.NavItem, { href: '#home' }, 'Home'),
      h(p.NavItem, { href: '#projects' }, 'Projects'),
    ));
  }
  return h(
    p.Root,
    { hideBorder: hasOwn(rawProps, 'hideBorder') ? rawProps.hideBorder : model.state === 'no-border' },
    h(p.Header, null, h('strong', null, 'Workspace')),
    h(p.Search, { placeholder: 'Search navigation' }),
    h(p.NavList, null,
      h(p.NavItem, { href: '#home', current: hasOwn(rawProps, 'current') ? rawProps.current : model.state === 'current' }, 'Home'),
      h(p.NavItem, { href: '#projects', items: [{ href: '#active', label: 'Active', current: model.state === 'expanded' }] }, 'Projects'),
      h(p.NavItem, { href: '#docs', external: hasOwn(rawProps, 'external') ? rawProps.external : model.state === 'external' }, 'Docs'),
    ),
    h(p.Divider, null),
    h(p.AccountCard, { name: 'Alex Morgan', email: 'alex@example.com', status: 'online' }),
  );
}

function renderSwitchField(h, p, props, model) {
  return h(
    p.Root,
    pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'isSelected']),
    h(p.Button, { ...pickProps(props, ['isDisabled']), 'data-muxui-action-target': 'true' }, h(p.Thumb, null), model.label),
    h(p.Description, null, model.description),
    h(p.Error, null, model.error),
  );
}

function renderTagSelect(h, p, props, model) {
  const items = Array.isArray(props.items) ? itemsFor({ items: props.items }) : model.items;
  const selectedKeys = model.state === 'selected' ? new Set([items[0]?.id]) : undefined;
  return h(
    p.Root,
    {
      ...pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'size']),
      label: model.label,
      placeholder: model.placeholder,
      items,
      defaultSelectedKeys: props.selectedKeys ? undefined : selectedKeys,
      selectedKeys: Array.isArray(props.selectedKeys) ? asSelection(props.selectedKeys) : props.selectedKeys,
      getItemLabel: (item) => item.label,
      description: model.description,
      errorMessage: model.error,
    },
    (item) => h(p.Item, { id: item.id, textValue: item.label, isDisabled: item.disabled === true }, item.label),
  );
}

function renderTextArea(h, p, props, model) {
  return h(p.Root, { ...pickProps(props, ['isDisabled', 'isInvalid', 'isRequired', 'isReadOnly']), defaultValue: model.value }, ...fieldChildren(h, p, { ...model, size: props.size, rows: props.rows }, 'textarea'));
}

function renderTextEditor(h, p, props, model) {
  const editor = p.TextEditor;
  const content = props.content ?? `<p>${model.state === 'selected' ? `<strong>${model.description}</strong>` : model.description}</p>`;
  return h(
    editor.Root,
    {
      content,
      placeholder: model.placeholder,
      isDisabled: props.isDisabled,
      isInvalid: props.isInvalid,
      limit: props.limit,
    },
    h(editor.Label, null, model.label),
    props.toolbar !== false ? h(editor.Toolbar, { type: props.toolbar ?? 'simple', floating: props.floating ?? false }) : null,
    props.bubbleMenu ? h(editor.BubbleMenu, null,
      h(editor.Bold, null),
      h(editor.Italic, null),
      h(editor.Underline, null),
      h(editor.Link, null),
    ) : null,
    h(editor.Content, null),
    h(editor.HintText, null, model.description),
  );
}

/** Render a single finite R1.6 donor case using the real pinned Tale wrappers. */
export function renderR16FamilyPlan(entry, fixture, runtime) {
  const { h, packages } = runtime;
  const data = dataFor(fixture);
  const model = {
    state: entry?.state,
    label: String(data.label ?? copyFor(fixture)),
    placeholder: String(data.placeholder ?? 'Enter a value'),
    description: String(data.description ?? 'Supporting information'),
    error: String(data.error ?? 'Please check this value.'),
    value: data.value,
    markdown: data.markdown,
    items: itemsFor(data),
  };
  const props = stateProps(entry);
  let content;
  switch (entry.component) {
    case 'AlertDialog': content = renderAlertDialog(h, packages.AlertDialog, { ...props, open: entry.props?.open }, model); break;
    case 'ButtonGroup': content = renderButtonGroup(h, packages.ButtonGroup, { ...props, state: entry.state, isAttached: entry.props?.attached }, model); break;
    case 'Card': content = renderCard(h, packages.Card, { ...props, variant: entry.props?.variant, padding: entry.props?.padding }, model); break;
    case 'CheckboxField': content = renderCheckboxField(h, packages.CheckboxField, props, model); break;
    case 'ColorModeToggle': content = h(packages.ColorModeToggle.ColorModeToggle, { ...pickProps(props, ['isDisabled']), defaultMode: entry.props?.mode ?? (entry.state === 'dark' ? 'dark' : entry.state === 'light' ? 'light' : undefined) }); break;
    case 'CommandPalette': content = renderCommandPalette(h, packages.CommandPalette, { ...props, state: entry.state, size: entry.props?.size, open: entry.props?.open, items: entry.props?.items }, model); break;
    case 'HeaderNav': content = renderHeaderNav(h, packages.HeaderNav, model, packages.Button, hasOwn(entry.props, 'current') ? entry.props.current : model.state === 'current'); break;
    case 'InputTags': content = renderInputTags(h, packages.InputTags, props, model); break;
    case 'Input': content = renderInput(h, packages.Input, { ...props, size: entry.props?.size }, { ...model, value: hasOwn(entry.props, 'value') ? entry.props.value : entry.state === 'empty' ? '' : model.value }); break;
    case 'Lightbox': content = renderLightbox(h, packages.Lightbox, { ...props, open: entry.props?.open, loop: entry.props?.loop, swipeNavigation: entry.props?.swipeNavigation }, model); break;
    case 'Markdown': content = renderMarkdown(h, packages.Markdown, { ...props, source: entry.props?.source, baseUrl: entry.props?.baseUrl }, model); break;
    case 'MultiSelect': content = renderMultiSelect(h, packages.MultiSelect, { ...props, size: entry.props?.size, showSearch: entry.props?.showSearch, showFooter: entry.props?.showFooter, items: entry.props?.items }, model); break;
    case 'PaymentInput': content = renderPaymentInput(h, packages.PaymentInput, props, { ...model, state: entry.state }); break;
    case 'ProgressCircle': content = renderProgressCircle(h, packages.ProgressCircle, { ...props, size: entry.props?.size }, model); break;
    case 'RadioField': content = renderRadioField(h, packages.RadioField, { ...props, value: entry.props?.value }, model); break;
    case 'Resizable': content = renderResizable(h, packages.Resizable, { ...props, orientation: entry.props?.orientation, sizes: entry.props?.sizes }, model); break;
    case 'Sidebar': content = renderSidebar(h, packages.Sidebar, model, props, entry.props); break;
    case 'SwitchField': content = renderSwitchField(h, packages.SwitchField, props, model); break;
    case 'TagSelect': content = renderTagSelect(h, packages.TagSelect, { ...props, items: entry.props?.items }, model); break;
    case 'TextArea': content = renderTextArea(h, packages.TextArea, { ...props, size: entry.props?.size, rows: entry.props?.rows }, { ...model, value: hasOwn(entry.props, 'value') ? entry.props.value : entry.state === 'empty' ? '' : model.value }); break;
    case 'TextEditor': content = renderTextEditor(h, packages.TextEditor, { ...props, toolbar: entry.props?.toolbar, floating: entry.props?.floating, bubbleMenu: entry.props?.bubbleMenu, content: entry.props?.content, limit: entry.props?.limit }, model); break;
    default: throw new Error(`Unsupported R1.6 donor family: ${entry.component}`);
  }

  const action = actionFor(entry);
  return h(
    'div',
    {
      'data-muxui-paired-case': entry.id,
      'data-muxui-family': entry.component,
      'data-muxui-state': entry.state,
      'data-muxui-action': action?.type,
      'data-muxui-action-selector': action?.selector,
    },
    content,
  );
}

export { actionFor };
