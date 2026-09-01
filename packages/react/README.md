<!-- @generated-from: packages/react/src/generate.mjs -->
<!-- @generated-content-sha256: sha256:0621a78914b4c50a6b0fba7c8ef753cc7af4d97bc15cc132c8fd62114898d896 -->
# @muxui/react

R1.5 React breadth closure for the standalone Mux UI renderer.

- The 53 Mux UI-owned family exports are listed below for the `web.react` binding.
- React Aria Components 1.20.0 is an internal replaceable substrate.
- MuxUI owns the public APIs, tokens, selectors, styling, accessibility behavior, lifecycle, and prop names.
- Tale UI is a pinned styling donor; generated styling results are Mux UI-owned and Tale UI is not a dependency.

## R1 exit publication candidate

The exact R1 exit candidate is `@muxui/react@0.1.0-rc.1`, for the `next`
dist-tag on the npm registry. The candidate contains only the standalone
`web.react` renderer and its three internal runtime dependencies. All 53
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

Supporting runtime exports: `ToastProvider` and `useToast` are available alongside `Toast` for managed notifications.

| Export | Lifecycle | Selector | Public props |
| --- | --- | --- | --- |
| Button | experimental | .muxui-button | disabled, pending |
| Breadcrumbs | experimental | .muxui-breadcrumbs | items, aria-label |
| Checkbox | experimental | .muxui-checkbox | checked, defaultChecked, disabled, indeterminate, name, required, value, invalid |
| Disclosure | experimental | .muxui-disclosure | expanded, defaultExpanded, disabled, id |
| DisclosureGroup | experimental | .muxui-disclosure-group | expandedIds, defaultExpandedIds, multiple, disabled |
| Group | experimental | .muxui-group | disabled, invalid, readOnly, role, aria-label |
| Link | experimental | .muxui-link | href, disabled, current, target, rel |
| Meter | experimental | .muxui-meter | value, minValue, maxValue, label, formatOptions |
| ProgressBar | experimental | .muxui-progress-bar | value, minValue, maxValue, label |
| Separator | experimental | .muxui-separator | orientation |
| ToggleButton | experimental | .muxui-toggle-button | selected, defaultSelected, disabled |
| Autocomplete | experimental | .muxui-autocomplete | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name, items, placeholder |
| CheckboxGroup | experimental | .muxui-checkbox-group | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name |
| DateField | experimental | .muxui-date-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, disabled, readOnly, required, invalid, name |
| DatePicker | experimental | .muxui-date-picker | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, open, defaultOpen, disabled, readOnly, required, invalid, name |
| DateRangePicker | experimental | .muxui-date-range-picker | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, open, defaultOpen, disabled, readOnly, required, invalid, startName, endName |
| Form | experimental | .muxui-form | validationBehavior, validationErrors, method, action, onSubmit, onReset |
| NumberField | experimental | .muxui-number-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, minValue, maxValue, step, name, formatOptions |
| SearchField | experimental | .muxui-search-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name, placeholder |
| Switch | experimental | .muxui-switch | label, description, errorMessage, aria-label, aria-labelledby, selected, defaultSelected, disabled, readOnly, required, invalid, name, value |
| TextField | experimental | .muxui-text-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name, placeholder, type, autoComplete, autoFocus, inputMode, maxLength, minLength, pattern, spellCheck |
| TimeField | experimental | .muxui-time-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, disabled, readOnly, required, invalid, name |
| Calendar | experimental | .muxui-calendar | label, aria-label, aria-labelledby, value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, disabled, readOnly, required, invalid |
| ColorArea | experimental | .muxui-color-area | label, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly |
| ColorField | experimental | .muxui-color-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name |
| ColorPicker | experimental | .muxui-color-picker | value, defaultValue, disabled, readOnly, children |
| ColorSlider | experimental | .muxui-color-slider | label, aria-label, aria-labelledby, value, defaultValue, channel, colorSpace, disabled, readOnly, orientation |
| ColorSwatch | experimental | .muxui-color-swatch | color, disabled |
| ColorSwatchPicker | experimental | .muxui-color-swatch-picker | aria-label, aria-labelledby, items, value, defaultValue, disabled, readOnly |
| ColorWheel | experimental | .muxui-color-wheel | aria-label, aria-labelledby, value, defaultValue, outerRadius, innerRadius, readOnly, disabled |
| ComboBox | experimental | .muxui-combo-box | label, description, errorMessage, aria-label, aria-labelledby, items, value, defaultValue, selectedId, defaultSelectedId, disabled, readOnly, required, invalid, name, placeholder |
| GridList | experimental | .muxui-grid-list | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, disabled, selectionMode |
| ListBox | experimental | .muxui-list-box | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, disabled, selectionMode |
| Menu | experimental | .muxui-menu | aria-label, aria-labelledby, items, disabled, shouldCloseOnSelect |
| RadioGroup | experimental | .muxui-radio-group | label, aria-label, aria-labelledby, options, value, defaultValue, disabled, readOnly, required, invalid, orientation |
| RangeCalendar | experimental | .muxui-range-calendar | label, aria-label, aria-labelledby, value, defaultValue, focusedValue, unavailableDateMatcher, minValue, maxValue, disabled, readOnly, required, invalid |
| Select | experimental | .muxui-select | label, description, errorMessage, aria-label, aria-labelledby, items, value, defaultValue, open, defaultOpen, disabled, readOnly, required, invalid, name, placeholder |
| Slider | experimental | .muxui-slider | label, aria-label, aria-labelledby, value, defaultValue, min, max, step, disabled, readOnly, orientation |
| Table | experimental | .muxui-table | aria-label, columns, rows, selectedIds, defaultSelectedIds, sortDescriptor, disabled, selectionMode |
| Tabs | experimental | .muxui-tabs | aria-label, aria-labelledby, items, value, defaultValue, keyboardActivation, disabled, orientation |
| TagGroup | experimental | .muxui-tag-group | label, aria-label, aria-labelledby, items, disabled |
| ToggleButtonGroup | experimental | .muxui-toggle-button-group | aria-label, aria-labelledby, selectedIds, defaultSelectedIds, selectionMode, disabled, orientation |
| TokenField | experimental | .muxui-token-field | label, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, name, placeholder |
| Toolbar | experimental | .muxui-toolbar | aria-label, aria-labelledby, orientation |
| Tree | experimental | .muxui-tree | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, disabled, selectionMode |
| Virtualizer | experimental | .muxui-virtualizer | aria-label, items, height, itemHeight, overscan, disabled |
| DropZone | experimental | .muxui-drop-zone | children, disabled, onDrop, onActivate, className, aria-label, aria-labelledby |
| FileTrigger | experimental | .muxui-file-trigger | children, acceptedFileTypes, allowsMultiple, acceptDirectory, defaultCamera, disabled, onSelect, className |
| Dialog | experimental | .muxui-dialog | children, title, open, defaultOpen, dismissable, trigger, onOpenChange, className, aria-label, aria-labelledby |
| Popover | experimental | .muxui-popover | children, trigger, open, defaultOpen, dismissable, placement, offset, crossOffset, shouldFlip, containerPadding, onOpenChange, className, aria-label, aria-labelledby |
| PreviewTrigger | experimental | .muxui-preview-trigger | children, trigger, delay, closeDelay, open, defaultOpen, disabled, placement, offset, crossOffset, shouldFlip, containerPadding, onOpenChange, className, aria-label, aria-labelledby |
| Toast | experimental | .muxui-toast | message, title, variant, duration, onDismiss, className |
| Tooltip | experimental | .muxui-tooltip | content, trigger, delay, closeDelay, placement, offset, crossOffset, shouldFlip, containerPadding, open, defaultOpen, disabled, onOpenChange, className |
