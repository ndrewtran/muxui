import { fixtureFieldPropsFor, fixtureRenderModel } from '../../src/visual-migration-fixture-map.mjs';

/**
 * Build the Tale React element for one canonical fixture.
 *
 * This module deliberately contains no React or Tale imports. The retained
 * donor entry supplies those renderer-specific primitives, which makes this
 * exact production mapping directly testable with a small fake registry.
 */
export function renderFamilyPlan(entry, fixture, runtime) {
  const {
    h,
    packages,
    ButtonPackage,
    ColorSwatchPackage,
    ToggleButtonPackage,
    RadioFieldPackage,
    IconPackage,
    CheckIcon,
    MinusIcon,
    XIcon,
    SearchFieldPackage,
    FieldPackage,
    CalendarPackage,
    RangeCalendarPackage,
    propsFor,
    renderCalendar,
    renderField,
    renderTreeItem,
    ToastHarness,
    textItem,
    colorValue,
  } = runtime;
  const p = packages[entry.component];
  const props = propsFor(entry);
  const model = fixtureRenderModel(fixture);
  const data = model.data;
  const copy = model.copy;
  const fieldProps = (family) => fixtureFieldPropsFor(fixture, family);
  // The pinned Tale roots are composed from React Aria primitives and do not
  // consistently cascade a disabled root into manually supplied children.
  // This private donor-only adaptation forwards the state to the equivalent
  // parts/items, preserving Core's public disabled semantics for comparison.
  const disabledProps = entry.state === 'disabled' ? { isDisabled: true, disabled: true } : {};
  const indicatorIcon = entry.state === 'indeterminate' ? MinusIcon : CheckIcon;
  const Icon = IconPackage?.Icon ?? 'tale-icon';
  switch (entry.component) {
    case 'Button': return h(p.Button, props, copy);
    case 'Breadcrumbs': return h(p.Root, props, data.items.map((item, index) => {
      const itemValue = typeof item === 'object' ? item : { label: item, href: '#' };
      const itemProps = { key: itemValue.id ?? index, isDisabled: itemValue.disabled };
      return h(p.Item, itemProps, h(p.Link, { href: itemValue.href ?? '#', isDisabled: itemValue.disabled }, itemValue.label ?? textItem(itemValue, index)));
    }));
    case 'Checkbox': return h(p.Root, props, h(p.Indicator, null, h(Icon, { icon: indicatorIcon, size: 'sm' })), copy);
    case 'Disclosure': return h(p.Root, props, h(p.Trigger, null, copy), h(p.Panel, null, `${copy} content`));
    case 'DisclosureGroup': return h('div', { className: 'tale-disclosure-group' }, data.children.disclosureGroup.map((item) => {
      const expanded = entry.state === 'expanded' && item.id === model.selected.disclosureId;
      return h(p.Root, { key: item.id, ...props, isExpanded: expanded, defaultExpanded: expanded }, h(p.Trigger, null, item.title), h(p.Panel, null, item.content));
    }));
    case 'Link': return h(p.Link, {
      ...props,
      href: '#',
      'aria-current': entry.state === 'current' ? 'page' : undefined,
      // RAC exposes current as a render-prop value, while Tale's stylesheet
      // consumes the stable attribute. Bind both in the private donor fixture
      // so this comparison proves the mapped CSS state rather than a default.
      'data-current': entry.state === 'current' ? 'true' : undefined,
    }, copy);
    case 'Meter': {
      const value = entry.state === 'low' ? 24 : entry.state === 'high' ? 88 : data.values.meter;
      return h(p.Root, { ...props, label: copy, value }, h(p.Header, null, h(p.Label, null, copy), h(p.Value, null, `${value}%`)), h(p.Track, null, h(p.Indicator, { value })));
    }
    case 'ProgressBar': {
      const value = entry.state === 'indeterminate' ? undefined : entry.state === 'complete' ? 100 : data.values.progress;
      return h(p.Root, { ...props, label: copy, value, 'data-complete': entry.state === 'complete' ? 'true' : undefined }, h(p.Header, null, h(p.Label, null, copy), h(p.Value, null, entry.state === 'indeterminate' ? 'Loading' : `${value}%`)), h(p.Track, null, h(p.Indicator, { value })));
    }
    case 'Separator': return h(p.Separator, props);
    case 'ToggleButton': return h(p.ToggleButton, props, copy);
    case 'Autocomplete': {
      const focused = entry.state === 'focused';
      return h(p.Root, { ...props, isOpen: focused }, h('div', {
        style: { display: 'flex', flexDirection: 'column', width: '100%' },
      }, h(p.SearchField, { ...props, 'aria-label': fieldProps('Autocomplete').label }, h(SearchFieldPackage.Label, null, fieldProps('Autocomplete').label), h(p.Input, { placeholder: fieldProps('Autocomplete').placeholder })), h('div', {
        className: 'tale-autocomplete__popover',
        hidden: !focused,
      }, h(p.ListBox, { className: 'tale-autocomplete__listbox' }, data.items.map((item, index) => h(p.Item, { key: index }, item))))));
    }
    case 'CheckboxGroup': return h(FieldPackage.Root, null, h(FieldPackage.Label, null, copy), h(p.CheckboxGroup, { ...props, 'aria-label': copy, defaultValue: entry.state === 'selected' ? [model.selected.choice] : undefined }, data.choices.map((item) => h(packages.Checkbox.Root, { key: item.value, value: item.value }, h(packages.Checkbox.Indicator, null, h(Icon, { icon: indicatorIcon, size: 'sm' })), item.label))));
    case 'DateField': return renderField(p, model, props, 'date');
    case 'DatePicker': return h(p.Root, { ...props, defaultValue: runtime.parseFixtureDate(data.date) }, h(p.Label, null, copy), h(p.Group, null, h(p.DateInput, null, (segment) => h(p.Segment, { segment, key: segment.type })), h(p.Trigger)), h(p.Popover, null, h(p.Dialog, null, renderCalendar(CalendarPackage.Calendar, model, {}))));
    case 'DateRangePicker': return h(p.Root, { ...props, defaultValue: { start: runtime.parseFixtureDate(data.dateRange.start), end: runtime.parseFixtureDate(data.dateRange.end) } }, h(p.Label, null, copy), h(p.Group, null, h(p.StartDate, null, (segment) => h(p.Segment, { segment, key: `start-${segment.type}` })), h(p.EndDate, null, (segment) => h(p.Segment, { segment, key: `end-${segment.type}` })), h(p.Trigger)), h(p.Popover, null, h(p.Dialog, null, renderCalendar(RangeCalendarPackage.RangeCalendar, model, {}, true))));
    case 'Form': return h(p.Form, props, h(packages.TextField.Root, { label: data.children.form.fieldLabel, name: 'name' }, h(packages.TextField.Label, null, data.children.form.fieldLabel), h(packages.TextField.Input)), h(ButtonPackage.Button, { type: 'submit' }, data.children.form.submit));
    case 'NumberField': return h(p.Root, { ...props, label: copy, defaultValue: data.values.number }, h(p.Label, null, copy), h(p.Group, null, h(p.Decrement), h(p.Input), h(p.Increment)));
    case 'SearchField': return h(p.Root, { ...props, defaultValue: entry.state === 'filled' ? 'Core' : undefined }, h(p.Label, null, fieldProps('SearchField').label), h(p.Input, { placeholder: fieldProps('SearchField').placeholder }), entry.state === 'filled' ? h(p.ClearButton, { 'aria-label': 'Clear search' }, h(Icon, { icon: XIcon, size: 'sm' })) : null);
    case 'Switch': return h(p.Root, props, h(p.Thumb, null), copy);
    case 'TextField': return h(p.Root, { ...props, label: data.label, placeholder: data.placeholder }, h(p.Label, null, data.label), h(p.Input));
    case 'TimeField': return renderField(p, model, props, 'time');
    case 'Calendar': return renderCalendar(p, model, { ...props, 'aria-label': copy });
    case 'RangeCalendar': return renderCalendar(p, model, { ...props, 'aria-label': copy }, true);
    case 'ColorArea': return h(p.Root, { ...props, defaultValue: colorValue(data.color, p) }, h(p.Thumb));
    case 'ColorField': return h(p.Root, { ...props, label: copy, defaultValue: colorValue(data.color, p) }, h(p.Label, null, copy), h(p.Input));
    case 'ColorPicker': {
      const nestedStateProps = entry.state === 'disabled'
        ? disabledProps
        : entry.state === 'read-only'
          ? { isReadOnly: true, readOnly: true }
          : {};
      return h(p.Root, { ...props, defaultValue: colorValue(data.color, p) },
        h(packages.ColorArea.Root, nestedStateProps, h(packages.ColorArea.Thumb)),
        h(packages.ColorField.Root, { ...nestedStateProps, label: copy }, h(packages.ColorField.Label, null, copy), h(packages.ColorField.Input)));
    }
    case 'ColorSlider': return h(p.Root, { ...props, label: copy, channel: 'red', defaultValue: colorValue(data.color, p) }, h(p.Label, null, copy), h(p.Track, null, h(p.Thumb)));
    case 'ColorSwatch': return h(p.ColorSwatch, { ...props, color: data.color });
    case 'ColorSwatchPicker': {
      return h(p.Root, { ...props, 'aria-label': copy, defaultValue: entry.state === 'selected' ? colorValue(model.selected.color, p) : undefined }, data.items.map((item) => h(p.Item, { ...disabledProps, key: item.id, id: item.id, color: item.color }, h(ColorSwatchPackage.ColorSwatch, disabledProps))));
    }
    case 'ColorWheel': return h(p.Root, { ...props, 'aria-label': copy, outerRadius: 96, innerRadius: 64, defaultValue: colorValue(data.color, p) }, h(p.Track, null), h(p.Thumb, null));
    case 'ComboBox': return h(p.Root, { ...props, label: fieldProps('ComboBox').label, defaultSelectedKey: entry.state === 'selected' ? model.selected.item : undefined }, h(p.Label, null, fieldProps('ComboBox').label), h(p.InputGroup, null, h(p.Input, { placeholder: fieldProps('ComboBox').placeholder }), h(p.Trigger)), h(p.Popover, null, h(p.ListBox, null, data.items.map((item, index) => h(p.Item, { key: item, id: item, textValue: item }, item)))));
    case 'GridList': { const items = entry.state === 'empty' ? [] : data.items; return h(p.Root, { ...props, 'aria-label': copy, selectionMode: entry.state === 'selected' ? 'single' : undefined, defaultSelectedKeys: entry.state === 'selected' ? [model.selected.itemId] : undefined }, items.map((item, index) => h(p.Item, { ...disabledProps, key: item.id ?? item, id: item.id ?? item, textValue: typeof item === 'object' ? item.label ?? item.name ?? String(item.value ?? item.id) : String(item) }, textItem(item, index)))); }
    case 'ListBox': { const items = entry.state === 'empty' ? [] : data.items; return h(p.Root, { ...props, 'aria-label': copy, selectionMode: entry.state === 'selected' ? 'single' : undefined, defaultSelectedKeys: entry.state === 'selected' ? [model.selected.itemId] : undefined }, items.map((item, index) => h(p.Item, { ...disabledProps, key: item.id ?? item, id: item.id ?? item, textValue: typeof item === 'object' ? item.label ?? item.name ?? String(item.value ?? item.id) : String(item) }, textItem(item, index)))); }
    case 'Menu': return h(p.Root, { ...props, 'aria-label': copy }, h(p.MenuList, null, data.items.map((item, index) => h(p.Item, { ...disabledProps, key: index }, item))));
    case 'RadioGroup': return h(FieldPackage.Root, null, h(FieldPackage.Label, null, copy), h(p.Group, { ...props, 'aria-label': copy, defaultValue: entry.state === 'selected' ? model.selected.option : undefined }, data.options.map((item) => h(RadioFieldPackage.Radio.Root, { key: item.value, value: item.value }, h(RadioFieldPackage.Radio.Indicator, null), item.label))));
    case 'Select': return h(p.Root, { ...props, label: fieldProps('Select').label, defaultSelectedKey: entry.state === 'selected' ? model.selected.item : undefined }, h(p.Label, null, fieldProps('Select').label), h(p.Trigger, null, h(p.Value, { placeholder: fieldProps('Select').placeholder }), h(p.Icon)), h(p.Popover, null, h(p.ListBox, null, data.items.map((item) => h(p.Item, { key: item, id: item, textValue: item }, item)))));
    case 'Slider': return h(p.Root, { ...props, label: copy, defaultValue: data.values.slider }, h(p.Header, null, h(p.Label, null, copy), h(p.Output, null)), h(p.Control, null, h(p.Track, null, h(p.Indicator), h(p.Thumb))));
    case 'Table': { const rows = entry.state === 'empty' ? [] : data.rows; return h(p.Root, { ...props, 'aria-label': copy, selectionMode: entry.state === 'selected' ? 'single' : undefined, defaultSelectedKeys: entry.state === 'selected' ? [model.selected.rowId] : undefined }, h(p.Header, null, data.columns.map((column) => h(p.Column, { key: column.id }, column.label))), h(p.Body, null, rows.map((row) => h(p.Row, { ...disabledProps, key: row.id, id: row.id }, data.columns.map((column) => h(p.Cell, { key: column.id }, row.values[column.id])))))); }
    case 'Tabs': return h(p.Root, { ...props, 'aria-label': copy }, h(p.List, null, data.items.map((item) => h(p.Tab, { ...disabledProps, key: item.id, id: item.id }, item.label))), data.items.map((item) => h(p.Panel, { key: item.id, id: item.id }, item.panel)));
    case 'TagGroup': { const items = entry.state === 'empty' ? [] : data.items; return h(p.Root, { ...props, label: copy }, h(p.Label, null, copy), h(p.List, null, items.map((item, index) => h(p.Tag, { key: index }, item)))); }
    case 'ToggleButtonGroup': return h(p.ToggleButtonGroup, { ...props, 'aria-label': copy, selectionMode: entry.state === 'selected' ? 'single' : undefined, defaultSelectedKeys: entry.state === 'selected' ? [model.selected.toggleId] : undefined }, data.children.toggleButtonGroup.map((item) => h(ToggleButtonPackage.ToggleButton, { key: item.id, id: item.id }, item.label)));
    case 'Toolbar': return h(p.Root, { ...props, 'aria-label': copy }, data.children.toolbar.map((item) => h(p.Button, { key: item }, item)));
    case 'Tree': {
      const items = entry.state === 'empty' ? [] : data.items;
      return h('div', { style: { display: 'contents' } },
        h(p.Root, { ...props, 'aria-label': copy, selectionMode: entry.state === 'selected' ? 'single' : undefined, defaultExpandedKeys: entry.state === 'expanded' ? [model.selected.treeId] : undefined, defaultSelectedKeys: entry.state === 'selected' ? [model.selected.treeId] : undefined }, items.map((item) => renderTreeItem(item, p, item.id, disabledProps))));
    }
    case 'Virtualizer': {
      const items = entry.state === 'empty' ? [] : data.items;
      const viewport = fixture.frame?.virtualizer;
      if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
        throw new Error('Tale migration Virtualizer requires a finite positive semantic viewport');
      }
      return h('div', {
        className: 'tale-virtualizer',
        style: { boxSizing: 'border-box', width: `${viewport.width}px`, height: `${viewport.height}px`, overflow: 'auto' },
      }, h(p.Virtualizer, { layout: new p.ListLayout({ rowSize: 32 }) }, h(packages.ListBox.Root, { ...disabledProps, 'aria-label': copy }, items.map((item, index) => h(packages.ListBox.Item, { ...disabledProps, key: index }, item)))));
    }
    case 'DropZone': return h(p.DropZone, props, copy);
    case 'FileTrigger': return h(p.FileTrigger, { ...props, acceptedFileTypes: ['text/plain'] }, h(ButtonPackage.Button, disabledProps, copy));
    case 'Dialog': return h(p.Root, { ...props, isOpen: entry.state === 'open' ? true : undefined, defaultOpen: entry.state === 'open' }, h(ButtonPackage.Button, { variant: 'primary' }, copy), h(p.Backdrop, null, h(p.Popup, null, h(p.Title, null, copy), h(p.Description, null, `${copy} content.`), h(p.Close, { 'aria-label': 'Close' }))));
    case 'Popover': return h(p.Root, { ...props, isOpen: entry.state === 'open' ? true : undefined, defaultOpen: entry.state === 'open' }, h(ButtonPackage.Button, { variant: 'primary' }, copy), h(p.Popup, null, h(p.Title, null, copy), h(p.Description, null, `${copy} content.`)));
    case 'PreviewTrigger': return h(p.Root, { delay: 0, closeDelay: 0, isOpen: entry.state === 'open' ? true : undefined }, h(ButtonPackage.Button, { variant: 'primary', className: 'tale-preview-card__trigger' }, copy), h(p.Popup, null, h(p.Content, { 'aria-label': copy }, `${copy} content.`)));
    case 'Toast': return h(ToastHarness, { copy });
    case 'Tooltip': return h(p.Root, { delay: 0, closeDelay: 0, isOpen: entry.state === 'open' ? true : undefined }, h(ButtonPackage.Button, { variant: 'primary', className: 'tale-tooltip__trigger' }, copy), h(p.Popup, null, copy));
    default: throw new Error(`Tale adapter has no renderer for ${entry.component}`);
  }
}
