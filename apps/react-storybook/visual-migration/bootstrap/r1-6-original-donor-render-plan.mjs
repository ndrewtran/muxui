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
  // Finite R1.6 cases carry source-backed prop values separately from their
  // state. Apply those values before the renderer-specific state projection so
  // donor captures exercise the real variant axes rather than only metadata.
  const props = { ...propsFor(entry), ...(entry.props ?? {}) };
  const sourceProps = entry.props ?? {};
  const model = fixtureRenderModel(fixture);
  const data = model.data;
  const copy = model.copy;
  const fieldProps = (family) => fixtureFieldPropsFor(fixture, family);
  const sourceItems = (fallback) => Array.isArray(sourceProps.items) ? sourceProps.items : fallback;
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const selectionProps = (selectedId, defaultMode = 'single') => ({
    selectionMode: props.selectionMode ?? (entry.state === 'selected' ? 'single' : defaultMode),
    selectedKeys: props.selectedIds,
    defaultSelectedKeys: props.defaultSelectedIds
      ?? (props.selectedIds === undefined && entry.state === 'selected' ? [selectedId] : undefined),
  });
  const donorStateProps = (input = props) => {
    const { disabled, readOnly, required, invalid, selected, defaultSelected, pending, indeterminate, expanded, ...rest } = input;
    return {
      ...rest,
      isDisabled: typeof disabled === 'boolean' ? disabled : rest.isDisabled,
      isReadOnly: typeof readOnly === 'boolean' ? readOnly : rest.isReadOnly,
      isRequired: typeof required === 'boolean' ? required : rest.isRequired,
      isInvalid: typeof invalid === 'boolean' ? invalid : rest.isInvalid,
      isSelected: typeof selected === 'boolean' ? selected : rest.isSelected,
      defaultSelected,
      isPending: typeof pending === 'boolean' ? pending : rest.isPending,
      isIndeterminate: typeof indeterminate === 'boolean' ? indeterminate : rest.isIndeterminate,
      isExpanded: typeof expanded === 'boolean' ? expanded : rest.isExpanded,
    };
  };
  const donorOverlayProps = (input = props) => {
    const { open, defaultOpen, dismissable, ...rest } = input;
    const controlled = typeof open === 'boolean';
    return {
      ...rest,
      // Lifecycle cases begin closed so the runner's real trigger action can
      // expose the entering phase, while closing cases begin open so Escape
      // exposes the exiting phase before the overlay unmounts.
      isOpen: controlled ? open : undefined,
      defaultOpen: controlled ? undefined : typeof defaultOpen === 'boolean' ? defaultOpen : ['open', 'closing'].includes(entry.state) ? true : undefined,
      isDismissable: typeof dismissable === 'boolean' ? dismissable : undefined,
    };
  };
  const donorLinkProps = (input = props) => {
    const { current, ...rest } = donorStateProps(input);
    return rest;
  };
  const colorProps = (fallback) => {
    const { value, defaultValue, ...rest } = donorStateProps(props);
    return {
      ...rest,
      value: value === undefined ? undefined : colorValue(value, p),
      defaultValue: value === undefined ? colorValue(defaultValue ?? fallback, p) : undefined,
    };
  };
  const calendarProps = (input, range = false) => {
    const next = { ...input };
    const parse = (value) => typeof value === 'string' ? runtime.parseFixtureDate(value) : value;
    if (range) {
      if (next.value) next.value = { start: parse(next.value.start), end: parse(next.value.end) };
      if (next.defaultValue) next.defaultValue = { start: parse(next.defaultValue.start), end: parse(next.defaultValue.end) };
    } else {
      for (const key of ['value', 'defaultValue', 'focusedValue', 'minValue', 'maxValue']) {
        if (next[key] !== undefined) next[key] = parse(next[key]);
      }
    }
    return next;
  };
  // The pinned Tale roots are composed from React Aria primitives and do not
  // consistently cascade a disabled root into manually supplied children.
  // This private donor-only adaptation forwards the state to the equivalent
  // parts/items, preserving Core's public disabled semantics for comparison.
  const disabledProps = (props.disabled ?? entry.state === 'disabled') ? { isDisabled: true, disabled: true } : {};
  const indicatorIcon = props.indeterminate === true || entry.state === 'indeterminate' ? MinusIcon : CheckIcon;
  const Icon = IconPackage?.Icon ?? 'tale-icon';
  switch (entry.component) {
    case 'Button': return h(p.Button, donorStateProps(props), copy);
    case 'Breadcrumbs': return h(p.Root, donorStateProps(props), sourceItems(data.items).map((item, index) => {
      const itemValue = typeof item === 'object' ? item : { label: item, href: '#' };
      const itemProps = { key: itemValue.id ?? index, isDisabled: itemValue.disabled };
      return h(p.Item, itemProps, h(p.Link, { href: itemValue.href ?? '#', isDisabled: itemValue.disabled, 'aria-current': itemValue.current ? 'page' : undefined }, itemValue.label ?? textItem(itemValue, index)));
    }));
    case 'Checkbox': return h(p.Root, { ...donorStateProps(props), isSelected: typeof props.checked === 'boolean' ? props.checked : props.isSelected }, h(p.Indicator, null, h(Icon, { icon: indicatorIcon, size: 'sm' })), copy);
    case 'Disclosure': return h(p.Root, donorStateProps(props), h(p.Trigger, null, copy), h(p.Panel, null, `${copy} content`));
    case 'DisclosureGroup': {
      const { multiple, ...groupProps } = donorStateProps(props);
      const expandedKeys = entry.state === 'expanded' ? [model.selected.disclosureId] : undefined;
      return h(p.Root, {
        ...groupProps,
        allowsMultipleExpanded: typeof multiple === 'boolean' ? multiple : true,
        expandedKeys: props.expandedIds,
        defaultExpandedKeys: props.defaultExpandedIds ?? (props.expandedIds === undefined ? expandedKeys : undefined),
      }, data.children.disclosureGroup.map((item) => h(p.Item, { key: item.id, id: item.id },
        h(p.Header, null, h(p.Trigger, null, item.title)),
        h(p.Panel, null, item.content),
      )));
    }
    case 'Link': return h(p.Link, {
      ...donorLinkProps(props),
      href: '#',
      'aria-current': entry.state === 'current' || props.current === true ? 'page' : undefined,
      // RAC exposes current as a render-prop value, while Tale's stylesheet
      // consumes the stable attribute. Bind both in the private donor fixture
      // so this comparison proves the mapped CSS state rather than a default.
      'data-current': entry.state === 'current' || props.current === true ? 'true' : undefined,
    }, copy);
    case 'Meter': {
      const value = props.value ?? (entry.state === 'low' ? 24 : entry.state === 'high' ? 88 : data.values.meter);
      return h(p.Root, { ...props, label: copy, value }, h(p.Header, null, h(p.Label, null, copy), h(p.Value, null, `${value}%`)), h(p.Track, null, h(p.Indicator, { value })));
    }
    case 'ProgressBar': {
      const value = hasOwn(props, 'value') ? props.value ?? undefined : entry.state === 'indeterminate' ? undefined : entry.state === 'complete' ? 100 : data.values.progress;
      const isIndeterminate = value === undefined;
      return h(p.Root, { ...props, label: copy, value, isIndeterminate }, h(p.Header, null, h(p.Label, null, copy), h(p.Value, null, isIndeterminate ? 'Loading' : `${value}%`)), h(p.Track, null, h(p.Indicator, { value, min: props.minValue, max: props.maxValue })));
    }
    case 'Separator': return h(p.Separator, props);
    case 'ToggleButton': return h(p.ToggleButton, donorStateProps(props), copy);
    case 'Autocomplete': {
      const focused = entry.state === 'focused';
      return h(p.Root, { ...props, isOpen: focused }, h('div', {
        style: { display: 'flex', flexDirection: 'column', width: '100%' },
      }, h(p.SearchField, { ...props, 'aria-label': fieldProps('Autocomplete').label }, h(SearchFieldPackage.Label, null, fieldProps('Autocomplete').label), h(p.Input, { placeholder: fieldProps('Autocomplete').placeholder })), h('div', {
        className: 'tale-autocomplete__popover',
        hidden: !focused,
      }, h(p.ListBox, { className: 'tale-autocomplete__listbox' }, data.items.map((item, index) => h(p.Item, { key: index }, item))))));
    }
    case 'CheckboxGroup': return h(FieldPackage.Root, null, h(FieldPackage.Label, null, copy), h(p.CheckboxGroup, { ...donorStateProps(props), 'aria-label': copy, defaultValue: entry.state === 'selected' ? [model.selected.choice] : undefined }, data.choices.map((item) => h(packages.Checkbox.Root, { key: item.value, value: item.value }, h(packages.Checkbox.Indicator, null, h(Icon, { icon: indicatorIcon, size: 'sm' })), item.label))));
    case 'DateField': return renderField(p, model, calendarProps(donorStateProps(props)), 'date');
    case 'DatePicker': return h(p.Root, { ...donorOverlayProps(calendarProps(donorStateProps(props))), defaultValue: runtime.parseFixtureDate(data.date) }, h(p.Label, null, copy), h(p.Group, null, h(p.DateInput, null, (segment) => h(p.Segment, { segment, key: segment.type })), h(p.Trigger)), h(p.Popover, { placement: props.placement }, h(p.Dialog, null, renderCalendar(CalendarPackage.Calendar, model, {}))));
    case 'DateRangePicker': return h(p.Root, { ...donorOverlayProps(calendarProps(donorStateProps(props), true)), defaultValue: { start: runtime.parseFixtureDate(data.dateRange.start), end: runtime.parseFixtureDate(data.dateRange.end) } }, h(p.Label, null, copy), h(p.Group, null, h(p.StartDate, null, (segment) => h(p.Segment, { segment, key: `start-${segment.type}` })), h('span', { 'aria-hidden': 'true' }, '–'), h(p.EndDate, null, (segment) => h(p.Segment, { segment, key: `end-${segment.type}` })), h(p.Trigger)), h(p.Popover, { placement: props.placement }, h(p.Dialog, null, renderCalendar(RangeCalendarPackage.RangeCalendar, model, {}, true))));
    case 'Form': return h(p.Form, props, h(packages.TextField.Root, { label: data.children.form.fieldLabel, name: 'name' }, h(packages.TextField.Label, null, data.children.form.fieldLabel), h(packages.TextField.Input)), h(ButtonPackage.Button, { type: 'submit' }, data.children.form.submit));
    case 'NumberField': return h(p.Root, { ...donorStateProps(props), label: copy, defaultValue: data.values.number }, h(p.Label, null, copy), h(p.Group, null, h(p.Decrement), h(p.Input), h(p.Increment)));
    case 'SearchField': {
      const defaultValue = props.defaultValue ?? (props.value === undefined && entry.state === 'filled' ? 'Mux' : undefined);
      const filled = String(props.value ?? defaultValue ?? '').length > 0;
      return h(p.Root, { ...donorStateProps(props), defaultValue }, h(p.Label, null, fieldProps('SearchField').label), h(p.Input, { placeholder: fieldProps('SearchField').placeholder }), filled ? h(p.ClearButton, { 'aria-label': 'Clear search' }, h(Icon, { icon: XIcon, size: 'sm' })) : null);
    }
    case 'Switch': return h(p.Root, donorStateProps(props), h(p.Thumb, null), copy);
    case 'TextField': return h(p.Root, { ...donorStateProps(props), label: data.label, placeholder: data.placeholder }, h(p.Label, null, data.label), h(p.Input));
    case 'TimeField': {
      const parseTime = typeof runtime.parseFixtureTime === 'function'
        ? runtime.parseFixtureTime
        : (value) => value;
      return renderField(p, model, {
        ...donorStateProps(props),
        value: typeof props.value === 'string' ? parseTime(props.value) : props.value,
        defaultValue: typeof props.defaultValue === 'string' ? parseTime(props.defaultValue) : props.defaultValue,
      }, 'time');
    }
    case 'Calendar': return renderCalendar(p, model, calendarProps({ ...donorStateProps(props), 'aria-label': copy }));
    case 'RangeCalendar': return renderCalendar(p, model, calendarProps({ ...donorStateProps(props), 'aria-label': copy }, true), true);
    case 'ColorArea': return h(p.Root, colorProps(data.color), h(p.Thumb));
    case 'ColorField': return h(p.Root, { ...colorProps(data.color), label: copy }, h(p.Label, null, copy), h(p.Input));
    case 'ColorPicker': {
      const nestedStateProps = entry.state === 'disabled'
        ? disabledProps
        : entry.state === 'read-only'
          ? { isReadOnly: true, readOnly: true }
          : {};
      return h(p.Root, colorProps(data.color),
        h(packages.ColorArea.Root, nestedStateProps, h(packages.ColorArea.Thumb)),
        h(packages.ColorField.Root, { ...nestedStateProps, label: copy }, h(packages.ColorField.Label, null, copy), h(packages.ColorField.Input)));
    }
    case 'ColorSlider': return h(p.Root, { ...colorProps(data.color), label: copy, channel: props.channel ?? 'red' }, h(p.Label, null, copy), h(p.Track, null, h(p.Thumb)));
    case 'ColorSwatch': return h(p.ColorSwatch, { ...donorStateProps(props), color: props.color ?? data.color });
    case 'ColorSwatchPicker': {
      const items = sourceItems(data.items);
      const selected = hasOwn(props, 'value') ? props.value : entry.state === 'selected' ? model.selected.color : undefined;
      const selectedColor = typeof selected === 'string'
        ? items.find((item) => item.id === selected)?.color ?? selected
        : selected;
      return h(p.Root, { ...donorStateProps(props), 'aria-label': copy, value: selectedColor === undefined ? undefined : colorValue(selectedColor, p), defaultValue: selectedColor === undefined ? undefined : colorValue(selectedColor, p) }, items.map((item) => h(p.Item, { ...disabledProps, key: item.id, id: item.id, color: item.color }, h(ColorSwatchPackage.ColorSwatch, disabledProps))));
    }
    case 'ColorWheel': return h(p.Root, { ...colorProps(data.color), 'aria-label': copy, outerRadius: props.outerRadius ?? 96, innerRadius: props.innerRadius ?? 64 }, h(p.Track, null), h(p.Thumb, null));
    case 'ComboBox': {
      const items = sourceItems(data.items);
      const { value, defaultValue, selectedId, defaultSelectedId, ...comboBoxProps } = donorOverlayProps(donorStateProps(props));
      return h(p.Root, {
        ...comboBoxProps,
        label: fieldProps('ComboBox').label,
        inputValue: value,
        defaultInputValue: defaultValue,
        selectedKey: selectedId,
        defaultSelectedKey: defaultSelectedId ?? (selectedId === undefined && entry.state === 'selected' ? model.selected.item : undefined),
      },
        h(p.Label, null, fieldProps('ComboBox').label),
        h(p.InputGroup, null, h(p.Input, { placeholder: fieldProps('ComboBox').placeholder }), h(p.Trigger)),
        h(p.Popover, { placement: props.placement }, h(p.ListBox, null,
          items.map((item) => h(p.Item, { key: item.id ?? item, id: item.id ?? item, textValue: item.label ?? item }, item.label ?? item)))),
      );
    }
    case 'GridList': { const items = entry.state === 'empty' ? [] : sourceItems(data.items); return h(p.Root, { ...donorStateProps(props), 'aria-label': copy, ...selectionProps(model.selected.itemId) }, items.map((item, index) => h(p.Item, { ...disabledProps, key: item.id ?? item, id: item.id ?? item, textValue: typeof item === 'object' ? item.label ?? item.name ?? String(item.value ?? item.id) : String(item) }, textItem(item, index)))); }
    case 'ListBox': { const items = entry.state === 'empty' ? [] : sourceItems(data.items); return h(p.Root, { ...donorStateProps(props), 'aria-label': copy, ...selectionProps(model.selected.itemId) }, items.map((item, index) => h(p.Item, { ...disabledProps, key: item.id ?? item, id: item.id ?? item, textValue: typeof item === 'object' ? item.label ?? item.name ?? String(item.value ?? item.id) : String(item) }, textItem(item, index)))); }
    case 'Menu': return h(p.MenuList, {
      ...donorStateProps(props),
      'aria-label': copy,
      // MenuList is the direct Tale equivalent of Mux's public Menu root.
      // Keeping the finite donor surface trigger-free avoids adding a
      // private MenuTrigger/Popover wrapper to the visual comparison.
      size: props.size,
    }, sourceItems(data.items).map((item, index) => h(p.Item, { ...disabledProps, key: item.id ?? index, id: item.id ?? item }, textItem(item, index))));
    case 'RadioGroup': return h(FieldPackage.Root, null, h(FieldPackage.Label, null, copy), h(p.Group, { ...donorStateProps(props), 'aria-label': copy, value: props.value ?? (entry.state === 'selected' ? model.selected.option : undefined) }, data.options.map((item) => h(RadioFieldPackage.Radio.Root, { key: item.value, value: item.value }, h(RadioFieldPackage.Radio.Indicator, null), item.label))));
    case 'Select': {
      const items = sourceItems(data.items);
      return h(p.Root, { ...donorOverlayProps(donorStateProps(props)), label: fieldProps('Select').label, selectedKey: props.value ?? (entry.state === 'selected' ? model.selected.item : undefined) },
        h(p.Label, null, fieldProps('Select').label),
        h(p.Trigger, null, h(p.Value, { placeholder: fieldProps('Select').placeholder }), h(p.Icon)),
        h(p.Popover, { placement: props.placement }, h(p.ListBox, null,
          items.map((item) => h(p.Item, { key: item.id ?? item, id: item.id ?? item, textValue: item.label ?? item }, item.label ?? item)))),
      );
    }
    case 'Slider': return h(p.Root, { ...donorStateProps(props), label: copy, defaultValue: data.values.slider }, h(p.Header, null, h(p.Label, null, copy), h(p.Output, null)), h(p.Control, null, h(p.Track, null, h(p.Indicator), h(p.Thumb))));
    case 'Table': { const rows = entry.state === 'empty' ? [] : data.rows; return h(p.Root, { ...donorStateProps(props), 'aria-label': copy, ...selectionProps(model.selected.rowId, 'none') }, h(p.Header, null, data.columns.map((column) => h(p.Column, { key: column.id }, column.label))), h(p.Body, null, rows.map((row) => h(p.Row, { ...disabledProps, key: row.id, id: row.id }, data.columns.map((column) => h(p.Cell, { key: column.id }, row.values[column.id])))))); }
    case 'Tabs': return h(p.Root, { ...donorStateProps(props), 'aria-label': copy, selectedKey: props.value ?? (entry.state === 'selected' ? model.selected.item : undefined) }, h(p.List, null, data.items.map((item) => h(p.Tab, { ...disabledProps, key: item.id, id: item.id }, item.label))), data.items.map((item) => h(p.Panel, { key: item.id, id: item.id }, item.panel)));
    case 'TagGroup': {
      const items = entry.state === 'empty' ? [] : sourceItems(data.items);
      const groupDisabled = typeof props.disabled === 'boolean' ? props.disabled : entry.state === 'disabled';
      const normalized = items.map((item, index) => {
        const source = typeof item === 'string' ? { label: item, value: item } : (item ?? {});
        const id = String(source.id ?? source.key ?? source.value ?? index);
        return { ...source, id, label: source.label ?? source.name ?? source.value ?? id };
      });
      return h(p.Root, { ...donorStateProps(props), label: copy }, h(p.Label, null, copy), h(p.List, null, normalized.map((item) => h(p.Tag, {
        key: item.id,
        id: item.id,
        isDisabled: groupDisabled || item.disabled,
      }, item.label))));
    }
    case 'ToggleButtonGroup': return h(p.ToggleButtonGroup, { ...donorStateProps(props), 'aria-label': copy, ...selectionProps(model.selected.toggleId) }, data.children.toggleButtonGroup.map((item) => h(ToggleButtonPackage.ToggleButton, { key: item.id, id: item.id }, item.label)));
    case 'Toolbar': return h(p.Root, { ...donorStateProps(props), 'aria-label': copy }, data.children.toolbar.map((item) => h(p.Button, { key: item }, item)));
    case 'Tree': {
      const items = entry.state === 'empty' ? [] : sourceItems(data.items);
      return h('div', { style: { display: 'contents' } },
        h(p.Root, { ...donorStateProps(props), 'aria-label': copy, ...selectionProps(model.selected.treeId), expandedKeys: props.expandedIds, defaultExpandedKeys: props.defaultExpandedIds ?? (props.expandedIds === undefined && entry.state === 'expanded' ? [model.selected.treeId] : undefined) }, items.map((item) => renderTreeItem(item, p, item.id, disabledProps))));
    }
    case 'Virtualizer': {
      const items = entry.state === 'empty' ? [] : sourceItems(data.items);
      const viewport = fixture.frame?.virtualizer;
      if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
        throw new Error('Tale migration Virtualizer requires a finite positive semantic viewport');
      }
      const height = props.height ?? viewport.height;
      return h(p.Virtualizer, { layout: new p.ListLayout({ rowSize: props.itemHeight ?? 32 }) }, h(packages.ListBox.Root, {
        ...disabledProps,
        'aria-label': copy,
        className: 'tale-virtualizer',
        style: {
          boxSizing: 'border-box',
          width: `${viewport.width}px`,
          height: `${height}px`,
          maxHeight: `${height}px`,
          overflow: 'auto',
        },
      }, items.map((item, index) => h(packages.ListBox.Item, { ...disabledProps, key: index }, item))));
    }
    case 'DropZone': return h(p.DropZone, donorStateProps(props), copy);
    case 'FileTrigger': return h(p.FileTrigger, { ...props, acceptedFileTypes: ['text/plain'] }, h(ButtonPackage.Button, disabledProps, copy));
    case 'Dialog': return h(p.Root, donorOverlayProps(props), h(ButtonPackage.Button, { variant: 'primary' }, copy), h(p.Backdrop, null, h(p.Popup, null, h(p.Title, null, copy), h(p.Description, null, `${copy} content.`), h(p.Close, { 'aria-label': 'Close' }))));
    case 'Popover': return h(p.Root, donorOverlayProps(props), h(ButtonPackage.Button, { variant: 'primary' }, copy), h(p.Popup, { placement: props.placement }, h(p.Title, null, copy), h(p.Description, null, `${copy} content.`)));
    case 'PreviewTrigger': return h(p.Root, { ...donorOverlayProps(props), delay: props.delay ?? 0, closeDelay: props.closeDelay ?? 0 }, h(ButtonPackage.Button, { variant: 'primary', className: 'tale-preview-card__trigger' }, copy), h(p.Popup, { placement: props.placement }, h(p.Content, { 'aria-label': copy }, `${copy} content.`)));
    case 'Toast': return h(ToastHarness, { copy, variant: props.variant, duration: props.duration });
    case 'Tooltip': return h(p.Root, donorOverlayProps(props), h(ButtonPackage.Button, { variant: 'primary', className: 'tale-tooltip__trigger' }, copy), h(p.Popup, { placement: props.placement }, copy));
    default: throw new Error(`Tale adapter has no renderer for ${entry.component}`);
  }
}
