<!-- @generated-from: packages/react/src/generate.mjs -->
<!-- @generated-content-sha256: sha256:208d0bd4722e9a607b24b3666a9f60f567af5186b89bd207547de8adb20b823e -->
# @muxui/react

R1.6 current React union for the standalone Mux UI renderer.

- The current union contains Mux UI-owned family exports, including root exports and isolated subpaths.
- React Aria Components 1.20.0 is an internal replaceable substrate.
- MuxUI owns the public APIs, tokens, selectors, styling, accessibility behavior, lifecycle, and prop names.
- The R1.5 closure retains its fixed family membership separately from this current union.

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

Component styles consume semantic roles from `catalog/tokens/default-theme.json`: gaps, content insets, outer spacing, viewport clearance, surfaces, borders, typography, shapes, and motion are independently themeable. Explicit per-mode palette painting uses non-inverting semantic palette aliases so dark styles are not inverted twice. Choose tokens by their documented meaning, not because their default values happen to match.

Structural CSS remains literal where it expresses geometry rather than a theme choice: zero/reset values, percentages and intrinsic sizing, border overlaps, visually hidden accessibility patterns, calendar grids, and text-segment alignment. The styling-token tests cover all authored component stylesheets; the browser check verifies gap/inset override isolation.

Supporting runtime exports: `ToastProvider` and `useToast` are available alongside `Toast` for managed notifications.

| Export | Lifecycle | Module | Selector | Public props |
| --- | --- | --- | --- | --- |
| AlertDialog | experimental | . | .muxui-alert-dialog | open, defaultOpen, onOpenChange, disabled, onActivate |
| Autocomplete | experimental | . | .muxui-autocomplete | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, name, items, placeholder |
| Avatar | experimental | . | .muxui-avatar | size, src, srcSet, alt, children |
| Breadcrumbs | experimental | . | .muxui-breadcrumbs | items, aria-label |
| Button | experimental | . | .muxui-button | disabled, pending, showTextWhileLoading, variant, size |
| ButtonGroup | experimental | . | .muxui-button-group | orientation, attached, disabled, aria-label, aria-labelledby |
| Calendar | experimental | . | .muxui-calendar | label, aria-label, aria-labelledby, value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, disabled, readOnly, required, invalid |
| Card | experimental | . | .muxui-card | variant, padding, selected, pending, disabled, onActivate |
| Checkbox | experimental | . | .muxui-checkbox | checked, defaultChecked, disabled, size, indeterminate, name, required, value, invalid |
| CheckboxField | experimental | . | .muxui-checkbox-field | checked, defaultChecked, indeterminate, name, value, size, disabled, invalid, required, readOnly, onChange |
| CheckboxGroup | experimental | . | .muxui-checkbox-group | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, required, invalid, name, orientation, size |
| ColorArea | experimental | . | .muxui-color-area | label, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly |
| ColorField | experimental | . | .muxui-color-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, name |
| ColorModeToggle | experimental | . | .muxui-color-mode-toggle | mode, defaultMode, storageKey, disabled, onModeChange |
| ColorPicker | experimental | . | .muxui-color-picker | value, defaultValue, disabled, readOnly, children |
| ColorSlider | experimental | . | .muxui-color-slider | label, aria-label, aria-labelledby, value, defaultValue, channel, colorSpace, disabled, readOnly, orientation |
| ColorSwatch | experimental | . | .muxui-color-swatch | color, disabled |
| ColorSwatchPicker | experimental | . | .muxui-color-swatch-picker | aria-label, aria-labelledby, items, value, defaultValue, disabled, readOnly |
| ColorWheel | experimental | . | .muxui-color-wheel | aria-label, aria-labelledby, value, defaultValue, outerRadius, innerRadius, readOnly, disabled |
| ComboBox | experimental | . | .muxui-combo-box | label, description, errorMessage, aria-label, aria-labelledby, items, value, defaultValue, selectedId, defaultSelectedId, disabled, size, readOnly, required, invalid, name, placeholder |
| CommandPalette | experimental | . | .muxui-command-palette | open, defaultOpen, onOpenChange, size, closeOnSelect, dismissable, disabled, id, title, description, href, onActivate |
| DateField | experimental | . | .muxui-date-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, disabled, size, readOnly, required, invalid, name |
| DatePicker | experimental | . | .muxui-date-picker | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, open, defaultOpen, disabled, size, readOnly, required, invalid, name |
| DateRangePicker | experimental | . | .muxui-date-range-picker | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, open, defaultOpen, disabled, size, readOnly, required, invalid, startName, endName |
| Dialog | experimental | . | .muxui-dialog | children, title, description, actions, open, defaultOpen, dismissable, trigger, onOpenChange, className, backdropClassName, panelClassName, titleClassName, descriptionClassName, contentClassName, actionsClassName, closeClassName, aria-label, aria-labelledby, aria-describedby |
| Disclosure | experimental | . | .muxui-disclosure | expanded, defaultExpanded, disabled, id |
| DisclosureGroup | experimental | . | .muxui-disclosure-group | expandedIds, defaultExpandedIds, multiple, disabled |
| DropZone | experimental | . | .muxui-drop-zone | children, disabled, onDrop, onActivate, className, aria-label, aria-labelledby |
| FileTrigger | experimental | . | .muxui-file-trigger | children, acceptedFileTypes, allowsMultiple, acceptDirectory, defaultCamera, disabled, onSelect, className |
| Form | experimental | . | .muxui-form | validationBehavior, validationErrors, method, action, onSubmit, onReset |
| GridList | experimental | . | .muxui-grid-list | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, disabled, selectionMode |
| Group | experimental | . | .muxui-group | disabled, invalid, readOnly, role, aria-label |
| HeaderNav | experimental | . | .muxui-header-nav | href, current, aria-label |
| IconButton | experimental | . | .muxui-icon-button | aria-label, aria-labelledby, disabled, pending, variant, size |
| Image | experimental | . | .muxui-image | src, srcSet, sizes, alt, width, height, loading, decoding, fallbackSrc, fallbackSrcSet, radius, fit |
| Input | experimental | . | .muxui-input | value, defaultValue, onChange, type, placeholder, disabled, invalid, required, readOnly, size |
| InputTags | experimental | . | .muxui-input-tags | tagPlacement, size, placeholder, value, defaultValue, label, description, errorMessage, allowDuplicates, maxTags, validate, disabled, invalid, required, onChange, onTagAdded, onTagRemoved |
| Lightbox | experimental | . | .muxui-lightbox | items, selectedKey, defaultSelectedKey, open, defaultOpen, loop, swipeNavigation |
| Link | experimental | . | .muxui-link | href, disabled, current, target, rel |
| ListBox | experimental | . | .muxui-list-box | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, disabled, selectionMode, children, layout, orientation, style |
| Markdown | experimental | ./markdown | .muxui-markdown | source, baseUrl, invalidFallback |
| Menu | experimental | . | .muxui-menu | aria-label, aria-labelledby, items, disabled, shouldCloseOnSelect, children, open, defaultOpen, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, delay |
| Meter | experimental | . | .muxui-meter | value, minValue, maxValue, label, formatOptions |
| MultiSelect | experimental | . | .muxui-multi-select | items, size, selectedKeys, defaultSelectedKeys, onSelectionChange, label, placeholder, description, errorMessage, supportingText, showSearch, showFooter, emptyStateTitle, emptyStateDescription, onReset, onSelectAll, selectedCountFormatter, disabled, invalid, required |
| NumberField | experimental | . | .muxui-number-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, minValue, maxValue, step, name, formatOptions |
| PaymentInput | experimental | . | .muxui-payment-input | value, defaultValue, disabled, size, invalid, required, readOnly, onChange |
| Popover | experimental | . | .muxui-popover | children, trigger, open, defaultOpen, dismissable, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, onOpenChange, className, aria-label, aria-labelledby |
| PreviewTrigger | experimental | . | .muxui-preview-trigger | children, trigger, delay, closeDelay, open, defaultOpen, disabled, placement, offset, crossOffset, shouldFlip, containerPadding, onOpenChange, className, aria-label, aria-labelledby |
| ProgressBar | experimental | . | .muxui-progress-bar | value, minValue, maxValue, label |
| ProgressCircle | experimental | . | .muxui-progress-circle | value, minValue, maxValue, size, label |
| RadioField | experimental | . | .muxui-radio-field | size, disabled, invalid, required, readOnly, value |
| RadioGroup | experimental | . | .muxui-radio-group | label, aria-label, aria-labelledby, options, children, value, defaultValue, disabled, readOnly, required, invalid, orientation, size |
| RangeCalendar | experimental | . | .muxui-range-calendar | label, aria-label, aria-labelledby, value, defaultValue, focusedValue, unavailableDateMatcher, minValue, maxValue, disabled, readOnly, required, invalid |
| Resizable | experimental | . | .muxui-resizable | sizes, defaultSizes, orientation, disabled, readOnly |
| SearchField | experimental | . | .muxui-search-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, name, placeholder, id, inputRef, inputProps |
| Select | experimental | . | .muxui-select | label, description, errorMessage, aria-label, aria-labelledby, items, value, defaultValue, open, defaultOpen, disabled, size, readOnly, required, invalid, name, placeholder, children, selectedContent, trigger, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal |
| SelectNative | experimental | . | .muxui-select-native | label, description, errorMessage, aria-label, aria-labelledby, aria-describedby, id, value, defaultValue, onChange, name, form, autoComplete, disabled, required, invalid, multiple, size, children |
| Separator | experimental | . | .muxui-separator | orientation |
| Sidebar | experimental | . | .muxui-sidebar | hideBorder, href, current, external, items, badge, icon, placeholder, value, onChange, name, email, avatarSrc, status, onDismiss |
| Slider | experimental | . | .muxui-slider | label, aria-label, aria-labelledby, value, defaultValue, min, max, step, disabled, readOnly, orientation |
| Switch | experimental | . | .muxui-switch | label, description, errorMessage, aria-label, aria-labelledby, selected, defaultSelected, disabled, size, readOnly, required, invalid, name, value |
| SwitchField | experimental | . | .muxui-switch-field | checked, defaultChecked, name, value, size, disabled, invalid, required, readOnly, onChange |
| Table | experimental | . | .muxui-table | aria-label, columns, rows, selectedIds, defaultSelectedIds, sortDescriptor, disabled, selectionMode |
| Tabs | experimental | . | .muxui-tabs | aria-label, aria-labelledby, items, value, defaultValue, keyboardActivation, disabled, size, orientation |
| TagGroup | experimental | . | .muxui-tag-group | label, aria-label, aria-labelledby, items, disabled |
| TagSelect | experimental | . | .muxui-tag-select | items, size, selectedKeys, defaultSelectedKeys, getItemLabel, label, placeholder, description, errorMessage, disabled, invalid, required, onSelectionChange |
| Text | experimental | . | .muxui-text | variant, size, color, as, truncate |
| TextArea | experimental | . | .muxui-text-area | value, defaultValue, rows, maxLength, placeholder, disabled, invalid, required, readOnly, size |
| TextEditor | experimental | ./text-editor | .muxui-text-editor | value, defaultValue, label, description, errorMessage, disabled, readOnly, required, invalid, placeholder, limit, toolbar, floating, onGenerate, onLinkRequest, onImageRequest, onColorRequest, bubbleMenu |
| TextField | experimental | . | .muxui-text-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, name, placeholder, type, autoComplete, autoFocus, inputMode, maxLength, minLength, pattern, spellCheck, id, inputRef, inputProps |
| TimeField | experimental | . | .muxui-time-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, disabled, size, readOnly, required, invalid, name |
| Toast | experimental | . | .muxui-toast | message, title, variant, duration, onDismiss, className |
| ToggleButton | experimental | . | .muxui-toggle-button | selected, defaultSelected, disabled, size |
| ToggleButtonGroup | experimental | . | .muxui-toggle-button-group | aria-label, aria-labelledby, selectedIds, defaultSelectedIds, selectionMode, disabled, orientation, disallowEmptySelection, size |
| TokenField | experimental | . | .muxui-token-field | label, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, name, placeholder |
| Toolbar | experimental | . | .muxui-toolbar | aria-label, aria-labelledby, orientation |
| Tooltip | experimental | . | .muxui-tooltip | content, trigger, delay, closeDelay, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, open, defaultOpen, disabled, onOpenChange, className |
| Tree | experimental | . | .muxui-tree | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, disabled, selectionMode |
| Virtualizer | experimental | . | .muxui-virtualizer | aria-label, items, height, itemHeight, overscan, disabled |

## Composition and native input contracts

These contracts are projected from the component bindings in the canonical catalog.

### Menu

- Existing Menu items render a named action list. Menu.Root, Trigger, Popup, List, Item, Submenu, Section, Header, and Separator compose a triggered or nested menu without upstream imports.
- Menu.Root supports open, defaultOpen, and onOpenChange. Root disabled state disables its trigger and all items; a child disabled=false cannot enable a disabled ancestor.
- Arrow keys and typeahead navigate enabled items. Submenus open after the configured hover delay or the direction-aware forward arrow; the backward arrow returns to the parent item. Escape or selection closes the menu and restores trigger focus.
- Menu.Submenu accepts exactly a Menu.Item trigger and a Menu.Popup as its two children. It has no DOM host, className, or ref; style its item using .muxui-menu-item[data-has-submenu] and [data-open].
- Items require stable string IDs. Supply textValue for rich content. A per-item onAction runs before list and root onAction/onSelect. Data-backed actions preserve normalized item metadata; compound actions return identity fields id, key, and value.
- Menu.Popup accepts placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, and modal. Placement uses top, bottom, start, end, or a logical alignment such as bottom-start or end-top. Geometry numbers must be finite, containerPadding and delay must be nonnegative. Nested popup placement defaults to end-top.
- For context coordinates, position a consumer-owned element at the desired point and pass its element ref as anchorRef while controlling Menu.Root open. modal=false allows outside content to remain accessible.
- Mux selectors are .muxui-menu-root, .muxui-menu-trigger, .muxui-menu-popup, .muxui-menu-list, .muxui-menu-item, .muxui-menu-section, .muxui-menu-section-header, and .muxui-menu-separator. Item states use data-disabled, data-focused, data-focus-visible, data-has-submenu, and data-open. Root uses data-open and data-disabled.
- Trigger refs target native buttons and preserve native handlers. Root, Popup, List, and Item refs target divs; Section and Header refs target section/header elements; Separator refs target an hr.

Public parts: `root`, `trigger`, `popup`, `list`, `item`, `section`, `header`, `separator`.

### ListBox

- Existing items and controlled or uncontrolled Mux string selections remain supported. ListBox.Root aliases ListBox; Section, Header, and Item compose static collections.
- Items require stable string IDs. Supply textValue for rich children so typeahead has an unambiguous text value. Sections are named by Header or title, or by aria-label when no visible header is present.
- layout=stack navigates along the orientation. layout=grid uses actual item positions for two-dimensional arrow navigation; consumer CSS or style determines the columns and dimensions. Orientation is vertical by default.
- Root disabled state disables every compound item and suppresses selection/action callbacks. A child disabled=false cannot re-enable an item under a disabled root.
- Data-backed onAction returns the normalized item. Compound onAction returns identity fields id, key, and value; onSelectionChange always returns Mux string IDs or all.
- Mux selectors are .muxui-list-box, .muxui-list-box-section, .muxui-list-box-section-header, and .muxui-list-box-item. Root states include data-layout, data-orientation, data-disabled, and data-focus-visible; items expose data-selected, data-disabled, data-focused, and data-focus-visible.
- Root and Item refs target divs; Section and Header refs target section/header elements.

Public parts: `root`, `section`, `header`, `item`.

### Select

- Existing named Select items, form submission, sizes, controlled or uncontrolled string values, and open state remain supported. Interactive control sizes use shared sm, md, and lg targets; md is the default.
- Select.Root, Label, Trigger, Value, Popup, List, Item, Description, and Error compose the same control. Supply label, aria-label, or aria-labelledby on the root, or include a nonempty Select.Label directly, in a fragment, or in native wrappers. Root label/description/errorMessage props also render with compound children.
- The simple trigger prop accepts a native button element and preserves its native ref, attributes, and handlers. Select.Trigger also owns a native button. Use Select.Value inside a custom trigger to retain selected-value accessibility.
- selectedContent customizes the simple default trigger value. Select.Value children customize compound selected content; its default renders the selected item children. Item IDs and textValue remain Mux strings and raw upstream render props/state objects are not public.
- Arrow keys open and navigate the list. Selection and Escape close it and restore trigger focus. Root disabled state cannot be overridden by child disabled=false; readOnly preserves the value and suppresses onChange.
- Popup geometry uses finite offset/crossOffset, nonnegative finite containerPadding, and logical placement such as bottom-start or end-top. Existing bottom-start and 8px defaults are preserved. Popup-specific props override root geometry; anchorRef positions against a consumer-owned element, and modal=false keeps outside content accessible.
- Mux selectors are .muxui-select, .muxui-select-label, .muxui-select-trigger, .muxui-select-value, .muxui-select-popover, .muxui-select-list, .muxui-select-option, .muxui-select-description, and .muxui-select-error. Root states include data-open, data-disabled, data-readonly, and data-invalid; options expose data-selected, data-disabled, data-focused, and data-focus-visible.
- Root, Popup, List, and Item refs target divs; Trigger targets a button; Label, Value, Description, and Error target spans. Error renders only while invalid.

Public parts: `root`, `label`, `trigger`, `value`, `popup`, `list`, `option`, `description`, `error`.

### TextField

- Controlled and uncontrolled values are supported.
- Keyboard input preserves the native accessible interaction model.
- Standard native input attributes are applied to the input part.
- Interactive control sizes use the shared sm, md, and lg targets; md is the default.
- The forwarded ref resolves to the outer div; inputRef resolves to the native HTMLInputElement for focus and selection.
- inputProps accepts native input keyboard, paste, focus, blur, selection, composition, and styling props; its className merges with the Mux input class.
- Root id, value, defaultValue, onChange, name, type, accessible name, validation, disabled, readOnly, and required remain authoritative; inputProps cannot replace them. Root native input attributes take precedence when supplied.

Public parts: `root`, `label`, `input`, `description`, `error`.

### SearchField

- Controlled and uncontrolled values are supported.
- Keyboard input preserves the native accessible interaction model.
- Empty and filled values expose the existing RAC-backed data-empty binding hook.
- Interactive control sizes use the shared sm, md, and lg targets; md is the default.
- The forwarded ref resolves to the outer div; inputRef resolves to the native HTMLInputElement for focus and selection.
- inputProps accepts native input keyboard, paste, focus, blur, selection, composition, and styling props; its className merges with the Mux input class.
- Root id, value, defaultValue, onChange, name, type, accessible name, validation, disabled, readOnly, and required remain authoritative; inputProps cannot replace them. Root native input attributes take precedence when supplied.

Public parts: `root`, `label`, `input`, `clear`, `description`, `error`.

### CommandPalette

- Search and collection navigation preserve React Aria keyboard semantics.
- Escape closes the modal and closeOnSelect controls item activation dismissal.
- Input owns native value, defaultValue, onChange, keyboard, paste, composition, and selection handlers; its ref resolves to HTMLInputElement for focus and cursor restoration.
- Applications control the query on Input and supply filtered or asynchronous Item results to ListBox; Content does not own a search engine or an inputValue prop.
- Applications may compose loading content, Empty, Footer, and custom Item content. Enter during IME composition or cancelled by Input onKeyDown does not activate a command; Input defaults autoFocus to true when the palette opens.

Public parts: `root`, `trigger`, `backdrop`, `popup`, `title`, `description`, `close`, `content`, `search-field`, `input`, `clear-button`, `listbox`, `section`, `section-header`, `item`, `separator`, `item-icon`, `item-content`, `item-title`, `item-description`, `item-meta`, `shortcut`, `load-more-item`, `empty`, `footer`, `chips`, `chip`, `chip-remove`.

### Popover

- Delegate portal mounting, anchor positioning, outside-content exclusion, focus restoration, and topmost dismissal to RAC Popover; use a stable React Aria FocusScope for optional modal focus containment.
- Require a focusable trigger and toggle controlled or uncontrolled state through RAC DialogTrigger.
- Support logical placements top, bottom, start, end, top-start, top-end, bottom-start, bottom-end, start-top, start-bottom, end-top, and end-bottom; resolve start and end through the current locale direction.
- Validate finite offset and crossOffset, boolean shouldFlip, and nonnegative finite containerPadding while retaining existing geometry defaults.
- Optionally position relative to an existing DOM element through anchorRef while keeping the required trigger responsible for opening and accessibility relationships.
- Use modal false for non-blocking content without focus containment, outside-content exclusion, or scroll locking; modal remains true by default.
- Preserve muxui-popover-positioner and muxui-popover selectors, data-placement and transition states; expose data-modal on the positioner for consumer styling.
- Changing modal while open retains the existing content, uncontrolled values, and child state; entering modal mode focuses the dialog surface when focus is outside it.

Public parts: `trigger`, `root`, `content`.

### Tooltip

- Delegate hover and focus timing, global one-tooltip sequencing, Escape handling, portal mounting, and teardown to RAC TooltipTrigger.
- Require descriptive content and a focusable trigger while preserving Core's 500 ms open and zero-delay close defaults.
- Support logical placements top, bottom, start, end, top-start, top-end, bottom-start, bottom-end, start-top, start-bottom, end-top, and end-bottom; resolve start and end through the current locale direction.
- Validate finite offset and crossOffset, boolean shouldFlip, and nonnegative finite containerPadding while retaining existing geometry defaults.
- Optionally position relative to an existing DOM element through anchorRef while keeping the required trigger as the hover, focus, and descriptive relationship owner.
- Preserve muxui-tooltip and data-placement, data-entering, and data-exiting selectors for consumer styling.

Public parts: `trigger`, `tooltip`.

### Dialog

- Delegate portal mounting, inert outside content, scroll locking, topmost dismissal, and focus restoration to RAC Modal and ModalOverlay.
- Use DialogTrigger when a trigger is supplied and let ModalOverlay own controlled or uncontrolled state otherwise.
- Render optional description and actions with stable muxui-dialog-description and muxui-dialog-actions selectors.
- Keep Mux UI part classes when applying consumer backdrop, panel, title, description, content, actions, and close classes; preserve default styling unless the consumer overrides it.
- With dismissable false, reject Escape, outside press, and trigger-toggle close requests; controlled owners may still close by setting open false.

Public parts: `backdrop`, `root`, `title`, `description`, `content`, `actions`, `close`.

### AlertDialog

- Escape and backdrop dismissal follow React Aria modal semantics.
- Close returns focus to the trigger.
- Keep muxui-alert-dialog__backdrop, __popup, __content, __title, __description, __actions, and __close selectors when consumer className values customize the corresponding parts.

Public parts: `root`, `trigger`, `backdrop`, `popup`, `content`, `title`, `description`, `actions`, `close`.

### Button

- Activation requests one immediate action
- Pending suppresses activation while retaining focusability
- Variant and size select finite visual recipes
- showTextWhileLoading keeps the pending label visible beside its spinner
- The ref resolves to the native HTMLButtonElement; native pointer, pointer capture, auxiliary click, and context-menu handlers run on that host. Consumers may capture and release pointers without replacing onActivate.

Public parts: `root`, `label`.

### IconButton

- Composes Mux Button; onActivate, refs, form attributes, and finite variants follow Button.
- Renders caller-supplied icon children in a decorative wrapper.
- Square sm, md, and lg sizes follow Mux minimum control heights; pending replaces the icon without changing geometry.
- The pending indicator is static; showTextWhileLoading is not part of this icon-only API.
- The ref resolves to the native HTMLButtonElement; native pointer, pointer capture, auxiliary click, and context-menu handlers run on that host. Consumers may capture and release pointers without replacing onActivate.

Public parts: `root`, `icon`.
