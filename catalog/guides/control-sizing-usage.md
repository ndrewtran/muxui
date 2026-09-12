---
id: muxui:guide:control-sizing-usage
---

# Interactive control sizing

Mux UI has exactly three shared interactive-control targets:

| Size | Target |
| --- | --- |
| `sm` | `2rem` / `32px` |
| `md` | `2.25rem` / `36px` (default) |
| `lg` | `2.5rem` / `40px` |

The targets apply to ordinary single-line controls and their actionable rows:
buttons, text fields, selects, autocomplete, date and time controls, checkbox,
radio and switch rows, collection options, tabs, tree rows, and toolbar
actions. Fields are measured from the control surface only; labels, help text,
and errors are outside the target.

Use `min-block-size`, coordinated typography, padding, and icons. Text-bearing
controls may grow when text is enlarged, including at 200% zoom. Icon-only
buttons are square. Choice indicators and switch tracks may remain visually
smaller when their surrounding target is sized.

Textareas and other multiline surfaces remain content-driven. Calendar and
range-calendar containers, color areas, sliders, cards, tables, and overlays
are not interactive-control rows and do not inherit these heights.

Documented small interactive exceptions are TagSelect and TagGroup removal
buttons, calendar cells and navigation, and popup close buttons. They retain
their compact geometry with a minimum 24px hit area where needed. InputTags
removes tokens through its keyboard editing behavior and has no separate
remove-button part. Segmented number steppers remain individually sized
controls in their horizontal composition; each action keeps its own target and
is never counted as a combined hit area.

Density changes continue to adjust spacing and gaps, but never silently change
these explicit size targets. Focus indication is independent of layout and is
preserved in forced-colors mode.

## Current family map

The current React projection has 74 named families. The rule applies to the
control part, not automatically to a component's surrounding container.

| Coverage | Families |
| --- | --- |
| Public `sm`/`md`/`lg` size API | Autocomplete, Button, Checkbox, CheckboxGroup, CheckboxField, ColorField, ComboBox, CommandPalette, DateField, DatePicker, DateRangePicker, Input, InputTags, MultiSelect, NumberField, PaymentInput, RadioField, RadioGroup, SearchField, Select, Switch, SwitchField, Tabs, TagSelect, TextField, TimeField, ToggleButton, ToggleButtonGroup |
| Default `md` target on an actionable part; no public size axis | ButtonGroup, ColorModeToggle, Disclosure, DisclosureGroup, FileTrigger, GridList, HeaderNav, ListBox, Menu, Table, TagGroup, TextEditor, TokenField, Toolbar, Tree |
| Content-driven root with sized interactive parts | AlertDialog, Calendar, Dialog, DropZone, Lightbox, Popover, PreviewTrigger, RangeCalendar, Sidebar, Toast, Tooltip |
| Specialized geometry; retain dedicated track, swatch, canvas, or handle sizing | ColorArea, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker, ColorWheel, Slider |
| Public size prop retained for a non-target surface | ProgressCircle, TextArea |
| Layout, status, or multiline surface; do not impose a shared control height | Breadcrumbs, Card, Form, Group, Link, Markdown, Meter, ProgressBar, Resizable, Separator, Virtualizer |

The default-md row is intentionally part-level: collection options, calendar
navigation/cells, dialog and lightbox actions, table actionable rows, sidebar
actions, and text-editor toolbar buttons are targets; their panels, grids, and
content remain content-driven. The small-target exceptions above are explicit
per-action exceptions and are not combined to claim target-size compliance.

`semantic.control.min-height` remains the compatibility hook for the default
`md` target. New themes may override either that hook or
`semantic.control.size-md`; `sm` and `lg` remain independent shared roles.
