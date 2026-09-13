// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:9f62b9eef17f1735abe67e89730dd6b0973e0aceefa2dc53ce5972602e8e10fc
export const manifest = Object.freeze({
  "schema": "muxui-react-storybook-manifest-v1",
  "generatedFrom": [
    "packages/react/generated/descriptor.json",
    "catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json",
    "catalog/components/icon-button/examples/react/basic.tsx",
    "catalog/components/link/examples/react/icon-composition.tsx",
    "catalog/components/number-field/examples/react/sizing.tsx"
  ],
  "count": 75,
  "families": [
    {
      "family": "Autocomplete",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name",
        "items",
        "placeholder"
      ],
      "defaults": {
        "defaultValue": "",
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md",
        "value": ""
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "invalid"
      ]
    },
    {
      "family": "Breadcrumbs",
      "tranche": "R1.1",
      "props": [
        "items",
        "aria-label"
      ],
      "defaults": {
        "aria-label": "Breadcrumbs",
        "items": []
      },
      "states": [
        "idle",
        "disabled",
        "current"
      ]
    },
    {
      "family": "Button",
      "tranche": "R1.1",
      "props": [
        "disabled",
        "pending",
        "showTextWhileLoading",
        "variant",
        "tone",
        "size"
      ],
      "defaults": {
        "disabled": false,
        "pending": false,
        "showTextWhileLoading": false,
        "size": "md",
        "tone": "default",
        "variant": "primary"
      },
      "states": [
        "idle",
        "pending",
        "disabled"
      ]
    },
    {
      "family": "Calendar",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "focusedValue",
        "minValue",
        "maxValue",
        "unavailableDateMatcher",
        "disabled",
        "readOnly",
        "required",
        "invalid"
      ],
      "defaults": {
        "disabled": false,
        "readOnly": false,
        "required": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only",
        "invalid",
        "selected"
      ]
    },
    {
      "family": "Checkbox",
      "tranche": "R1.1",
      "props": [
        "checked",
        "defaultChecked",
        "disabled",
        "size",
        "indeterminate",
        "name",
        "required",
        "value",
        "invalid"
      ],
      "defaults": {
        "checked": false,
        "defaultChecked": false,
        "disabled": false,
        "indeterminate": false,
        "invalid": false,
        "size": "md"
      },
      "states": [
        "idle",
        "selected",
        "indeterminate",
        "disabled",
        "invalid"
      ]
    },
    {
      "family": "CheckboxGroup",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "disabled",
        "readOnly",
        "required",
        "invalid",
        "name",
        "orientation",
        "size"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "orientation": "vertical",
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "ColorArea",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "disabled",
        "readOnly"
      ],
      "defaults": {
        "disabled": false,
        "readOnly": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only"
      ]
    },
    {
      "family": "ColorField",
      "tranche": "R1.3",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only",
        "invalid"
      ]
    },
    {
      "family": "ColorPicker",
      "tranche": "R1.3",
      "props": [
        "value",
        "defaultValue",
        "disabled",
        "readOnly",
        "children"
      ],
      "defaults": {
        "disabled": false,
        "readOnly": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only"
      ]
    },
    {
      "family": "ColorSlider",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "channel",
        "colorSpace",
        "disabled",
        "readOnly",
        "orientation"
      ],
      "defaults": {
        "channel": "red",
        "disabled": false,
        "orientation": "horizontal",
        "readOnly": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only"
      ]
    },
    {
      "family": "ColorSwatch",
      "tranche": "R1.3",
      "props": [
        "color",
        "disabled"
      ],
      "defaults": {
        "disabled": false
      },
      "states": [
        "idle",
        "disabled"
      ]
    },
    {
      "family": "ColorSwatchPicker",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "items",
        "value",
        "defaultValue",
        "disabled",
        "readOnly"
      ],
      "defaults": {
        "disabled": false,
        "readOnly": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "selected"
      ]
    },
    {
      "family": "ColorWheel",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "outerRadius",
        "innerRadius",
        "readOnly",
        "disabled"
      ],
      "defaults": {
        "disabled": false,
        "innerRadius": 64,
        "outerRadius": 96,
        "readOnly": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only"
      ]
    },
    {
      "family": "ComboBox",
      "tranche": "R1.3",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "items",
        "value",
        "defaultValue",
        "selectedId",
        "defaultSelectedId",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name",
        "placeholder"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "focused",
        "open",
        "disabled",
        "read-only",
        "invalid"
      ]
    },
    {
      "family": "DateField",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "minValue",
        "maxValue",
        "unavailableDateMatcher",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "DatePicker",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "minValue",
        "maxValue",
        "unavailableDateMatcher",
        "open",
        "defaultOpen",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name"
      ],
      "defaults": {
        "defaultOpen": false,
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "open",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "DateRangePicker",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "minValue",
        "maxValue",
        "unavailableDateMatcher",
        "open",
        "defaultOpen",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "startName",
        "endName"
      ],
      "defaults": {
        "defaultOpen": false,
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "open",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "Disclosure",
      "tranche": "R1.1",
      "props": [
        "expanded",
        "defaultExpanded",
        "disabled",
        "id"
      ],
      "defaults": {
        "defaultExpanded": false,
        "disabled": false,
        "expanded": false
      },
      "states": [
        "collapsed",
        "expanded",
        "disabled"
      ]
    },
    {
      "family": "DisclosureGroup",
      "tranche": "R1.1",
      "props": [
        "expandedIds",
        "defaultExpandedIds",
        "multiple",
        "disabled"
      ],
      "defaults": {
        "defaultExpandedIds": [],
        "disabled": false,
        "expandedIds": [],
        "multiple": true
      },
      "states": [
        "idle",
        "expanded",
        "disabled"
      ]
    },
    {
      "family": "DropZone",
      "tranche": "R1.4",
      "props": [
        "children",
        "disabled",
        "onDrop",
        "onActivate",
        "className",
        "aria-label",
        "aria-labelledby"
      ],
      "defaults": {
        "disabled": false
      },
      "states": [
        "idle",
        "drop-target",
        "focused",
        "disabled"
      ]
    },
    {
      "family": "FileTrigger",
      "tranche": "R1.4",
      "props": [
        "children",
        "acceptedFileTypes",
        "allowsMultiple",
        "acceptDirectory",
        "defaultCamera",
        "disabled",
        "onSelect",
        "className"
      ],
      "defaults": {
        "acceptDirectory": false,
        "allowsMultiple": false,
        "disabled": false
      },
      "states": [
        "idle",
        "focused",
        "disabled"
      ]
    },
    {
      "family": "Form",
      "tranche": "R1.2",
      "props": [
        "validationBehavior",
        "validationErrors",
        "method",
        "action",
        "onSubmit",
        "onReset"
      ],
      "defaults": {
        "method": "get",
        "validationBehavior": "native"
      },
      "states": [
        "idle",
        "submitting",
        "invalid"
      ]
    },
    {
      "family": "GridList",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "items",
        "selectedIds",
        "defaultSelectedIds",
        "disabled",
        "selectionMode"
      ],
      "defaults": {
        "disabled": false,
        "selectionMode": "single"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "selected",
        "empty"
      ]
    },
    {
      "family": "Group",
      "tranche": "R1.1",
      "props": [
        "disabled",
        "invalid",
        "readOnly",
        "role",
        "aria-label"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "role": "group"
      },
      "states": [
        "idle",
        "disabled",
        "invalid",
        "read-only"
      ]
    },
    {
      "family": "Link",
      "tranche": "R1.1",
      "props": [
        "href",
        "disabled",
        "current",
        "target",
        "rel"
      ],
      "defaults": {
        "current": false,
        "disabled": false
      },
      "states": [
        "idle",
        "current",
        "disabled",
        "pressed"
      ]
    },
    {
      "family": "ListBox",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "items",
        "selectedIds",
        "defaultSelectedIds",
        "disabled",
        "selectionMode"
      ],
      "defaults": {
        "disabled": false,
        "selectionMode": "single"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "selected",
        "empty"
      ]
    },
    {
      "family": "Menu",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "items",
        "disabled",
        "shouldCloseOnSelect"
      ],
      "defaults": {
        "disabled": false,
        "shouldCloseOnSelect": true
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "open"
      ]
    },
    {
      "family": "Meter",
      "tranche": "R1.1",
      "props": [
        "value",
        "minValue",
        "maxValue",
        "label",
        "formatOptions"
      ],
      "defaults": {
        "maxValue": 100,
        "minValue": 0,
        "value": 0
      },
      "states": [
        "idle"
      ]
    },
    {
      "family": "Dialog",
      "tranche": "R1.4",
      "props": [
        "children",
        "title",
        "open",
        "defaultOpen",
        "dismissable",
        "trigger",
        "onOpenChange",
        "className",
        "aria-label",
        "aria-labelledby"
      ],
      "defaults": {
        "defaultOpen": false,
        "dismissable": true
      },
      "states": [
        "closed",
        "open",
        "focused",
        "dismissed"
      ]
    },
    {
      "family": "NumberField",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "minValue",
        "maxValue",
        "step",
        "name",
        "formatOptions"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md",
        "step": 1
      },
      "states": [
        "idle",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "Popover",
      "tranche": "R1.4",
      "props": [
        "children",
        "trigger",
        "open",
        "defaultOpen",
        "dismissable",
        "placement",
        "offset",
        "crossOffset",
        "shouldFlip",
        "containerPadding",
        "onOpenChange",
        "className",
        "aria-label",
        "aria-labelledby"
      ],
      "defaults": {
        "containerPadding": 12,
        "crossOffset": 0,
        "defaultOpen": false,
        "dismissable": true,
        "offset": 8,
        "placement": "bottom",
        "shouldFlip": true
      },
      "states": [
        "closed",
        "open",
        "focused",
        "dismissed"
      ]
    },
    {
      "family": "PreviewTrigger",
      "tranche": "R1.4",
      "props": [
        "children",
        "trigger",
        "delay",
        "closeDelay",
        "open",
        "defaultOpen",
        "disabled",
        "placement",
        "offset",
        "crossOffset",
        "shouldFlip",
        "containerPadding",
        "onOpenChange",
        "className",
        "aria-label",
        "aria-labelledby"
      ],
      "defaults": {
        "closeDelay": 200,
        "containerPadding": 12,
        "crossOffset": 0,
        "defaultOpen": false,
        "delay": 600,
        "disabled": false,
        "offset": 8,
        "placement": "top",
        "shouldFlip": true
      },
      "states": [
        "closed",
        "opening",
        "open",
        "closing"
      ]
    },
    {
      "family": "ProgressBar",
      "tranche": "R1.1",
      "props": [
        "value",
        "minValue",
        "maxValue",
        "label"
      ],
      "defaults": {
        "maxValue": 100,
        "minValue": 0
      },
      "states": [
        "idle",
        "progress",
        "indeterminate",
        "complete"
      ]
    },
    {
      "family": "RadioGroup",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "options",
        "children",
        "value",
        "defaultValue",
        "disabled",
        "readOnly",
        "required",
        "invalid",
        "orientation",
        "size"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "orientation": "vertical",
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only",
        "invalid",
        "selected"
      ]
    },
    {
      "family": "RangeCalendar",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "focusedValue",
        "unavailableDateMatcher",
        "minValue",
        "maxValue",
        "disabled",
        "readOnly",
        "required",
        "invalid"
      ],
      "defaults": {
        "disabled": false,
        "readOnly": false,
        "required": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only",
        "invalid",
        "selected"
      ]
    },
    {
      "family": "SearchField",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name",
        "placeholder"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "empty",
        "filled",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "Select",
      "tranche": "R1.3",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "items",
        "value",
        "defaultValue",
        "open",
        "defaultOpen",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name",
        "placeholder"
      ],
      "defaults": {
        "defaultOpen": false,
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "focused",
        "open",
        "disabled",
        "read-only",
        "invalid",
        "selected"
      ]
    },
    {
      "family": "Separator",
      "tranche": "R1.1",
      "props": [
        "orientation"
      ],
      "defaults": {
        "orientation": "horizontal"
      },
      "states": [
        "horizontal",
        "vertical"
      ]
    },
    {
      "family": "Slider",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "min",
        "max",
        "step",
        "disabled",
        "readOnly",
        "orientation"
      ],
      "defaults": {
        "disabled": false,
        "max": 100,
        "min": 0,
        "orientation": "horizontal",
        "readOnly": false,
        "step": 1
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only",
        "selected"
      ]
    },
    {
      "family": "Switch",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "selected",
        "defaultSelected",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name",
        "value"
      ],
      "defaults": {
        "defaultSelected": false,
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "selected": false,
        "size": "md"
      },
      "states": [
        "idle",
        "selected",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "Table",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "columns",
        "rows",
        "selectedIds",
        "defaultSelectedIds",
        "sortDescriptor",
        "disabled",
        "selectionMode"
      ],
      "defaults": {
        "disabled": false,
        "selectionMode": "none"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "selected",
        "empty"
      ]
    },
    {
      "family": "Tabs",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "items",
        "value",
        "defaultValue",
        "keyboardActivation",
        "disabled",
        "size",
        "orientation"
      ],
      "defaults": {
        "disabled": false,
        "keyboardActivation": "automatic",
        "orientation": "horizontal",
        "size": "md"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "selected"
      ]
    },
    {
      "family": "TagGroup",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "items",
        "disabled"
      ],
      "defaults": {
        "disabled": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "empty"
      ]
    },
    {
      "family": "TextField",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name",
        "placeholder",
        "type",
        "autoComplete",
        "autoFocus",
        "inputMode",
        "maxLength",
        "minLength",
        "pattern",
        "spellCheck"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md",
        "type": "text"
      },
      "states": [
        "idle",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "TimeField",
      "tranche": "R1.2",
      "props": [
        "label",
        "description",
        "errorMessage",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "minValue",
        "maxValue",
        "disabled",
        "size",
        "readOnly",
        "required",
        "invalid",
        "name"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "idle",
        "disabled",
        "read-only",
        "required",
        "invalid"
      ]
    },
    {
      "family": "Toast",
      "tranche": "R1.4",
      "props": [
        "message",
        "title",
        "variant",
        "duration",
        "onDismiss",
        "className"
      ],
      "defaults": {
        "duration": 5000,
        "variant": "neutral"
      },
      "states": [
        "visible",
        "timed",
        "dismissed"
      ]
    },
    {
      "family": "ToggleButton",
      "tranche": "R1.1",
      "props": [
        "selected",
        "defaultSelected",
        "disabled",
        "size"
      ],
      "defaults": {
        "defaultSelected": false,
        "disabled": false,
        "selected": false,
        "size": "md"
      },
      "states": [
        "idle",
        "selected",
        "disabled",
        "pressed"
      ]
    },
    {
      "family": "ToggleButtonGroup",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "selectedIds",
        "defaultSelectedIds",
        "selectionMode",
        "disabled",
        "orientation",
        "disallowEmptySelection",
        "size"
      ],
      "defaults": {
        "disabled": false,
        "disallowEmptySelection": false,
        "orientation": "horizontal",
        "selectionMode": "single",
        "size": "md"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "selected"
      ]
    },
    {
      "family": "TokenField",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "value",
        "defaultValue",
        "disabled",
        "readOnly",
        "name",
        "placeholder"
      ],
      "defaults": {
        "disabled": false,
        "readOnly": false
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only",
        "invalid"
      ]
    },
    {
      "family": "Toolbar",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "orientation"
      ],
      "defaults": {
        "orientation": "horizontal"
      },
      "states": [
        "idle",
        "focused"
      ]
    },
    {
      "family": "Tooltip",
      "tranche": "R1.4",
      "props": [
        "content",
        "trigger",
        "delay",
        "closeDelay",
        "placement",
        "offset",
        "crossOffset",
        "shouldFlip",
        "containerPadding",
        "open",
        "defaultOpen",
        "disabled",
        "onOpenChange",
        "className"
      ],
      "defaults": {
        "closeDelay": 0,
        "containerPadding": 12,
        "crossOffset": 0,
        "delay": 500,
        "disabled": false,
        "offset": 0,
        "placement": "top",
        "shouldFlip": true
      },
      "states": [
        "closed",
        "opening",
        "open",
        "closing"
      ]
    },
    {
      "family": "Tree",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "items",
        "selectedIds",
        "defaultSelectedIds",
        "expandedIds",
        "defaultExpandedIds",
        "disabled",
        "selectionMode"
      ],
      "defaults": {
        "disabled": false,
        "selectionMode": "single"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "selected",
        "expanded",
        "empty"
      ]
    },
    {
      "family": "Virtualizer",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "items",
        "height",
        "itemHeight",
        "overscan",
        "disabled"
      ],
      "defaults": {
        "disabled": false,
        "height": 240,
        "itemHeight": 40,
        "overscan": 2
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "empty"
      ]
    },
    {
      "family": "AlertDialog",
      "tranche": "R1.6",
      "props": [
        "open",
        "defaultOpen",
        "onOpenChange",
        "disabled",
        "onActivate"
      ],
      "defaults": {
        "defaultOpen": false,
        "disabled": false
      },
      "states": [
        "closed",
        "open",
        "focused",
        "disabled"
      ]
    },
    {
      "family": "ButtonGroup",
      "tranche": "R1.6",
      "props": [
        "orientation",
        "attached",
        "disabled",
        "aria-label",
        "aria-labelledby"
      ],
      "defaults": {
        "attached": false,
        "disabled": false,
        "orientation": "horizontal"
      },
      "states": [
        "horizontal",
        "vertical",
        "attached",
        "disabled"
      ]
    },
    {
      "family": "Card",
      "tranche": "R1.6",
      "props": [
        "variant",
        "padding",
        "selected",
        "pending",
        "disabled",
        "onActivate"
      ],
      "defaults": {
        "disabled": false,
        "padding": "md",
        "pending": false,
        "variant": "outlined"
      },
      "states": [
        "elevated",
        "outlined",
        "filled",
        "selected",
        "pending",
        "disabled",
        "focused"
      ]
    },
    {
      "family": "CheckboxField",
      "tranche": "R1.6",
      "props": [
        "checked",
        "defaultChecked",
        "indeterminate",
        "name",
        "value",
        "size",
        "disabled",
        "invalid",
        "required",
        "readOnly",
        "onChange"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "unchecked",
        "checked",
        "indeterminate",
        "disabled",
        "invalid",
        "focused"
      ]
    },
    {
      "family": "ColorModeToggle",
      "tranche": "R1.6",
      "props": [
        "mode",
        "defaultMode",
        "storageKey",
        "disabled",
        "onModeChange"
      ],
      "defaults": {
        "disabled": false,
        "storageKey": "muxui-color-mode"
      },
      "states": [
        "light",
        "dark",
        "disabled",
        "focused"
      ]
    },
    {
      "family": "CommandPalette",
      "tranche": "R1.6",
      "props": [
        "open",
        "defaultOpen",
        "onOpenChange",
        "size",
        "closeOnSelect",
        "dismissable",
        "disabled",
        "id",
        "title",
        "description",
        "href",
        "onActivate"
      ],
      "defaults": {
        "closeOnSelect": true,
        "defaultOpen": false,
        "disabled": false,
        "dismissable": true,
        "size": "md"
      },
      "states": [
        "closed",
        "open",
        "filtered",
        "empty",
        "disabled",
        "focused"
      ]
    },
    {
      "family": "HeaderNav",
      "tranche": "R1.6",
      "props": [
        "href",
        "current",
        "aria-label"
      ],
      "defaults": {
        "current": false
      },
      "states": [
        "desktop",
        "mobile",
        "current",
        "focused"
      ]
    },
    {
      "family": "IconButton",
      "tranche": "R1.6",
      "props": [
        "aria-label",
        "aria-labelledby",
        "disabled",
        "pending",
        "variant",
        "tone",
        "size"
      ],
      "defaults": {
        "disabled": false,
        "pending": false,
        "size": "md",
        "tone": "default",
        "variant": "ghost"
      },
      "states": [
        "default",
        "hovered",
        "pressed",
        "focus-visible",
        "disabled",
        "pending"
      ]
    },
    {
      "family": "Input",
      "tranche": "R1.6",
      "props": [
        "value",
        "defaultValue",
        "onChange",
        "type",
        "placeholder",
        "disabled",
        "invalid",
        "required",
        "readOnly",
        "size"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "empty",
        "filled",
        "disabled",
        "invalid",
        "focused"
      ]
    },
    {
      "family": "InputTags",
      "tranche": "R1.6",
      "props": [
        "tagPlacement",
        "size",
        "placeholder",
        "value",
        "defaultValue",
        "label",
        "description",
        "errorMessage",
        "allowDuplicates",
        "maxTags",
        "validate",
        "disabled",
        "invalid",
        "required",
        "onChange",
        "onTagAdded",
        "onTagRemoved"
      ],
      "defaults": {
        "allowDuplicates": false,
        "disabled": false,
        "invalid": false,
        "required": false,
        "size": "md",
        "tagPlacement": "inline"
      },
      "states": [
        "inline",
        "below",
        "focused",
        "disabled",
        "invalid",
        "tag-focused"
      ]
    },
    {
      "family": "Lightbox",
      "tranche": "R1.6",
      "props": [
        "items",
        "selectedKey",
        "defaultSelectedKey",
        "open",
        "defaultOpen",
        "loop",
        "swipeNavigation"
      ],
      "defaults": {
        "defaultOpen": false,
        "loop": false,
        "swipeNavigation": true
      },
      "states": [
        "closed",
        "open",
        "disabled"
      ]
    },
    {
      "family": "Markdown",
      "tranche": "R1.6",
      "props": [
        "source",
        "baseUrl",
        "invalidFallback"
      ],
      "defaults": {},
      "states": [
        "idle",
        "invalid"
      ]
    },
    {
      "family": "MultiSelect",
      "tranche": "R1.6",
      "props": [
        "items",
        "size",
        "selectedKeys",
        "defaultSelectedKeys",
        "onSelectionChange",
        "label",
        "placeholder",
        "description",
        "errorMessage",
        "supportingText",
        "showSearch",
        "showFooter",
        "emptyStateTitle",
        "emptyStateDescription",
        "onReset",
        "onSelectAll",
        "selectedCountFormatter",
        "disabled",
        "invalid",
        "required"
      ],
      "defaults": {
        "disabled": false,
        "emptyStateDescription": "Please try a different search term.",
        "emptyStateTitle": "No results found",
        "invalid": false,
        "placeholder": "Select",
        "required": false,
        "showFooter": true,
        "showSearch": true,
        "size": "md"
      },
      "states": [
        "closed",
        "open",
        "filtered",
        "empty",
        "selected",
        "disabled",
        "invalid"
      ]
    },
    {
      "family": "PaymentInput",
      "tranche": "R1.6",
      "props": [
        "value",
        "defaultValue",
        "disabled",
        "size",
        "invalid",
        "required",
        "readOnly",
        "onChange"
      ],
      "defaults": {
        "defaultValue": "",
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "empty",
        "visa",
        "mastercard",
        "amex",
        "discover",
        "unknown",
        "disabled",
        "invalid"
      ]
    },
    {
      "family": "ProgressCircle",
      "tranche": "R1.6",
      "props": [
        "value",
        "minValue",
        "maxValue",
        "size",
        "label"
      ],
      "defaults": {
        "maxValue": 100,
        "minValue": 0,
        "size": "md",
        "value": null
      },
      "states": [
        "indeterminate",
        "zero",
        "partial",
        "complete",
        "sm",
        "md",
        "lg"
      ]
    },
    {
      "family": "RadioField",
      "tranche": "R1.6",
      "props": [
        "size",
        "disabled",
        "invalid",
        "required",
        "readOnly",
        "value"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "unselected",
        "selected",
        "disabled",
        "invalid",
        "focused"
      ]
    },
    {
      "family": "Resizable",
      "tranche": "R1.6",
      "props": [
        "sizes",
        "defaultSizes",
        "orientation",
        "disabled",
        "readOnly"
      ],
      "defaults": {
        "disabled": false,
        "orientation": "horizontal",
        "precision": 4,
        "readOnly": false
      },
      "states": [
        "idle",
        "disabled",
        "read-only",
        "invalid"
      ]
    },
    {
      "family": "Sidebar",
      "tranche": "R1.6",
      "props": [
        "hideBorder",
        "href",
        "current",
        "external",
        "items",
        "badge",
        "icon",
        "placeholder",
        "value",
        "onChange",
        "name",
        "email",
        "avatarSrc",
        "status",
        "onDismiss"
      ],
      "defaults": {
        "current": false,
        "external": false,
        "hideBorder": false,
        "placeholder": "Search"
      },
      "states": [
        "desktop",
        "mobile",
        "current",
        "external",
        "expanded",
        "focused"
      ]
    },
    {
      "family": "SwitchField",
      "tranche": "R1.6",
      "props": [
        "checked",
        "defaultChecked",
        "name",
        "value",
        "size",
        "disabled",
        "invalid",
        "required",
        "readOnly",
        "onChange"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "unchecked",
        "checked",
        "disabled",
        "invalid",
        "focused"
      ]
    },
    {
      "family": "TagSelect",
      "tranche": "R1.6",
      "props": [
        "items",
        "size",
        "selectedKeys",
        "defaultSelectedKeys",
        "getItemLabel",
        "label",
        "placeholder",
        "description",
        "errorMessage",
        "disabled",
        "invalid",
        "required",
        "onSelectionChange"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "items": [],
        "required": false,
        "size": "md"
      },
      "states": [
        "empty",
        "filtered",
        "selected",
        "disabled",
        "invalid",
        "focused"
      ]
    },
    {
      "family": "TextArea",
      "tranche": "R1.6",
      "props": [
        "value",
        "defaultValue",
        "rows",
        "maxLength",
        "placeholder",
        "disabled",
        "invalid",
        "required",
        "readOnly",
        "size"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "size": "md"
      },
      "states": [
        "empty",
        "filled",
        "disabled",
        "invalid",
        "focused"
      ]
    },
    {
      "family": "TextEditor",
      "tranche": "R1.6",
      "props": [
        "value",
        "defaultValue",
        "label",
        "description",
        "errorMessage",
        "disabled",
        "readOnly",
        "required",
        "invalid",
        "placeholder",
        "limit",
        "toolbar",
        "floating",
        "onGenerate",
        "onLinkRequest",
        "onImageRequest",
        "onColorRequest",
        "bubbleMenu"
      ],
      "defaults": {
        "bubbleMenu": false,
        "disabled": false,
        "floating": false,
        "invalid": false,
        "readOnly": false,
        "required": false,
        "toolbar": "simple"
      },
      "states": [
        "idle",
        "focused",
        "disabled",
        "read-only",
        "required",
        "invalid",
        "color-open",
        "selection",
        "selection-collapsed"
      ]
    }
  ]
});
export default manifest;
