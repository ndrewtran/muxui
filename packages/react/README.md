<!-- @generated-from: packages/react/src/generate.mjs -->
<!-- @generated-content-sha256: sha256:781d27ebd36793807bdd43a2c6b4a46433f4bc192f101f9b5b33a431442e300e -->
# @muxui/react

R1.6 current React union for the standalone Mux UI renderer.

- The current union contains Mux UI-owned family exports, including root exports and isolated subpaths.
- React Aria Components 1.20.0 is an internal replaceable substrate.
- MuxUI owns the public APIs, tokens, selectors, styling, accessibility behavior, lifecycle, and prop names.
- Tale UI is a pinned one-time styling donor; generated styling results are Mux UI-owned and Tale UI is not a dependency.
- The historical R1.5 closure retains its fixed family membership and evidence separately from this current union.

## R1 exit publication candidate

The exact R1 exit candidate is `@muxui/react@0.1.0-rc.1`, for the `next`
dist-tag on the npm registry. The candidate contains only the standalone
`web.react` renderer and its internal runtime dependencies. All current
Mux UI-owned component exports remain experimental; no stable, secondary-renderer,
or cross-platform support claim is made. Publication, dist-tag mutation, and
post-publication verification are separate authorized operations.

## Local tarball usage

Install the versioned local candidate from the package directory:

```sh
pnpm add ./muxui-react-0.1.0-alpha.0.tgz
```

Import the generated MuxUI styles once, then use the React exports:

```tsx
import '@muxui/react/styles.css';
import { Button } from '@muxui/react';

export function Example() {
  return <Button onActivate={() => {}}>Save</Button>;
}
```

The renderer owns the MuxUI selectors, tokens, accessibility behavior, lifecycle, and public prop names. React Aria Components is an internal implementation substrate; this package does not transfer its APIs or styling boundary.

Responsive dimension recipes are opt-in. Add `data-muxui-responsive` to a theme scope after importing `styles.css` to activate the canonical viewport-based values for that scope; the default `:root` values remain static.

Supporting runtime exports: `ToastProvider` and `useToast` are available alongside `Toast` for managed notifications.

| Export | Lifecycle | Module | Selector | Public props |
| --- | --- | --- | --- | --- |
| AlertDialog | experimental | . | .muxui-alert-dialog | open, defaultOpen, onOpenChange, disabled, onActivate |
| Autocomplete | experimental | . | .muxui-autocomplete | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, name, items, placeholder |
| Breadcrumbs | experimental | . | .muxui-breadcrumbs | items, aria-label |
| Button | experimental | . | .muxui-button | disabled, pending, showTextWhileLoading, variant, tone, size |
| ButtonGroup | experimental | . | .muxui-button-group | orientation, attached, disabled, aria-label, aria-labelledby |
| Calendar | experimental | . | .muxui-calendar | label, aria-label, aria-labelledby, value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, disabled, readOnly, required, invalid |
| Card | experimental | . | .muxui-card | variant, padding, selected, pending, disabled, onActivate |
| Checkbox | experimental | . | .muxui-checkbox | checked, defaultChecked, disabled, size, indeterminate, name, required, value, invalid |
| CheckboxField | experimental | . | .muxui-checkbox-field | checked, defaultChecked, indeterminate, name, value, size, disabled, invalid, required, readOnly, onChange |
| CheckboxGroup | experimental | . | .muxui-checkbox-group | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name, orientation, size |
| ColorArea | experimental | . | .muxui-color-area | label, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly |
| ColorField | experimental | . | .muxui-color-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name |
| ColorModeToggle | experimental | . | .muxui-color-mode-toggle | mode, defaultMode, storageKey, disabled, onModeChange |
| ColorPicker | experimental | . | .muxui-color-picker | value, defaultValue, disabled, readOnly, children |
| ColorSlider | experimental | . | .muxui-color-slider | label, aria-label, aria-labelledby, value, defaultValue, channel, colorSpace, disabled, readOnly, orientation |
| ColorSwatch | experimental | . | .muxui-color-swatch | color, disabled |
| ColorSwatchPicker | experimental | . | .muxui-color-swatch-picker | aria-label, aria-labelledby, items, value, defaultValue, disabled, readOnly |
| ColorWheel | experimental | . | .muxui-color-wheel | aria-label, aria-labelledby, value, defaultValue, outerRadius, innerRadius, readOnly, disabled |
| ComboBox | experimental | . | .muxui-combo-box | label, description, errorMessage, aria-label, aria-labelledby, items, value, defaultValue, selectedId, defaultSelectedId, disabled, readOnly, required, invalid, name, placeholder |
| CommandPalette | experimental | . | .muxui-command-palette | open, defaultOpen, onOpenChange, size, closeOnSelect, dismissable, disabled, id, title, description, href, onActivate |
| DateField | experimental | . | .muxui-date-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, disabled, readOnly, required, invalid, name |
| DatePicker | experimental | . | .muxui-date-picker | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, open, defaultOpen, disabled, readOnly, required, invalid, name |
| DateRangePicker | experimental | . | .muxui-date-range-picker | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, open, defaultOpen, disabled, readOnly, required, invalid, startName, endName |
| Dialog | experimental | . | .muxui-dialog | children, title, open, defaultOpen, dismissable, trigger, onOpenChange, className, aria-label, aria-labelledby |
| Disclosure | experimental | . | .muxui-disclosure | expanded, defaultExpanded, disabled, id |
| DisclosureGroup | experimental | . | .muxui-disclosure-group | expandedIds, defaultExpandedIds, multiple, disabled |
| DropZone | experimental | . | .muxui-drop-zone | children, disabled, onDrop, onActivate, className, aria-label, aria-labelledby |
| FileTrigger | experimental | . | .muxui-file-trigger | children, acceptedFileTypes, allowsMultiple, acceptDirectory, defaultCamera, disabled, onSelect, className |
| Form | experimental | . | .muxui-form | validationBehavior, validationErrors, method, action, onSubmit, onReset |
| GridList | experimental | . | .muxui-grid-list | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, disabled, selectionMode |
| Group | experimental | . | .muxui-group | disabled, invalid, readOnly, role, aria-label |
| HeaderNav | experimental | . | .muxui-header-nav | href, current, aria-label |
| Input | experimental | . | .muxui-input | value, defaultValue, onChange, type, placeholder, disabled, invalid, required, readOnly, size |
| InputTags | experimental | . | .muxui-input-tags | tagPlacement, size, placeholder, value, defaultValue, label, description, errorMessage, allowDuplicates, maxTags, validate, disabled, invalid, required, onChange, onTagAdded, onTagRemoved |
| Lightbox | experimental | . | .muxui-lightbox | items, selectedKey, defaultSelectedKey, open, defaultOpen, loop, swipeNavigation |
| Link | experimental | . | .muxui-link | href, disabled, current, target, rel |
| ListBox | experimental | . | .muxui-list-box | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, disabled, selectionMode |
| Markdown | experimental | ./markdown | .muxui-markdown | source, baseUrl, invalidFallback |
| Menu | experimental | . | .muxui-menu | aria-label, aria-labelledby, items, disabled, shouldCloseOnSelect |
| Meter | experimental | . | .muxui-meter | value, minValue, maxValue, label, formatOptions |
| MultiSelect | experimental | . | .muxui-multi-select | items, size, selectedKeys, defaultSelectedKeys, onSelectionChange, label, placeholder, description, errorMessage, supportingText, showSearch, showFooter, emptyStateTitle, emptyStateDescription, onReset, onSelectAll, selectedCountFormatter, disabled, invalid, required |
| NumberField | experimental | . | .muxui-number-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, minValue, maxValue, step, name, formatOptions |
| PaymentInput | experimental | . | .muxui-payment-input | value, defaultValue, disabled, invalid, required, readOnly, onChange |
| Popover | experimental | . | .muxui-popover | children, trigger, open, defaultOpen, dismissable, placement, offset, crossOffset, shouldFlip, containerPadding, onOpenChange, className, aria-label, aria-labelledby |
| PreviewTrigger | experimental | . | .muxui-preview-trigger | children, trigger, delay, closeDelay, open, defaultOpen, disabled, placement, offset, crossOffset, shouldFlip, containerPadding, onOpenChange, className, aria-label, aria-labelledby |
| ProgressBar | experimental | . | .muxui-progress-bar | value, minValue, maxValue, label |
| ProgressCircle | experimental | . | .muxui-progress-circle | value, minValue, maxValue, size, label |
| RadioField | experimental | . | .muxui-radio-field | size, disabled, invalid, required, readOnly, value |
| RadioGroup | experimental | . | .muxui-radio-group | label, aria-label, aria-labelledby, options, children, value, defaultValue, disabled, readOnly, required, invalid, orientation, size |
| RangeCalendar | experimental | . | .muxui-range-calendar | label, aria-label, aria-labelledby, value, defaultValue, focusedValue, unavailableDateMatcher, minValue, maxValue, disabled, readOnly, required, invalid |
| Resizable | experimental | . | .muxui-resizable | sizes, defaultSizes, orientation, disabled, readOnly |
| SearchField | experimental | . | .muxui-search-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name, placeholder |
| Select | experimental | . | .muxui-select | label, description, errorMessage, aria-label, aria-labelledby, items, value, defaultValue, open, defaultOpen, disabled, readOnly, required, invalid, name, placeholder |
| Separator | experimental | . | .muxui-separator | orientation |
| Sidebar | experimental | . | .muxui-sidebar | hideBorder, href, current, external, items, badge, icon, placeholder, value, onChange, name, email, avatarSrc, status, onDismiss |
| Slider | experimental | . | .muxui-slider | label, aria-label, aria-labelledby, value, defaultValue, min, max, step, disabled, readOnly, orientation |
| Switch | experimental | . | .muxui-switch | label, description, errorMessage, aria-label, aria-labelledby, selected, defaultSelected, disabled, readOnly, required, invalid, name, value |
| SwitchField | experimental | . | .muxui-switch-field | checked, defaultChecked, name, value, disabled, invalid, required, readOnly, onChange |
| Table | experimental | . | .muxui-table | aria-label, columns, rows, selectedIds, defaultSelectedIds, sortDescriptor, disabled, selectionMode |
| Tabs | experimental | . | .muxui-tabs | aria-label, aria-labelledby, items, value, defaultValue, keyboardActivation, disabled, orientation |
| TagGroup | experimental | . | .muxui-tag-group | label, aria-label, aria-labelledby, items, disabled |
| TagSelect | experimental | . | .muxui-tag-select | items, size, selectedKeys, defaultSelectedKeys, getItemLabel, label, placeholder, description, errorMessage, disabled, invalid, required, onSelectionChange |
| TextArea | experimental | . | .muxui-text-area | value, defaultValue, rows, maxLength, placeholder, disabled, invalid, required, readOnly, size |
| TextEditor | experimental | ./text-editor | .muxui-text-editor | value, defaultValue, label, description, errorMessage, disabled, readOnly, required, invalid, placeholder, limit, toolbar, floating, onGenerate, onLinkRequest, onImageRequest, onColorRequest, bubbleMenu |
| TextField | experimental | . | .muxui-text-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name, placeholder, type, autoComplete, autoFocus, inputMode, maxLength, minLength, pattern, spellCheck |
| TimeField | experimental | . | .muxui-time-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, disabled, readOnly, required, invalid, name |
| Toast | experimental | . | .muxui-toast | message, title, variant, duration, onDismiss, className |
| ToggleButton | experimental | . | .muxui-toggle-button | selected, defaultSelected, disabled, size |
| ToggleButtonGroup | experimental | . | .muxui-toggle-button-group | aria-label, aria-labelledby, selectedIds, defaultSelectedIds, selectionMode, disabled, orientation, disallowEmptySelection, size |
| TokenField | experimental | . | .muxui-token-field | label, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, name, placeholder |
| Toolbar | experimental | . | .muxui-toolbar | aria-label, aria-labelledby, orientation |
| Tooltip | experimental | . | .muxui-tooltip | content, trigger, delay, closeDelay, placement, offset, crossOffset, shouldFlip, containerPadding, open, defaultOpen, disabled, onOpenChange, className |
| Tree | experimental | . | .muxui-tree | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, disabled, selectionMode |
| Virtualizer | experimental | . | .muxui-virtualizer | aria-label, items, height, itemHeight, overscan, disabled |
