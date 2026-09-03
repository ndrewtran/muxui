// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:d694882547caee375a61fbe66717a5df200c6dbc722e86e8e7ddbf3af3df08e2
export const manifest = Object.freeze({
  "schema": "muxui-react-storybook-manifest-v1",
  "generatedFrom": [
    "packages/react/generated/descriptor.json",
    "catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json",
    "catalog/components/link/examples/react/icon-composition.tsx"
  ],
  "count": 53,
  "families": [
    {
      "family": "Button",
      "tranche": "R1.1",
      "props": [
        "disabled",
        "pending"
      ],
      "defaults": {
        "disabled": false,
        "pending": false
      },
      "states": [
        "idle",
        "pending",
        "disabled"
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
      "family": "Checkbox",
      "tranche": "R1.1",
      "props": [
        "checked",
        "defaultChecked",
        "disabled",
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
        "invalid": false
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
      "family": "ToggleButton",
      "tranche": "R1.1",
      "props": [
        "selected",
        "defaultSelected",
        "disabled"
      ],
      "defaults": {
        "defaultSelected": false,
        "disabled": false,
        "selected": false
      },
      "states": [
        "idle",
        "selected",
        "disabled",
        "pressed"
      ]
    },
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
        "name"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false
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
        "readOnly",
        "required",
        "invalid",
        "name"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false
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
        "required": false
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
        "required": false
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
        "required": false
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
        "selected": false
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
        "readOnly",
        "required",
        "invalid",
        "name"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false
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
        "readOnly",
        "required",
        "invalid",
        "name"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "readOnly": false,
        "required": false
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
        "required": false
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
      "family": "RadioGroup",
      "tranche": "R1.3",
      "props": [
        "label",
        "aria-label",
        "aria-labelledby",
        "options",
        "value",
        "defaultValue",
        "disabled",
        "readOnly",
        "required",
        "invalid",
        "orientation"
      ],
      "defaults": {
        "disabled": false,
        "invalid": false,
        "orientation": "vertical",
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
        "required": false
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
        "orientation"
      ],
      "defaults": {
        "disabled": false,
        "keyboardActivation": "automatic",
        "orientation": "horizontal"
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
      "family": "ToggleButtonGroup",
      "tranche": "R1.3",
      "props": [
        "aria-label",
        "aria-labelledby",
        "selectedIds",
        "defaultSelectedIds",
        "selectionMode",
        "disabled",
        "orientation"
      ],
      "defaults": {
        "disabled": false,
        "orientation": "horizontal",
        "selectionMode": "single"
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
    }
  ]
});
export default manifest;
