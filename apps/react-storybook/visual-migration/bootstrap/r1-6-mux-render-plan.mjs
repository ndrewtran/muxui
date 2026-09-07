/* Mux counterpart to the pinned donor composition. It consumes the shared current scene only. */

function propsFor(entry) {
  const source = entry.props ?? {};
  const state = entry.state;
  const flag = (name, stateName = name) => typeof source[name] === 'boolean' ? source[name] : state === stateName;
  return {
    ...source,
    disabled: flag('disabled'), invalid: flag('invalid'), required: flag('required'), readOnly: flag('readOnly', 'read-only'),
    checked: typeof source.checked === 'boolean' ? source.checked : state === 'checked' || state === 'selected',
    indeterminate: flag('indeterminate'), pending: flag('pending'), selected: typeof source.selected === 'boolean' ? source.selected : state === 'selected',
  };
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function textFor(item) { return String(item?.label ?? item?.name ?? item?.value ?? item?.id ?? item); }
function selection(values) { return new Set(Array.from(values ?? [], String)); }
function hItem(h, p, item, extra = {}) { return h(p.Item, { id: item.id, textValue: item.label, key: item.id, ...extra }, item.label); }

function field(h, p, model, textarea = false) {
  const Input = textarea ? p.TextArea : p.Input;
  return [h(p.Label, { key: 'label' }, model.label), h(Input, { key: 'input', placeholder: model.placeholder, size: model.size, rows: textarea ? model.rows : undefined, 'data-muxui-action-target': 'true' }), h(p.Description, { key: 'description' }, model.description), h(p.Error, { key: 'error' }, model.error)];
}

function alertDialog(h, p, props) {
  const state = props.state;
  const rootProps = typeof props.open === 'boolean' ? { open: props.open } : state === 'closing' ? { defaultOpen: true } : state === 'opening' ? {} : { open: state === 'open' };
  return h(p.Root, rootProps, h(p.Trigger, { disabled: props.disabled, 'data-muxui-action-target': 'true' }, 'Delete item'), h(p.Backdrop, null, h(p.Popup, null, h(p.Content, null, h(p.Title, null, 'Delete item?'), h(p.Description, null, 'This action cannot be undone.'), h(p.Actions, null, h(p.Close, null, 'Cancel'), h(p.Close, null, 'Delete'))))));
}

function commandPalette(h, p, props, model) {
  const state = props.state ?? model.state;
  const open = props.open ?? !['closed', 'opening'].includes(state);
  const rootProps = typeof props.open === 'boolean' ? { open } : state === 'opening' ? {} : state === 'closing' ? { defaultOpen: true } : { open };
  const sourceItems = Array.isArray(props.items) ? props.items : model.items;
  const items = state === 'empty' ? [] : state === 'filtered' ? sourceItems.slice(0, 1) : sourceItems;
  const selectedKeys = hasOwn(props, 'selectedKeys') ? (props.selectedKeys === 'all' ? 'all' : selection(props.selectedKeys)) : state === 'selected' ? selection([items[0]?.id]) : undefined;
  const disabledItem = props.disabledItem ?? state === 'item-disabled';
  return h(p.Root, { ...rootProps, size: props.size, closeOnSelect: false },
    h(p.Trigger, { disabled: props.disabled, 'data-muxui-action-target': 'true' }, 'Search'),
    h(p.Backdrop, null,
      h(p.Popup, { 'aria-label': 'Command palette' },
        h(p.Content, null,
          h(p.Title, null, 'Command palette'),
          h(p.SearchField, null, h(p.Input, { placeholder: 'Search commands' }), h(p.ClearButton, { 'aria-label': 'Clear search' })),
          h(p.ListBox, { 'aria-label': 'Commands', selectionMode: selectedKeys === undefined ? undefined : 'single', selectedKeys },
            h(p.Section, null,
              h(p.SectionHeader, null, 'Suggestions'),
              items.map((item, index) => h(p.Item, { key: item.id, id: item.id, title: item.label, textValue: item.label, disabled: item.disabled === true || (disabledItem && index === 0) }, h(p.ItemContent, null, h(p.ItemTitle, null, item.label)), h(p.ItemMeta, null, h(p.Shortcut, { keys: ['Mod', 'K'] })))),
            ),
          ),
          items.length === 0 ? h(p.Empty, null, 'No commands found') : null,
        ),
      ),
    ),
  );
}

function headerNav(h, p, model, Button, current) {
  const links = [h(p.NavButton, { key: 'overview', href: '#overview', current }, 'Overview'), h(p.NavButton, { key: 'settings', href: '#settings' }, 'Settings')];
  const secondary = h(p.Secondary, { key: 'secondary' }, links);
  return h(p.Root, null, h(p.Logo, { href: '#home', key: 'logo' }, 'Tale'), secondary, h(p.Actions, { key: 'actions' }, h(Button, { variant: 'neutral' }, 'Account')), h(p.MobileTrigger, { key: 'mobile' }, secondary));
}

function lightbox(h, p, props, model) {
  const items = model.items.map((item, index) => ({ ...item, key: item.key ?? item.id, src: item.src ?? `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%23${index ? '475569' : '334155'}'/%3E%3C/svg%3E` }));
  const selectedKey = items[0]?.key;
  const open = props.open ?? ['open', 'closing'].includes(model.state);
  const rootProps = typeof props.open === 'boolean' ? { open } : model.state === 'opening' ? {} : model.state === 'closing' ? { defaultOpen: true } : { open };
  return h(p.Root, { items, defaultSelectedKey: selectedKey, ...rootProps, loop: props.loop ?? model.state === 'loop', swipeNavigation: props.swipeNavigation ?? model.state === 'swipe', renderContent: (item) => h('img', { src: item.src, alt: item.label, width: 640, height: 360 }) }, h(p.Trigger, { itemKey: selectedKey, disabled: props.disabled, 'data-muxui-action-target': 'true' }, 'Open gallery'), h(p.Backdrop, null, h(p.Popup, null, h(p.Content, null), h(p.Caption, null, 'Gallery'), h(p.Previous, { 'aria-label': 'Previous image' }), h(p.Next, { 'aria-label': 'Next image' }), h(p.Close, { 'aria-label': 'Close gallery' }))));
}

function sidebar(h, p, model, props) {
  if (model.state === 'mobile') {
    return h(p.MobileTrigger, { logo: 'Workspace' }, h(p.NavList, null,
      h(p.NavItem, { href: '#home' }, 'Home'),
      h(p.NavItem, { href: '#projects' }, 'Projects'),
    ));
  }
  const current = hasOwn(props, 'current') ? props.current : model.state === 'current';
  const external = hasOwn(props, 'external') ? props.external : model.state === 'external';
  const hideBorder = hasOwn(props, 'hideBorder') ? props.hideBorder : model.state === 'no-border';
  return h(p.Root, { hideBorder }, h(p.Header, null, h('strong', null, 'Workspace')), h(p.Search, { placeholder: 'Search navigation' }), h(p.NavList, null, h(p.NavItem, { href: '#home', current }, 'Home'), h(p.NavItem, { href: '#projects', items: [{ href: '#active', label: 'Active', current: model.state === 'expanded' }] }, 'Projects'), h(p.NavItem, { href: '#docs', external }, 'Docs')), h(p.Divider, null), h(p.AccountCard, { name: 'Alex Morgan', email: 'alex@example.com', status: 'online' }));
}

function resizable(h, p, props, model) {
  const sizes = props.sizes ?? { main: 60, side: 40 };
  return h(p.Root, { orientation: props.orientation ?? 'horizontal', defaultSizes: sizes, disabled: props.disabled, readOnly: props.readOnly, 'aria-label': model.label }, h(p.Panel, { id: 'main', minSize: 20, maxSize: 80 }, h('strong', null, 'Main'), h('p', null, model.description)), h(p.Handle, { id: 'main-side', before: 'main', after: 'side', 'aria-label': 'Resize panels', 'data-muxui-action-target': 'true' }), h(p.Panel, { id: 'side', minSize: 20, maxSize: 80 }, h('strong', null, 'Side'), h('p', null, 'Details')));
}

/** Render an R1.6 scene with the equivalent Mux public composition. */
export function renderR16MuxPlan(entry, fixture, { h, packages }) {
  const props = propsFor(entry);
  const data = fixture.data;
  const model = { state: entry.state, label: String(data.label), placeholder: String(data.placeholder), description: String(data.description), error: String(data.error), value: data.value, items: (data.items ?? []).map((item, index) => typeof item === 'object' ? { ...item, id: String(item.id ?? item.value ?? index), label: textFor(item) } : { id: String(item), label: textFor(item) }) };
  const p = packages;
  let content;
  switch (entry.component) {
    case 'AlertDialog': content = alertDialog(h, p.AlertDialog, { ...props, state: entry.state }); break;
    case 'ButtonGroup': { const attached = hasOwn(entry.props, 'attached') ? entry.props.attached : entry.state === 'attached'; content = h(p.ButtonGroup, { orientation: props.orientation ?? 'horizontal', attached, disabled: props.disabled, 'aria-label': 'Document actions' }, h('button', { type: 'button', disabled: props.disabled, 'data-muxui-action-target': 'true' }, 'Save'), h('button', { type: 'button', disabled: props.disabled }, 'Share')); break; }
    case 'Card': { const variant = ['elevated', 'outlined', 'filled'].includes(entry.state) && !hasOwn(entry.props, 'variant') ? entry.state : props.variant; const padding = entry.props?.padding; const children = [h(p.Card.Header, { key: 'header' }, model.label), h(p.Card.Body, { key: 'body' }, model.description), h(p.Card.Footer, { key: 'footer' }, 'View details')]; const interactive = hasOwn(entry.props, 'selected') || hasOwn(entry.props, 'pending') || hasOwn(entry.props, 'disabled') || entry.state === 'focused'; content = interactive ? h(p.Card.Button, { variant, padding, selected: props.selected, pending: props.pending, disabled: props.disabled, 'data-muxui-action-target': 'true' }, ...children) : h(p.Card.Root, { variant, padding }, ...children); break; }
    case 'CheckboxField': content = h(p.CheckboxField.Root, { checked: props.checked, indeterminate: props.indeterminate, size: props.size, disabled: props.disabled, invalid: props.invalid, required: props.required, readOnly: props.readOnly }, h(p.CheckboxField.Button, { disabled: props.disabled, 'data-muxui-action-target': 'true' }, h(p.CheckboxField.Indicator, null, '✓'), model.label), h(p.CheckboxField.Description, null, model.description), h(p.CheckboxField.Error, null, model.error)); break;
    case 'ColorModeToggle': { const mode = hasOwn(entry.props, 'mode') ? entry.props.mode : ['light', 'dark'].includes(entry.state) ? entry.state : undefined; content = h(p.ColorModeToggle, { mode, disabled: props.disabled, 'aria-label': model.label, 'data-muxui-action-target': 'true' }); break; }
    case 'CommandPalette': content = commandPalette(h, p.CommandPalette, { ...props, state: entry.state, items: entry.props?.items }, model); break;
    case 'HeaderNav': { const current = hasOwn(entry.props, 'current') ? entry.props.current : entry.state === 'current'; content = headerNav(h, p.HeaderNav, model, p.Button, current); break; }
    case 'InputTags': { const tagPlacement = hasOwn(entry.props, 'tagPlacement') ? entry.props.tagPlacement : entry.state === 'below' ? 'below' : 'inline'; const size = hasOwn(entry.props, 'size') ? entry.props.size : 'md'; content = h(p.InputTags.Root, { label: model.label, placeholder: model.placeholder, description: model.description, errorMessage: model.error, defaultValue: model.items.slice(0, 2).map(textFor), tagPlacement, size, disabled: props.disabled, invalid: props.invalid, 'data-muxui-action-target': 'true' }); break; }
    case 'Input': { const value = hasOwn(entry.props, 'value') ? entry.props.value : entry.state === 'empty' ? '' : model.value ?? ''; const size = hasOwn(entry.props, 'size') ? entry.props.size : undefined; content = h(p.Input.Root, { size, disabled: props.disabled, invalid: props.invalid, required: props.required, readOnly: props.readOnly, defaultValue: value }, ...field(h, p.Input, { ...model, size })); break; }
    case 'Lightbox': content = lightbox(h, p.Lightbox, props, model); break;
    case 'Markdown': content = h(p.Markdown, { source: hasOwn(entry.props, 'source') ? entry.props.source : data.markdown, baseUrl: hasOwn(entry.props, 'baseUrl') ? entry.props.baseUrl : undefined, 'data-muxui-markdown': 'true' }); break;
    case 'MultiSelect': { const items = Array.isArray(entry.props?.items) ? entry.props.items : model.items; const selectedKeys = hasOwn(entry.props, 'selectedKeys') ? (entry.props.selectedKeys === 'all' ? 'all' : selection(entry.props.selectedKeys)) : entry.state === 'selected' ? selection([model.items[0]?.id]) : undefined; const showSearch = hasOwn(entry.props, 'showSearch') ? entry.props.showSearch : true; const showFooter = hasOwn(entry.props, 'showFooter') ? entry.props.showFooter : true; content = h(p.MultiSelect.Root, { label: model.label, placeholder: model.placeholder, items, size: props.size, selectedKeys, disabled: props.disabled, invalid: props.invalid, required: props.required, description: model.description, errorMessage: model.error, showSearch, showFooter }, (item) => hItem(h, p.MultiSelect, item, { disabled: item.disabled === true })); break; }
    case 'PaymentInput': { const values = { visa: '4242424242424242', mastercard: '5555555555554444', amex: '378282246310005', discover: '6011111111111117', unknown: '9999999999999999' }; const paymentProps = { disabled: props.disabled, invalid: props.invalid, required: props.required, readOnly: props.readOnly }; if (entry.state !== 'typed') paymentProps.value = hasOwn(entry.props, 'value') ? entry.props.value : values[entry.state] ?? ''; content = h(p.PaymentInput.Root, paymentProps, h(p.PaymentInput.Label, null, model.label), h(p.PaymentInput.Group, null, h(p.PaymentInput.Input, { 'aria-label': model.label, placeholder: model.placeholder }), h(p.PaymentInput.CardIcon, null)), h(p.PaymentInput.Description, null, model.description), h(p.PaymentInput.Error, null, model.error)); break; }
    case 'ProgressCircle': {
      const hasValue = entry.props && Object.prototype.hasOwnProperty.call(entry.props, 'value');
      const value = hasValue ? entry.props.value : entry.state === 'indeterminate' ? null : entry.state === 'zero' ? 0 : entry.state === 'complete' ? 100 : 64;
      const size = hasOwn(entry.props, 'size') ? entry.props.size : ['sm', 'md', 'lg'].includes(entry.state) ? entry.state : undefined;
      const progressProps = { value, size, label: model.label };
      if (entry.props && Object.prototype.hasOwnProperty.call(entry.props, 'minValue')) progressProps.minValue = entry.props.minValue;
      if (entry.props && Object.prototype.hasOwnProperty.call(entry.props, 'maxValue')) progressProps.maxValue = entry.props.maxValue;
      content = h(p.ProgressCircle.Root, progressProps, h(p.ProgressCircle.Track, null), h(p.ProgressCircle.Label, null, model.label), h(p.ProgressCircle.Value, null));
      break;
    }
    case 'RadioField': { const value = hasOwn(entry.props, 'value') ? String(entry.props.value) : 'plan'; const selected = hasOwn(entry.props, 'selected') ? entry.props.selected : entry.state === 'selected'; content = h(p.RadioGroup, { 'aria-label': 'Plan', value: selected ? value : undefined, disabled: props.disabled, invalid: props.invalid, required: props.required, readOnly: props.readOnly }, h(p.RadioField.Root, { value, size: props.size, disabled: props.disabled, invalid: props.invalid, required: props.required, readOnly: props.readOnly }, h(p.RadioField.Button, { disabled: props.disabled, 'data-muxui-action-target': 'true' }, h(p.RadioField.Indicator, null, h(p.RadioField.Dot, null)), model.label), h(p.RadioField.Description, null, model.description), props.omitError ? null : h(p.RadioField.Error, null, model.error))); break; }
    case 'Resizable': content = resizable(h, p.Resizable, props, model); break;
    case 'Sidebar': content = sidebar(h, p.Sidebar, model, props); break;
    case 'SwitchField': content = h(p.SwitchField.Root, { checked: props.checked, disabled: props.disabled, invalid: props.invalid, required: props.required, readOnly: props.readOnly }, h(p.SwitchField.Button, { disabled: props.disabled, 'data-muxui-action-target': 'true' }, h(p.SwitchField.Thumb, null), model.label), h(p.SwitchField.Description, null, model.description), h(p.SwitchField.Error, null, model.error)); break;
    case 'TagSelect': { const items = Array.isArray(entry.props?.items) ? entry.props.items : model.items; const selectedKeys = hasOwn(entry.props, 'selectedKeys') ? selection(entry.props.selectedKeys) : entry.state === 'selected' ? selection([model.items[0]?.id]) : undefined; content = h(p.TagSelect.Root, { label: model.label, placeholder: model.placeholder, items, size: props.size, selectedKeys, disabled: props.disabled, invalid: props.invalid, required: props.required, description: model.description, errorMessage: model.error, 'data-muxui-action-target': 'true' }, (item) => hItem(h, p.TagSelect, item, { disabled: item.disabled === true })); break; }
    case 'TextArea': { const value = hasOwn(entry.props, 'value') ? entry.props.value : entry.state === 'empty' ? '' : model.value ?? ''; const size = hasOwn(entry.props, 'size') ? entry.props.size : undefined; const rows = hasOwn(entry.props, 'rows') ? entry.props.rows : undefined; content = h(p.TextArea.Root, { size, disabled: props.disabled, invalid: props.invalid, required: props.required, readOnly: props.readOnly, defaultValue: value }, ...field(h, p.TextArea, { ...model, size, rows }, true)); break; }
    case 'TextEditor': { const toolbar = hasOwn(entry.props, 'toolbar') ? entry.props.toolbar : 'simple'; const floating = hasOwn(entry.props, 'floating') ? entry.props.floating : false; const bubbleMenu = hasOwn(entry.props, 'bubbleMenu') ? entry.props.bubbleMenu : false; const defaultValue = hasOwn(entry.props, 'defaultValue') ? entry.props.defaultValue : { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: model.description, ...(entry.state === 'selected' ? { marks: [{ type: 'bold' }] } : {}) }] }] }; content = h(p.TextEditor, { label: model.label, description: model.description, placeholder: model.placeholder, defaultValue, disabled: props.disabled, invalid: props.invalid, bubbleMenu, floating, toolbar }); break; }
    default: throw new Error(`Unsupported R1.6 Mux family: ${entry.component}`);
  }
  return h('div', { 'data-muxui-paired-case': entry.id, 'data-muxui-family': entry.component, 'data-muxui-state': entry.state, 'data-muxui-action': entry.action?.type ?? entry.action }, content);
}
