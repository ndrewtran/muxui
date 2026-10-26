import { createElement } from 'react';
import type { ComponentType, ContextType, ReactElement } from 'react';
import * as RAC from 'react-aria-components';
import { substrateStateAttributes } from './styling-contract.ts';

// The substrate adapter (Decision 0031 item 16). React Aria Components set their state attributes themselves
// (`data-disabled`, `data-hovered`, ...). Each `Aria*` export below wraps one component and hands it a `render`
// function that gives the element the Mux spelling (`data-muxui-state-disabled`) before React renders it, so the server
// HTML and the client DOM carry the same names and the stylesheet selects one spelling. The wrapper picks the element
// the way React Aria does; a shared renamer prevents a rename-specific divergence, not every hydration mismatch.
//
// Every React Aria component Mux renders that can set a closed-list attribute is wrapped here, including one that
// delegates its element to another (DateInput renders a Group and a hidden Input, ColorSwatchPicker a ListBox).
// styling-tokens.test.mjs checks the wrapper definitions, every import that could bypass them, the writers in the
// installed React Aria Components and the audited React Aria versions, and renders families to see the markup.

type DomProps = Record<string, unknown>;
type Values = Record<string, unknown> | undefined;
type Render = (domProps: object, values: unknown) => ReactElement;
type ElementName = keyof React.JSX.IntrinsicElements;
type ElementOf = ElementName | ((props: DomProps, values: Values) => ElementName);

/** Gives each closed-list key the Mux spelling, in place, and keeps the keys named in `keep` under their own names too. */
function renameState(domProps: object, keep: readonly string[]): DomProps {
  const next: DomProps = {};
  for (const [key, value] of Object.entries(domProps)) {
    next[Object.hasOwn(substrateStateAttributes, key) ? substrateStateAttributes[key as keyof typeof substrateStateAttributes] : key] = value;
    if (keep.includes(key)) next[key] = value;
  }
  return next;
}

/**
 * React Aria renders a collection item as an anchor when the item's own `href` is truthy (ListBox, Menu and Tabs
 * items), so `href=""` stays a div. Read from the wrapper's props, which are the item's props, not from `domProps`,
 * where a router can rewrite the value.
 */
const itemTag = (props: DomProps): ElementName => (props.href ? 'a' : 'div');

/**
 * Wraps a React Aria component so its element carries the Mux state names. `element` is the tag React Aria renders, or
 * a function of the wrapper's props and the render values when that depends on them. A `render` the family passes is
 * kept: it receives the renamed props and still creates its own element. `keep` names attributes a React Aria hook
 * reads from the DOM, which stay under their own name as well (see the DateSegment wrapper).
 */
function withMuxState<C>(component: C, element: ElementOf, keep: readonly string[] = []): C {
  const fixed: Render | undefined = typeof element === 'string'
    ? (domProps) => createElement(element, renameState(domProps, keep))
    : undefined;
  const Wrapped = (props: DomProps & { render?: Render }) => {
    const own = props.render;
    const render: Render = own
      ? (domProps, values) => own(renameState(domProps, keep), values)
      : fixed ?? ((domProps, values) => createElement((element as Exclude<ElementOf, ElementName>)(props, values as Values), renameState(domProps, keep)));
    return createElement(component as ComponentType<DomProps & { render?: Render }>, { ...props, render });
  };
  return Wrapped as unknown as C;
}

/**
 * ColorSwatchPicker renders an inner ListBox and forwards no `render`, so its root cannot be wrapped like the others.
 * ListBox reads `render` from its context, which reaches exactly that inner element.
 */
function withMuxListBoxState<C>(component: C): C {
  const value: ContextType<typeof RAC.ListBoxContext> = { render: (domProps) => createElement('div', renameState(domProps, [])) };
  const Wrapped = (props: object) => createElement(RAC.ListBoxContext.Provider, { value }, createElement(component as ComponentType<object>, props));
  return Wrapped as unknown as C;
}

/**
 * DateInput renders a hidden form Input of its own, which reads InputContext (the date field supplies it) and takes no
 * `render` from us. A provider that adds a `render` to the field's own context value gives that input the Mux names too.
 * This reaches a DateInput inside a DateField or TimeField. In a DatePicker or DateRangePicker, DateInput builds its own
 * InputContext below this provider, so that hidden input keeps `data-disabled` (see state-matrix.mjs).
 */
function withMuxInputState<C>(component: C): C {
  const Wrapped = (props: object) => {
    const parent = RAC.useSlottedContext(RAC.InputContext);
    const value = { ...parent, render: (domProps: object) => createElement('input', renameState(domProps, [])) } as ContextType<typeof RAC.InputContext>;
    return createElement(RAC.InputContext.Provider, { value }, createElement(component as ComponentType<object>, props));
  };
  return Wrapped as unknown as C;
}

/** @internal */
export const AriaBreadcrumb = /*#__PURE__*/ withMuxState(RAC.Breadcrumb, 'li');
/** @internal */
export const AriaButton = /*#__PURE__*/ withMuxState(RAC.Button, 'button');
/** @internal */
export const AriaCalendar = /*#__PURE__*/ withMuxState(RAC.Calendar, 'div');
/** @internal */
export const AriaRangeCalendar = /*#__PURE__*/ withMuxState(RAC.RangeCalendar, 'div');
/** @internal */
export const AriaCalendarCell = /*#__PURE__*/ withMuxState(RAC.CalendarCell, 'div');
/** @internal */
export const AriaCheckbox = /*#__PURE__*/ withMuxState(RAC.Checkbox, 'label');
/** @internal */
export const AriaCheckboxButton = /*#__PURE__*/ withMuxState(RAC.CheckboxButton, 'label');
/** @internal */
export const AriaCheckboxField = /*#__PURE__*/ withMuxState(RAC.CheckboxField, 'div');
/** @internal */
export const AriaCheckboxGroup = /*#__PURE__*/ withMuxState(RAC.CheckboxGroup, 'div');
/** @internal */
export const AriaColorArea = /*#__PURE__*/ withMuxState(RAC.ColorArea, 'div');
/** @internal */
export const AriaColorField = /*#__PURE__*/ withMuxState(RAC.ColorField, 'div');
/** @internal */
export const AriaColorSlider = /*#__PURE__*/ withMuxState(RAC.ColorSlider, 'div');
/** @internal */
export const AriaColorThumb = /*#__PURE__*/ withMuxState(RAC.ColorThumb, 'div');
/** @internal */
export const AriaColorWheel = /*#__PURE__*/ withMuxState(RAC.ColorWheel, 'div');
/** @internal */
export const AriaColorWheelTrack = /*#__PURE__*/ withMuxState(RAC.ColorWheelTrack, 'div');
/** @internal */
export const AriaColorSwatchPicker = /*#__PURE__*/ withMuxListBoxState(RAC.ColorSwatchPicker);
/** @internal */
export const AriaColorSwatchPickerItem = /*#__PURE__*/ withMuxState(RAC.ColorSwatchPickerItem, 'div');
/** @internal */
export const AriaComboBox = /*#__PURE__*/ withMuxState(RAC.ComboBox, 'div');
/**
 * @internal
 * Both calls are annotated: with only the outer one a bundler keeps `RAC.DateInput` (and React Aria's date code with it)
 * in every bundle that imports the substrate.
 */
export const AriaDateInput = /*#__PURE__*/ withMuxInputState(/*#__PURE__*/ withMuxState(RAC.DateInput, 'div'));
/** @internal */
export const AriaDateField = /*#__PURE__*/ withMuxState(RAC.DateField, 'div');
/** @internal */
export const AriaDatePicker = /*#__PURE__*/ withMuxState(RAC.DatePicker, 'div');
/** @internal */
export const AriaDateRangePicker = /*#__PURE__*/ withMuxState(RAC.DateRangePicker, 'div');
// React Aria's useDatePickerGroup reads `data-placeholder` from the DOM to decide where a click in the padding of an
// empty date input focuses, so date and time segments keep it beside `data-muxui-state-placeholder`. It is React
// Aria's functional attribute, not Mux styling contract: no authored style selects it.
/** @internal */
export const AriaDateSegment = /*#__PURE__*/ withMuxState(RAC.DateSegment, 'span', ['data-placeholder']);
/** @internal */
export const AriaTimeField = /*#__PURE__*/ withMuxState(RAC.TimeField, 'div');
/** @internal */
export const AriaDisclosure = /*#__PURE__*/ withMuxState(RAC.Disclosure, 'div');
/** @internal */
export const AriaDisclosureGroup = /*#__PURE__*/ withMuxState(RAC.DisclosureGroup, 'div');
/** @internal */
export const AriaDropZone = /*#__PURE__*/ withMuxState(RAC.DropZone, 'div');
/** @internal */
export const AriaGridList = /*#__PURE__*/ withMuxState(RAC.GridList, 'div');
/** @internal */
export const AriaGridListItem = /*#__PURE__*/ withMuxState(RAC.GridListItem, 'div');
/** @internal */
export const AriaGroup = /*#__PURE__*/ withMuxState(RAC.Group, 'div');
/** @internal */
export const AriaInput = /*#__PURE__*/ withMuxState(RAC.Input, 'input');
/** @internal */
export const AriaLink = /*#__PURE__*/ withMuxState(RAC.Link, (props, values) => (props.href && !values?.isDisabled ? 'a' : 'span'));
/** @internal */
export const AriaListBox = /*#__PURE__*/ withMuxState(RAC.ListBox, 'div');
/** @internal */
export const AriaListBoxItem = /*#__PURE__*/ withMuxState(RAC.ListBoxItem, itemTag);
/** @internal */
export const AriaMenu = /*#__PURE__*/ withMuxState(RAC.Menu, 'div');
/** @internal */
export const AriaMenuItem = /*#__PURE__*/ withMuxState(RAC.MenuItem, itemTag);
/** @internal */
export const AriaModal = /*#__PURE__*/ withMuxState(RAC.Modal, 'div');
/** @internal */
export const AriaModalOverlay = /*#__PURE__*/ withMuxState(RAC.ModalOverlay, 'div');
/** @internal */
export const AriaNumberField = /*#__PURE__*/ withMuxState(RAC.NumberField, 'div');
/** @internal */
export const AriaOverlayArrow = /*#__PURE__*/ withMuxState(RAC.OverlayArrow, 'div');
/** @internal */
export const AriaPopover = /*#__PURE__*/ withMuxState(RAC.Popover, 'div');
/** @internal */
export const AriaRadio = /*#__PURE__*/ withMuxState(RAC.Radio, 'label');
/** @internal */
export const AriaRadioButton = /*#__PURE__*/ withMuxState(RAC.RadioButton, 'label');
/** @internal */
export const AriaRadioField = /*#__PURE__*/ withMuxState(RAC.RadioField, 'div');
/** @internal */
export const AriaRadioGroup = /*#__PURE__*/ withMuxState(RAC.RadioGroup, 'div');
/** @internal */
export const AriaSearchField = /*#__PURE__*/ withMuxState(RAC.SearchField, 'div');
/** @internal */
export const AriaSelect = /*#__PURE__*/ withMuxState(RAC.Select, 'div');
/** @internal */
export const AriaSelectValue = /*#__PURE__*/ withMuxState(RAC.SelectValue, 'span');
/** @internal */
export const AriaSlider = /*#__PURE__*/ withMuxState(RAC.Slider, 'div');
/** @internal */
export const AriaSliderFill = /*#__PURE__*/ withMuxState(RAC.SliderFill, 'div');
/** @internal */
export const AriaSliderOutput = /*#__PURE__*/ withMuxState(RAC.SliderOutput, 'output');
/** @internal */
export const AriaSliderThumb = /*#__PURE__*/ withMuxState(RAC.SliderThumb, 'div');
/** @internal */
export const AriaSliderTrack = /*#__PURE__*/ withMuxState(RAC.SliderTrack, 'div');
/** @internal */
export const AriaSwitch = /*#__PURE__*/ withMuxState(RAC.Switch, 'label');
/** @internal */
export const AriaSwitchButton = /*#__PURE__*/ withMuxState(RAC.SwitchButton, 'label');
/** @internal */
export const AriaSwitchField = /*#__PURE__*/ withMuxState(RAC.SwitchField, 'div');
/** @internal */
export const AriaTab = /*#__PURE__*/ withMuxState(RAC.Tab, itemTag);
/** @internal */
export const AriaTabList = /*#__PURE__*/ withMuxState(RAC.TabList, 'div');
/** @internal */
export const AriaTabPanel = /*#__PURE__*/ withMuxState(RAC.TabPanel, 'div');
/** @internal */
export const AriaTabs = /*#__PURE__*/ withMuxState(RAC.Tabs, 'div');
/** @internal */
export const AriaTag = /*#__PURE__*/ withMuxState(RAC.Tag, 'div');
/** @internal */
export const AriaTagList = /*#__PURE__*/ withMuxState(RAC.TagList, 'div');
/** @internal */
export const AriaTextArea = /*#__PURE__*/ withMuxState(RAC.TextArea, 'textarea');
/** @internal */
export const AriaTextField = /*#__PURE__*/ withMuxState(RAC.TextField, 'div');
/** @internal */
export const AriaToggleButton = /*#__PURE__*/ withMuxState(RAC.ToggleButton, 'button');
/** @internal */
export const AriaToggleButtonGroup = /*#__PURE__*/ withMuxState(RAC.ToggleButtonGroup, 'div');
/** @internal */
export const AriaToken = /*#__PURE__*/ withMuxState(RAC.Token, 'span');
/** @internal */
export const AriaTokenField = /*#__PURE__*/ withMuxState(RAC.TokenField, 'div');
/** @internal */
export const AriaTokenInput = /*#__PURE__*/ withMuxState(RAC.TokenInput, 'div');
/** @internal */
export const AriaToolbar = /*#__PURE__*/ withMuxState(RAC.Toolbar, 'div');
/** @internal */
export const AriaTooltip = /*#__PURE__*/ withMuxState(RAC.Tooltip, 'div');
/** @internal */
export const AriaTree = /*#__PURE__*/ withMuxState(RAC.Tree, 'div');
/** @internal */
export const AriaTreeItem = /*#__PURE__*/ withMuxState(RAC.TreeItem, 'div');
/** @internal */
export const AriaToast = /*#__PURE__*/ withMuxState(RAC.UNSTABLE_Toast, 'div');
/** @internal */
export const AriaToastRegion = /*#__PURE__*/ withMuxState(RAC.UNSTABLE_ToastRegion, 'div');
// The table family renders native table elements as Mux composes it. React Aria renders divs only when a Table sits
// inside a Virtualizer, a composition Mux does not make (virtualizer.ts serves ListBox and GridList).
/** @internal */
export const AriaTable = /*#__PURE__*/ withMuxState(RAC.Table, 'table');
/** @internal */
export const AriaTableHeader = /*#__PURE__*/ withMuxState(RAC.TableHeader, 'thead');
/** @internal */
export const AriaTableBody = /*#__PURE__*/ withMuxState(RAC.TableBody, 'tbody');
/** @internal */
export const AriaRow = /*#__PURE__*/ withMuxState(RAC.Row, 'tr');
/** @internal */
export const AriaCell = /*#__PURE__*/ withMuxState(RAC.Cell, 'td');
/** @internal */
export const AriaColumn = /*#__PURE__*/ withMuxState(RAC.Column, 'th');
