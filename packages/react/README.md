<!-- @generated-from: packages/react/src/generate.mjs -->
<!-- @generated-content-sha256: sha256:91ab904c378e04acf86b8418134f6638564f99139eb2278ecbbab2c62958df83 -->
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
or cross-platform support claim is made. The candidate makes no
assistive-technology support claim; assistive-technology evidence is required
before any such claim and before stable promotion. Automated accessibility,
keyboard, and focus checks still apply. Publication, dist-tag mutation, and
post-publication verification are separate authorized operations.

## Install

Install the prerelease from the `next` dist-tag on npm:

```sh
pnpm add @muxui/react@next
```

It requires Node.js `>=24.19.0 <25`, React `>=19.2.0 <20`, and React DOM `>=19.2.0 <20`. npm also points `latest` at the first published version; that is not a stable or `latest` support claim.

## Usage

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

## Local tarball usage

To develop against an unpublished build, install the versioned local candidate from the package directory instead:

```sh
pnpm add ./muxui-react-0.1.0-rc.1.tgz
```

## Cascade layers

Every rule in `styles.css` and `themes.css` sits in one of the cascade layers `muxui.tokens`, `muxui.components`, and `muxui.utilities`, in that order. Tokens, theme presets, and direction rules are in `muxui.tokens`; component, field, collection, overlay, and supplemental styles are in `muxui.components`; `muxui.utilities` is declared and empty. Each file starts with the full order statement.

For ordinary declarations, CSS outside a layer beats CSS inside one, whatever its specificity, so your own unlayered rules override Mux UI without `!important` or a higher-specificity selector. `!important` reverses that order: Mux UI's `!important` rules (forced colors and reduced motion) beat the `!important` declarations in your unlayered stylesheets, but an `!important` declaration in a layer you rank before Mux UI's layers, or in a `style` attribute, still wins over them. To place a reset or framework below Mux UI, declare your layer order once, before importing the Mux UI stylesheets:

```css
@layer reset, muxui.tokens, muxui.components, muxui.utilities, app;
@import '@muxui/react/styles.css';
@import '@muxui/react/themes.css';
```

The first `@layer` statement that names a layer fixes its rank, so a later order statement in the Mux UI files cannot reorder yours.

## Optional preset themes

The optional `@muxui/react/themes` entry exports the 15 canonical Scale
preset records. Import `@muxui/react/themes.css` after `styles.css` when a
consumer needs a selectable preset palette:

```tsx
import '@muxui/react/styles.css';
import '@muxui/react/themes.css';
import { MUXUI_THEME_PRESETS } from '@muxui/react/themes';

export function ThemeScope({ children }: { children: React.ReactNode }) {
  return <div data-muxui-theme="standard-harbour" data-muxui-color-scheme="light">{children}</div>;
}
```

Theme and mode attributes belong on the same scope element. The preset CSS
recomputes the color dependency closure for light/dark and standard/more
contrast combinations while leaving spacing, typography, motion, and density
values in the base theme. An unknown ID matches no preset declarations; normal
base and inherited styles apply on that scope. Forced-colors component rules
retain their system-color priority.

Component styles consume semantic roles from `catalog/tokens/default-theme.json`: gaps, content insets, outer spacing, viewport clearance, surfaces, borders, typography, shapes, and motion are independently themeable. Explicit per-mode palette painting uses non-inverting semantic palette aliases so dark styles are not inverted twice. Choose tokens by their documented meaning, not because their default values happen to match.

Structural CSS remains literal where it expresses geometry rather than a theme choice: zero/reset values, percentages and intrinsic sizing, border overlaps, visually hidden accessibility patterns, calendar grids, and text-segment alignment. The styling-token tests cover all authored component stylesheets; the browser check verifies gap/inset override isolation.

Supporting runtime exports: `ToastProvider` and `useToast` are available alongside `Toast` for managed notifications.
`useCommandPalette` is available alongside `CommandPalette` for command query, grouping, and execution.

| Export | Lifecycle | Module | Selector | Public props |
| --- | --- | --- | --- | --- |
| Activity | experimental | . | .muxui-activity | label, items, status, expanded, defaultExpanded, actions |
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
| CodeBlock | experimental | . | .muxui-code-block | mode, source, before, after, language, filename, lineNumbers, copyable, wrap |
| ColorArea | experimental | . | .muxui-color-area | label, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly |
| ColorField | experimental | . | .muxui-color-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, name |
| ColorModeToggle | experimental | . | .muxui-color-mode-toggle | mode, defaultMode, storageKey, disabled, onModeChange |
| ColorPicker | experimental | . | .muxui-color-picker | value, defaultValue, disabled, readOnly, children |
| ColorSlider | experimental | . | .muxui-color-slider | label, aria-label, aria-labelledby, value, defaultValue, channel, colorSpace, disabled, readOnly, orientation |
| ColorSwatch | experimental | . | .muxui-color-swatch | color, secondaryColor, shape, colorName, disabled |
| ColorSwatchPicker | experimental | . | .muxui-color-swatch-picker | aria-label, aria-labelledby, items, value, defaultValue, disabled, readOnly |
| ColorWheel | experimental | . | .muxui-color-wheel | aria-label, aria-labelledby, value, defaultValue, outerRadius, innerRadius, readOnly, disabled |
| ComboBox | experimental | . | .muxui-combo-box | label, description, errorMessage, aria-label, aria-labelledby, items, value, defaultValue, selectedId, defaultSelectedId, disabled, size, readOnly, required, invalid, name, placeholder |
| CommandPalette | experimental | . | .muxui-command-palette | open, defaultOpen, onOpenChange, size, closeOnSelect, dismissable, disabled, id, title, description, href, onActivate, commands, query, defaultQuery, onQueryChange, filter, sort, groupBy, getGroupTitle, onAction, close, target, onError |
| DataDiff | experimental | . | .muxui-data-diff | label, description, columns, rows, selectedIds, defaultSelectedIds, onSelectionChange, onApply, pending, disabled, applyLabel, emptyMessage |
| DateField | experimental | . | .muxui-date-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, disabled, size, readOnly, required, invalid, name |
| DatePicker | experimental | . | .muxui-date-picker | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, open, defaultOpen, disabled, size, readOnly, required, invalid, name |
| DateRangePicker | experimental | . | .muxui-date-range-picker | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, unavailableDateMatcher, open, defaultOpen, disabled, size, readOnly, required, invalid, startName, endName |
| Dialog | experimental | . | .muxui-dialog | children, title, description, actions, open, defaultOpen, dismissable, trigger, onOpenChange, className, backdropClassName, panelClassName, titleClassName, descriptionClassName, contentClassName, actionsClassName, closeClassName, aria-label, aria-labelledby, aria-describedby |
| Disclosure | experimental | . | .muxui-disclosure | title, children, expanded, defaultExpanded, disabled, id |
| DisclosureGroup | experimental | . | .muxui-disclosure-group | expandedIds, defaultExpandedIds, multiple, disabled |
| DropZone | experimental | . | .muxui-drop-zone | children, disabled, onDrop, onActivate, className, aria-label, aria-labelledby |
| FileTrigger | experimental | . | .muxui-file-trigger | children, acceptedFileTypes, allowsMultiple, acceptDirectory, defaultCamera, disabled, onSelect, className |
| Form | experimental | . | .muxui-form | validationBehavior, validationErrors, method, action, onSubmit, onReset |
| GridList | experimental | . | .muxui-grid-list | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, disabled, selectionMode, children, layout, orientation, style |
| Group | experimental | . | .muxui-group | disabled, invalid, readOnly, role, aria-label |
| HeaderNav | experimental | . | .muxui-header-nav | href, current, aria-label |
| IconButton | experimental | . | .muxui-icon-button | aria-label, aria-labelledby, disabled, pending, variant, size |
| Image | experimental | . | .muxui-image | src, srcSet, sizes, alt, width, height, loading, decoding, fallbackSrc, fallbackSrcSet, radius, fit |
| Input | experimental | . | .muxui-input | value, defaultValue, onChange, type, placeholder, disabled, invalid, required, readOnly, size |
| InputTags | experimental | . | .muxui-input-tags | tagPlacement, size, placeholder, value, defaultValue, label, description, errorMessage, allowDuplicates, maxTags, validate, disabled, invalid, required, onChange, onTagAdded, onTagRemoved |
| Lightbox | experimental | . | .muxui-lightbox | items, renderContent, selectedKey, defaultSelectedKey, open, defaultOpen, loop, swipeNavigation |
| Link | experimental | . | .muxui-link | href, disabled, current, target, rel |
| ListBox | experimental | . | .muxui-list-box | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, disabled, selectionMode, children, layout, orientation, style |
| Markdown | experimental | ./markdown | .muxui-markdown | source, baseUrl, invalidFallback |
| Menu | experimental | . | .muxui-menu | aria-label, aria-labelledby, items, disabled, shouldCloseOnSelect, children, open, defaultOpen, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, delay |
| Message | experimental | . | .muxui-message | sender, author, children, actions, sources, sourcesExpanded, defaultSourcesExpanded, followUps, streaming, streamingLabel |
| Meter | experimental | . | .muxui-meter | value, minValue, maxValue, label, formatOptions, aria-label, aria-labelledby |
| MultiSelect | experimental | . | .muxui-multi-select | items, size, selectedKeys, defaultSelectedKeys, onSelectionChange, label, placeholder, description, errorMessage, supportingText, showSearch, showFooter, emptyStateTitle, emptyStateDescription, onReset, onSelectAll, selectedCountFormatter, disabled, invalid, required |
| NumberField | experimental | . | .muxui-number-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, minValue, maxValue, step, name, formatOptions |
| PaymentInput | experimental | . | .muxui-payment-input | value, defaultValue, disabled, size, invalid, required, readOnly, onChange |
| Popover | experimental | . | .muxui-popover | children, trigger, open, defaultOpen, dismissable, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, onOpenChange, className, aria-label, aria-labelledby |
| PreviewTrigger | experimental | . | .muxui-preview-trigger | children, trigger, delay, closeDelay, open, defaultOpen, disabled, placement, offset, crossOffset, shouldFlip, containerPadding, onOpenChange, className, aria-label, aria-labelledby |
| ProgressBar | experimental | . | .muxui-progress-bar | value, minValue, maxValue, label |
| ProgressCircle | experimental | . | .muxui-progress-circle | value, minValue, maxValue, size, label |
| PromptComposer | experimental | . | .muxui-prompt-composer | inputLabel, value, defaultValue, inputProps, inputRef, pending, disabled, error, sources, commands, attachments, accept, multiple, models, selectedModel, defaultSelectedModel |
| RadioField | experimental | . | .muxui-radio-field | size, disabled, invalid, required, readOnly, value |
| RadioGroup | experimental | . | .muxui-radio-group | label, aria-label, aria-labelledby, options, children, value, defaultValue, disabled, readOnly, required, invalid, orientation, size, name |
| RangeCalendar | experimental | . | .muxui-range-calendar | label, aria-label, aria-labelledby, value, defaultValue, focusedValue, unavailableDateMatcher, minValue, maxValue, disabled, readOnly, required, invalid |
| Resizable | experimental | . | .muxui-resizable | sizes, defaultSizes, orientation, keyboardStep, keyboardLargeStep, precision, disabled, readOnly |
| SearchField | experimental | . | .muxui-search-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, name, placeholder, id, inputRef, inputProps |
| Select | experimental | . | .muxui-select | label, description, errorMessage, aria-label, aria-labelledby, items, value, defaultValue, open, defaultOpen, disabled, size, readOnly, required, invalid, name, placeholder, children, selectedContent, trigger, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal |
| SelectNative | experimental | . | .muxui-select-native | label, description, errorMessage, aria-label, aria-labelledby, aria-describedby, id, value, defaultValue, onChange, name, form, autoComplete, disabled, required, invalid, multiple, size, children |
| Separator | experimental | . | .muxui-separator | orientation |
| Sidebar | experimental | . | .muxui-sidebar | collapsed, defaultCollapsed, onCollapsedChange, shortcut, hideBorder, density, label, href, current, external, items, expanded, defaultExpanded, onExpandedChange, badge, icon, placeholder, value, onChange, name, email, avatarSrc, status, onDismiss |
| Slider | experimental | . | .muxui-slider | label, aria-label, aria-labelledby, value, defaultValue, min, max, step, disabled, readOnly, orientation, name |
| Switch | experimental | . | .muxui-switch | label, description, errorMessage, aria-label, aria-labelledby, selected, defaultSelected, disabled, size, readOnly, required, invalid, name, value |
| SwitchField | experimental | . | .muxui-switch-field | checked, defaultChecked, name, value, size, disabled, invalid, required, readOnly, onChange |
| Table | experimental | . | .muxui-table | aria-label, columns, rows, selectedIds, defaultSelectedIds, sortDescriptor, disabled, selectionMode |
| Tabs | experimental | . | .muxui-tabs | aria-label, aria-labelledby, items, value, defaultValue, keyboardActivation, disabled, size, orientation, variant |
| TagGroup | experimental | . | .muxui-tag-group | label, aria-label, aria-labelledby, items, disabled |
| TagSelect | experimental | . | .muxui-tag-select | items, size, selectedKeys, defaultSelectedKeys, getItemLabel, label, placeholder, description, errorMessage, disabled, invalid, required, onSelectionChange |
| Text | experimental | . | .muxui-text | variant, size, color, as, truncate |
| TextArea | experimental | . | .muxui-text-area | value, defaultValue, rows, maxLength, placeholder, disabled, invalid, required, readOnly, size |
| TextEditor | experimental | ./text-editor | .muxui-text-editor | value, defaultValue, label, description, errorMessage, disabled, readOnly, required, invalid, placeholder, limit, toolbar, floating, onGenerate, onLinkRequest, onImageRequest, onColorRequest, bubbleMenu, selectionActions, selectionInstruction, onSelectionRequest |
| TextField | experimental | . | .muxui-text-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, disabled, size, readOnly, required, invalid, name, placeholder, type, autoComplete, autoFocus, inputMode, maxLength, minLength, pattern, spellCheck, id, inputRef, inputProps |
| TimeField | experimental | . | .muxui-time-field | label, description, errorMessage, aria-label, aria-labelledby, value, defaultValue, minValue, maxValue, disabled, size, readOnly, required, invalid, name |
| Toast | experimental | . | .muxui-toast | message, title, variant, duration, onDismiss, className |
| ToggleButton | experimental | . | .muxui-toggle-button | selected, defaultSelected, disabled, size |
| ToggleButtonGroup | experimental | . | .muxui-toggle-button-group | aria-label, aria-labelledby, selectedIds, defaultSelectedIds, selectionMode, disabled, orientation, disallowEmptySelection, size |
| TokenField | experimental | . | .muxui-token-field | label, aria-label, aria-labelledby, value, defaultValue, disabled, readOnly, name, placeholder |
| Toolbar | experimental | . | .muxui-toolbar | aria-label, aria-labelledby, orientation |
| Tooltip | experimental | . | .muxui-tooltip | content, trigger, delay, closeDelay, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, open, defaultOpen, disabled, onOpenChange, className |
| Tree | experimental | . | .muxui-tree | aria-label, aria-labelledby, items, selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, disabled, selectionMode, expansionTrigger |
| Virtualizer | experimental | . | .muxui-virtualizer | aria-label, items, height, itemHeight, overscan, disabled, layout, children, minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns |

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

- Existing items and controlled or uncontrolled string ID selections remain supported. ListBox.Root aliases ListBox; Section, Header, and Item compose static collections.
- Options come from items or from children: when both are supplied, children take precedence and items are not rendered.
- Items require stable string IDs. Supply textValue for rich children so typeahead has an unambiguous text value. Sections are named by Header or title, or by aria-label when no visible header is present.
- layout=stack navigates along the orientation. layout=grid uses actual item positions for two-dimensional arrow navigation; consumer CSS or style determines the columns and dimensions. Orientation is vertical by default.
- Root disabled state disables every compound item and suppresses selection/action callbacks. A child disabled=false cannot re-enable an item under a disabled root.
- Data-backed onAction returns the item record. Compound onAction returns identity fields id, key, and value; onSelectionChange always returns string IDs or all.
- Mux selectors are .muxui-list-box, .muxui-list-box-section, .muxui-list-box-section-header, and .muxui-list-box-item. Root states include data-layout, data-orientation, data-disabled, and data-focus-visible; items expose data-selected, data-disabled, data-focused, and data-focus-visible.
- Root and Item refs target divs; Section and Header refs target section/header elements.

Public parts: `root`, `section`, `header`, `item`.

### GridList

- Arrow keys move between items.
- Controlled and uncontrolled Core key selections are supported.
- With onAction set and selectionMode multiple, a click or Enter on an item runs the action while nothing is selected, so pointer users start a selection with Space or a selection affordance in the item content.
- GridList.Item composes static items with a stable string id; supply textValue for rich children so typeahead and the item name stay unambiguous. When children are present, items is ignored.
- Root disabled state disables every GridList.Item and suppresses selection and action callbacks. A child disabled=false cannot re-enable an item under a disabled root. Data-backed onAction returns the normalized item; compound onAction returns identity fields id, key, and value.
- In the default vertical stack, Up and Down arrows move between items and Left and Right arrows reach controls nested in the focused item. With layout=grid or orientation=horizontal, arrow keys move between items by their rendered positions, mirrored in right-to-left, and Tab and Shift+Tab move through the nested controls of the focused item. layout=grid lays items out in auto-fill columns of at least 10rem whose content wraps; orientation=horizontal scrolls along the inline axis. The default column tracks have no specificity, so a plain class or inline style on the GridList sets grid-template-columns whatever the stylesheet order.
- Nested links and buttons run only their own action and never change selection or run onAction.
- A nested Button or Link follows its GridList.Item, so a disabled item disables it. An explicit disabled prop on the Button or Link wins, so disabled={false} keeps it active.
- Mux selectors are .muxui-grid-list and .muxui-grid-list-item. Root states include data-layout, data-orientation, and data-focus-visible; items expose data-selected, data-disabled, data-hovered, data-focused, and data-focus-visible. Root and Item refs target divs.
- Inside a Virtualizer with layout=grid, a GridList must use layout=grid and the vertical orientation. It carries data-muxui-virtualized, mounts only the visible rows, renders each row inside positioned wrapper elements instead of as a direct child, and takes no padding because the layout spaces its items from the GridList CSS gap. Its own column-gap and row-gap set that spacing; see Virtualizer.

Public parts: `root`, `item`.

### Virtualizer

- Only a bounded visible window plus overscan is mounted.
- The focused item stays mounted wherever it is scrolled, so the mounted count can exceed the visible window plus overscan.
- The default stack layout's scroll extent is the item count times itemHeight, plus the viewport's padding, so scrolling to the end reaches the last row.
- The default stack layout is a list of the items passed, in rows placed itemHeight apart, and its rows cannot be selected.
- Stack layout renders items only. It does not virtualize children, a render function, or another collection such as Table or Tree.
- height and itemHeight are in pixels and must be finite numbers greater than 0, or Virtualizer throws a TypeError.
- overscan counts whole rows mounted above and below the window, and must be an integer of 0 or more.
- Virtualizer sets the viewport's block size from height and its overflow to auto, replacing any block size or overflow in style.
- Rows are not measured: content taller than itemHeight overflows its row and overlaps the next one.
- layout=grid wraps one GridList that has layout=grid and the vertical orientation: Virtualizer layout=grid around GridList layout=grid. The Virtualizer renders no element and takes no ref; the GridList is the scroll region and keeps its name, selection, keyboard, and nested-control behavior. Grid mode takes none of aria-label, aria-labelledby, items, height, itemHeight, disabled, onScroll, className, or style; set them on the GridList, and a prop passed to the Virtualizer throws a TypeError that names it. The stack layout likewise throws for minItemWidth, maxItemWidth, estimatedItemHeight, and maxColumns.
- Grid columns are clamp(floor(width / (minItemWidth + column gap)), 1, maxColumns) for the GridList inner width. maxColumns only caps the count, so a narrow container shows fewer columns, and a container narrower than minItemWidth shows one column that fits it. Grid defaults are minItemWidth 200, maxItemWidth unbounded so items stretch to fill their columns, estimatedItemHeight 200, maxColumns unbounded, and overscan 2. A maxItemWidth below the column width stops items growing and centers the grid, keeping the gap.
- Grid rows size to their measured content, so titles and nested actions are never clipped and items in a row share its height. estimatedItemHeight is a plain estimate for every row that has not mounted yet, the same whatever the item width, so it sets the scrollbar extent until rows are measured; each mounted row then takes its measured content height and is measured again when the width changes or its content grows. Content that shrinks without a width change or item update keeps the row height until the next one.
- Grid spacing is the CSS gap on the GridList: the layout content gap token by default, overridden with column-gap and row-gap in an inline style or in a class loaded after the Mux UI stylesheet. The resolved pixel gap is read on mount, when the GridList resizes, and on window resize, so fluid gap tokens work; a gap that is not a pixel length counts as 0. The gap separates items and also insets the first and last rows and columns from the GridList edges, so the GridList takes no padding.
- Grid overscan counts whole rows mounted above and below the viewport, and the focused item stays mounted wherever it is scrolled. Give the GridList a block size to make it a bounded scroller, or leave it unbounded so the page or an ancestor scrolls it. Arrow keys follow rendered positions, mirrored in right-to-left, and Home, End, PageUp, and PageDown reach items that are not mounted yet and bring the focused item fully into view.

Public parts: `root`, `viewport`, `item`.

### Select

- Named Select items, form submission, sizes, controlled or uncontrolled string values, and open state are supported.
- Interactive control sizes use the shared sm, md, and lg targets; md is the default.
- Select.Root, Label, Trigger, Value, Popup, List, Item, Description, and Error compose the same control.
- Supply label, aria-label, or aria-labelledby on the root, or include a nonempty Select.Label directly, in a fragment, or in native wrappers.
- Root label, description, and errorMessage props also render with compound children.
- The simple trigger prop accepts a native button element and preserves its native ref, attributes, and handlers.
- Select.Trigger also owns a native button.
- Use Select.Value inside a custom trigger to retain selected-value accessibility.
- selectedContent customizes the simple default trigger value.
- Select.Value children customize compound selected content; its default renders the selected item children.
- Item IDs and textValue are plain strings, and the underlying library's render props and state objects are not public.
- Arrow keys open and navigate the list.
- Selection and Escape close the list and restore trigger focus.
- Root disabled state cannot be overridden by child disabled=false.
- readOnly preserves the value and suppresses onChange.
- Popup geometry uses finite offset and crossOffset, nonnegative finite containerPadding, and logical placement such as bottom-start or end-top.
- The placement defaults to bottom-start and the offset to 8px.
- Popup-specific props override root geometry.
- anchorRef positions the popup against a consumer-owned element, and modal=false keeps outside content accessible.
- Select class names are .muxui-select, .muxui-select-label, .muxui-select-trigger, .muxui-select-value, .muxui-select-popover, .muxui-select-list, .muxui-select-option, .muxui-select-description, and .muxui-select-error.
- Root states include data-open, data-disabled, data-readonly, and data-invalid.
- Options expose data-selected, data-disabled, data-focused, and data-focus-visible.
- Root, Popup, List, and Item refs target divs; Trigger targets a button; Label, Value, Description, and Error target spans.
- Error renders only while invalid.
- Named forms submit the selected item id, not item.value.
- errorMessage is shown only while the field is invalid, through the invalid prop or failed validation, and replaces the default message; it never makes the field invalid by itself.

Public parts: `root`, `label`, `trigger`, `value`, `popup`, `list`, `option`, `description`, `error`.

### TextField

- Controlled and uncontrolled values are supported.
- Keyboard input preserves the native accessible interaction model.
- Standard native input attributes are applied to the input part.
- Interactive control sizes use the shared sm, md, and lg targets; md is the default.
- The forwarded ref resolves to the outer div; inputRef resolves to the native HTMLInputElement for focus and selection.
- inputProps accepts native input keyboard, paste, focus, blur, selection, composition, and styling props; its className merges with the Mux input class.
- Root id, value, defaultValue, onChange, name, type, accessible name, validation, disabled, readOnly, and required remain authoritative; inputProps cannot replace them. Root native input attributes take precedence when supplied.
- errorMessage renders only while the field is invalid, through the invalid prop or failed native, custom, or server validation, and replaces the built-in message.

Public parts: `root`, `label`, `input`, `description`, `error`.

### SearchField

- Controlled and uncontrolled values are supported.
- Keyboard input preserves the native accessible interaction model.
- Enter calls onSubmit with the current text, including an empty string.
- Escape on a field with text calls onChange with an empty string, then onClear.
- Escape on an empty field does nothing.
- The clear button does the same as Escape.
- A read-only field does not submit or clear from the keyboard.
- Enter and Escape do nothing while an input method composition is in progress.
- A native keydown handler in inputProps that calls preventDefault stops both shortcuts.
- The root has data-empty while the field is empty, and not while it holds text.
- Interactive control sizes use the shared sm, md, and lg targets; md is the default.
- The forwarded ref resolves to the outer div; inputRef resolves to the native HTMLInputElement for focus and selection.
- inputProps accepts native input keyboard, paste, focus, blur, selection, composition, and styling props.
- The className in inputProps merges with the Mux input class.
- inputProps cannot replace the root's id, value, defaultValue, onChange, name, type, accessible name, validation, disabled, readOnly, or required.
- Root native input attributes take precedence when supplied.
- errorMessage renders only while the field is invalid.
- A field is invalid through the invalid prop or failed native, custom, or server validation.
- errorMessage replaces the built-in message.

Public parts: `root`, `label`, `input`, `clear`, `description`, `error`.

### CommandPalette

- Search and collection navigation preserve React Aria keyboard semantics.
- Escape closes the palette.
- closeOnSelect controls whether activating an item closes the palette.
- Input is a native input. It takes value, defaultValue, onChange, and keyboard, paste, composition, and selection handlers.
- The ref on Input resolves to an HTMLInputElement for focus and cursor restoration.
- The application controls the query on Input and supplies the Item results to ListBox.
- Content keeps the application's filtering and ordering, and has no inputValue prop.
- The optional useCommandPalette hook manages reusable command data.
- Applications may compose loading content, Empty, Footer, and custom Item content.
- Enter during IME composition, or cancelled by Input onKeyDown, does not activate a command.
- Input defaults autoFocus to true when the palette opens.
- Collection is the React Aria Components Collection: it renders the Item and Section elements inside it and adds no element or class of its own.
- Shortcut displays key text, with each key in a kbd element, and registers no keyboard shortcut.
- Shortcut is aria-hidden by default.
- LoadMoreItem is a presentational div that loads nothing and tracks no scrolling, so the application owns pagination.
- Chips, Chip, and ChipRemove are structural: they change neither the query nor the results.
- The application keeps the chip data and handles removal.
- Description renders a visible paragraph and does not link itself to the Popup.
- Give Description an id and pass it to the Popup's aria-describedby to connect them.
- useCommandPalette accepts commands with string IDs and preserves extended application metadata.
- useCommandPalette returns query, setQuery, filteredCommands, groupedCommands, runCommand, and getItemProps.
- The hook supports query with onQueryChange, or defaultQuery.
- Default matching trims the query and uses locale-aware, case- and accent-insensitive substring matching across title, subtitle, group, and keywords.
- Default ranking prefers exact titles, title prefixes, title substrings, then secondary fields, and preserves input order for ties.
- Hook filter and sort callbacks override matching and ranking.
- filter:false and sort:false preserve externally supplied results and order, and sort:()=>0 also preserves order.
- groupBy and getGroupTitle customize grouping.
- By default, groups use command.group in first-seen order, with an empty title for ungrouped commands.
- runCommand accepts a command or its string ID, and ignores disabled or missing commands.
- runCommand awaits command.action, then the hook onAction.
- runCommand then calls close when command.closeOnSelect ?? closeOnSelect is true, but only after success.
- Rejections propagate to the runCommand caller without closing.
- The hook does not navigate hrefs or implement browser commands.
- getItemProps adapts a command to Item props: id, title, description, textValue, href, target, disabled, and onActivate.
- getItemProps sets Item closeOnSelect:false, so only the hook close callback dismisses after actions.
- Pass close to the hook when automatic dismissal is wanted.
- Connect Input value and native onChange to the hook query and setQuery.
- Item activation through getItemProps catches action failures and calls the optional hook onError(error, command).
- Without onError, failures go to the global error reporter or the console.
- Failures keep the palette open.
- Direct runCommand callers handle its rejected promise themselves.

Public parts: `root`, `trigger`, `backdrop`, `popup`, `title`, `description`, `close`, `content`, `search-field`, `input`, `clear-button`, `listbox`, `section`, `section-header`, `item`, `separator`, `collection`, `item-icon`, `item-content`, `item-title`, `item-description`, `item-meta`, `shortcut`, `load-more-item`, `empty`, `footer`, `chips`, `chip`, `chip-remove`.

### Popover

- A Popover renders in a portal and is positioned against its trigger.
- Closing returns focus to the element that was focused when the Popover opened.
- If the element that opened the Popover has left the DOM when the Popover closes or unmounts, focus moves to the nearest ancestor recorded at opening that is still connected and focusable.
- That move happens only when focus would otherwise be on the document body, and with no such ancestor focus stays there.
- When overlays are stacked, Escape closes the topmost one.
- trigger is required and must be a focusable React element.
- Pressing the trigger toggles the Popover.
- Open state is controlled with open and onOpenChange, or starts from defaultOpen when uncontrolled.
- placement accepts top, bottom, start, end, top-start, top-end, bottom-start, bottom-end, start-top, start-bottom, end-top, and end-bottom.
- start and end resolve through the current locale direction.
- An unsupported placement, a non-finite offset or crossOffset, a non-boolean shouldFlip, or a negative or non-finite containerPadding throws a TypeError.
- anchorRef positions the Popover against another DOM element, while the trigger still opens it and keeps its accessibility relationships.
- With modal set to false, the Popover is non-blocking: it has no focus containment, outside-content exclusion, or scroll locking.
- Changing modal while open keeps the existing content, uncontrolled values, and child state.
- Entering modal mode focuses the dialog surface when focus is outside it.
- Keep the muxui-popover-positioner and muxui-popover selectors, and the data-placement and transition state attributes.
- data-modal on the positioner exposes the modal setting for consumer styling.
- A dismissable non-modal Popover also closes on an outside press, and on Escape while focus is on the trigger.
- With dismissable set to false, Escape, an outside press, and the trigger do not close the Popover, in modal and non-modal mode.
- A button with slot="close" in the content still closes it.
- Pressing a close-slot button closes an uncontrolled Popover and calls onOpenChange(false).
- A controlled Popover stays open until its owner sets open to false.

Public parts: `trigger`, `root`, `content`.

### Tooltip

- A Tooltip opens on pointer hover and on keyboard focus, after its delay.
- Only one Tooltip is open at a time.
- Escape closes the open Tooltip.
- A Tooltip renders in a portal.
- content is required, and trigger is required and must be a focusable React element.
- placement accepts top, bottom, start, end, top-start, top-end, bottom-start, bottom-end, start-top, start-bottom, end-top, and end-bottom.
- start and end resolve through the current locale direction.
- An unsupported placement, a non-finite offset or crossOffset, a non-boolean shouldFlip, or a negative or non-finite containerPadding throws a TypeError.
- anchorRef positions the Tooltip against another DOM element, while the trigger still owns hover, focus, and the description.
- Keep the muxui-tooltip selector and the data-placement, data-entering, and data-exiting attributes for consumer styling.
- With disabled set, the Tooltip does not open, and an open one closes.
- The trigger stays operable: disabled adds no aria-disabled or data-disabled to it.
- A Tooltip describes its trigger and does not name it, so an icon-only trigger needs its own accessible name.
- The Tooltip surface has pointer events turned off, so links and buttons in its content do not receive clicks.

Public parts: `trigger`, `tooltip`.

### Dialog

- A Dialog renders in a portal and makes the content outside it inert while it is open.
- Page scrolling is locked while a Dialog is open.
- When overlays are stacked, Escape closes the topmost one.
- Closing returns focus to the element that was focused when the Dialog opened.
- If the element that opened the Dialog has left the DOM when the Dialog closes or unmounts, focus moves to the nearest ancestor recorded at opening that is still connected and focusable.
- That move happens only when focus would otherwise be on the document body, and with no such ancestor focus stays there.
- trigger is optional and renders the element that opens the Dialog.
- Open state is controlled with open and onOpenChange, or starts from defaultOpen when uncontrolled.
- Optional description and actions render with the stable muxui-dialog-description and muxui-dialog-actions selectors.
- Mux UI part classes stay when consumer backdrop, panel, title, description, content, actions, and close classes are applied.
- Default styling is preserved unless the consumer overrides it.
- With dismissable set to false, Escape, an outside press, and the trigger do not close the Dialog.
- A Dialog with dismissable set to false has no built-in close button.
- A button with slot="close" in the content or actions still closes it.
- Pressing a close-slot button closes an uncontrolled Dialog and calls onOpenChange(false).
- A controlled Dialog stays open until its owner sets open to false.

Public parts: `backdrop`, `root`, `title`, `description`, `content`, `actions`, `close`.

### AlertDialog

- Open state is controlled with open and onOpenChange, or starts from defaultOpen when uncontrolled.
- Escape closes the dialog, and pressing the backdrop does not.
- A close request reaches onOpenChange(false), and a controlled owner keeps the dialog open by leaving open unchanged.
- Close is a button in the close slot. It closes the dialog and runs no confirming action.
- The confirming action is the application's own button, such as one placed in Actions.
- AlertDialog does not track the confirming action's progress or outcome, so the application owns them.
- Closing returns focus to the trigger.
- Keep muxui-alert-dialog__backdrop, __popup, __content, __title, __description, __actions, and __close selectors when consumer className values customize the corresponding parts.

Public parts: `root`, `trigger`, `backdrop`, `popup`, `content`, `title`, `description`, `actions`, `close`.

### Button

- Activation requests one immediate action
- Pending suppresses activation while retaining focusability
- Inside a form, Button does not submit or reset the form unless it is given the native submit or reset type
- A pending submit Button renders as a plain button, so activating it does not submit the form; the application sets and clears pending around its own work
- Disabled applies the native disabled attribute, so the Button is neither focusable nor activatable
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
