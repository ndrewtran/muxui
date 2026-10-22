import type * as React from 'react';

export type ButtonPointerType = 'mouse' | 'pen' | 'touch' | 'keyboard' | 'virtual' | undefined;
export type ComponentPointerType = ButtonPointerType;
export interface ButtonActivationEvent {
  readonly type: 'activate';
  readonly pointerType: ButtonPointerType;
  readonly target: HTMLButtonElement;
}
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'disabled' | 'onClick' | 'style'> {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pending?: boolean;
  showTextWhileLoading?: boolean;
  variant?: 'primary' | 'neutral' | 'ghost' | 'danger' | 'danger-neutral' | 'danger-ghost' | 'inverse';
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  onActivate?: (event: ButtonActivationEvent) => void;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export interface BreadcrumbItem { id?: string; label: React.ReactNode; href?: string; disabled?: boolean; }
export interface BreadcrumbsProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className' | 'aria-label'> { items?: BreadcrumbItem[]; className?: string; 'aria-label': string; onNavigate?: (item: BreadcrumbItem) => void; }
export declare const Breadcrumbs: React.ForwardRefExoticComponent<BreadcrumbsProps & React.RefAttributes<HTMLElement>>;
export interface CheckboxProps extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'children' | 'className' | 'onChange'> { children?: React.ReactNode; className?: string; checked?: boolean; defaultChecked?: boolean; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; indeterminate?: boolean; invalid?: boolean; name?: string; required?: boolean; value?: string; onChange?: (checked: boolean) => void; }
export declare const Checkbox: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLLabelElement>>;
export interface DisclosureProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'id' | 'title'> { title: React.ReactNode; children?: React.ReactNode; id?: string; expanded?: boolean; defaultExpanded?: boolean; disabled?: boolean; className?: string; onExpandedChange?: (expanded: boolean) => void; }
export declare const Disclosure: React.ForwardRefExoticComponent<DisclosureProps & React.RefAttributes<HTMLDivElement>>;
export interface DisclosureGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> { children?: React.ReactNode; expandedIds?: string[]; defaultExpandedIds?: string[]; multiple?: boolean; disabled?: boolean; className?: string; onExpandedChange?: (expandedIds: string[]) => void; }
export declare const DisclosureGroup: React.ForwardRefExoticComponent<DisclosureGroupProps & React.RefAttributes<HTMLDivElement>>;
export interface GroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'role'> { children?: React.ReactNode; className?: string; disabled?: boolean; invalid?: boolean; readOnly?: boolean; role?: 'group' | 'region' | 'presentation'; }
export declare const Group: React.ForwardRefExoticComponent<GroupProps & React.RefAttributes<HTMLDivElement>>;
export interface LinkActivationEvent { readonly type: 'activate'; readonly pointerType: ComponentPointerType; readonly target: HTMLAnchorElement; }
export interface LinkProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className' | 'onClick'> { children?: React.ReactNode; className?: string; href?: string; disabled?: boolean; current?: boolean; target?: string; rel?: string; onActivate?: (event: LinkActivationEvent) => void; }
export declare const Link: React.ForwardRefExoticComponent<LinkProps & React.RefAttributes<HTMLElement>>;
export interface MeterProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> { label: React.ReactNode; value?: number; minValue?: number; maxValue?: number; formatOptions?: Intl.NumberFormatOptions; className?: string; }
export declare const Meter: React.ForwardRefExoticComponent<MeterProps & React.RefAttributes<HTMLDivElement>>;
export interface ProgressBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> { label: React.ReactNode; value?: number; minValue?: number; maxValue?: number; className?: string; }
export declare const ProgressBar: React.ForwardRefExoticComponent<ProgressBarProps & React.RefAttributes<HTMLDivElement>>;
export interface SeparatorProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className'> { orientation?: 'horizontal' | 'vertical'; className?: string; }
export declare const Separator: React.ForwardRefExoticComponent<SeparatorProps & React.RefAttributes<HTMLElement>>;
export interface ToggleButtonActivationEvent { readonly type: 'activate'; readonly pointerType: ComponentPointerType; readonly target: HTMLButtonElement; }
export interface ToggleButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'onChange' | 'onClick'> { children?: React.ReactNode; className?: string; selected?: boolean; defaultSelected?: boolean; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; onChange?: (selected: boolean) => void; onActivate?: (event: ToggleButtonActivationEvent) => void; }
export declare const ToggleButton: React.ForwardRefExoticComponent<ToggleButtonProps & React.RefAttributes<HTMLButtonElement>>;
export const reactCompatibility: Readonly<Record<string, unknown>>;

export type MuxUIDateValue = string;
export type MuxUITimeValue = string;
export interface MuxUIDateRange { start: MuxUIDateValue; end: MuxUIDateValue; }
export type ControlSize = 'sm' | 'md' | 'lg';
export interface FieldValidationProps { description?: React.ReactNode; /** Shown only while the field is invalid, through the invalid prop or failed validation, and replaces the built-in message; it never makes the field invalid by itself. */ errorMessage?: React.ReactNode; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; size?: ControlSize; className?: string; }
export type MuxUIAccessibleName =
  | { label: Exclude<React.ReactNode, null | undefined | boolean>; 'aria-label'?: never; 'aria-labelledby'?: never }
  | { label?: never; 'aria-label': string; 'aria-labelledby'?: never }
  | { label?: never; 'aria-label'?: never; 'aria-labelledby': string };
export type MuxUIAriaAccessibleName =
  | { 'aria-label': string; 'aria-labelledby'?: never }
  | { 'aria-label'?: never; 'aria-labelledby': string };
export type MuxUIAriaLabel = { 'aria-label': string };
export type NamedFieldProps = FieldValidationProps & MuxUIAccessibleName;
export type FieldInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'children' | 'dangerouslySetInnerHTML' | 'slot' | 'type' | 'id' | 'name' | 'value' | 'defaultValue' | 'checked' | 'defaultChecked' | 'disabled' | 'readOnly' | 'required' | 'onChange' | 'onInput' | 'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'aria-errormessage' | 'aria-invalid' | 'aria-required' | 'aria-disabled' | 'aria-readonly'>;
export type TextFieldProps = NamedFieldProps & { id?: string; inputRef?: React.Ref<HTMLInputElement>; inputProps?: FieldInputProps; value?: string; defaultValue?: string; onChange?: (value: string) => void; name?: string; placeholder?: string; type?: 'text' | 'email' | 'password' | 'url' | 'tel'; autoComplete?: React.InputHTMLAttributes<HTMLInputElement>['autoComplete']; autoFocus?: React.InputHTMLAttributes<HTMLInputElement>['autoFocus']; inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode']; maxLength?: React.InputHTMLAttributes<HTMLInputElement>['maxLength']; minLength?: React.InputHTMLAttributes<HTMLInputElement>['minLength']; pattern?: React.InputHTMLAttributes<HTMLInputElement>['pattern']; spellCheck?: React.InputHTMLAttributes<HTMLInputElement>['spellCheck']; };
export declare const TextField: React.ForwardRefExoticComponent<TextFieldProps & React.RefAttributes<HTMLDivElement>>;
export type SearchFieldProps = NamedFieldProps & { id?: string; inputRef?: React.Ref<HTMLInputElement>; inputProps?: FieldInputProps; value?: string; defaultValue?: string; onChange?: (value: string) => void; onSubmit?: (value: string) => void; onClear?: () => void; name?: string; placeholder?: string; };
export declare const SearchField: React.ForwardRefExoticComponent<SearchFieldProps & React.RefAttributes<HTMLDivElement>>;
export type NumberFieldProps = NamedFieldProps & { value?: number; defaultValue?: number; onChange?: (value: number) => void; name?: string; minValue?: number; maxValue?: number; step?: number; formatOptions?: Intl.NumberFormatOptions; };
export declare const NumberField: React.ForwardRefExoticComponent<NumberFieldProps & React.RefAttributes<HTMLDivElement>>;
export type CheckboxGroupProps = NamedFieldProps & { value?: string[]; defaultValue?: string[]; onChange?: (value: string[]) => void; name?: string; orientation?: 'vertical' | 'horizontal'; size?: 'sm' | 'md' | 'lg'; children?: React.ReactNode; };
export declare const CheckboxGroup: React.ForwardRefExoticComponent<CheckboxGroupProps & React.RefAttributes<HTMLDivElement>>;
export type SwitchProps = MuxUIAccessibleName & { description?: React.ReactNode; /** Shown only while the field is invalid, through the invalid prop or failed validation; replaces the built-in message. */ errorMessage?: React.ReactNode; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; size?: ControlSize; className?: string; children?: React.ReactNode; selected?: boolean; defaultSelected?: boolean; onChange?: (selected: boolean) => void; name?: string; value?: string; };
export declare const Switch: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLDivElement>>;
export type MuxUIValidationErrors = Readonly<Record<string, string | string[]>>;
export interface FormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'children' | 'className' | 'onSubmit' | 'onReset'> { children?: React.ReactNode; className?: string; validationBehavior?: 'aria' | 'native'; validationErrors?: MuxUIValidationErrors; onSubmit?: React.FormEventHandler<HTMLFormElement>; onReset?: React.FormEventHandler<HTMLFormElement>; }
export declare const Form: React.ForwardRefExoticComponent<FormProps & React.RefAttributes<HTMLFormElement>>;
export type DateFieldProps = NamedFieldProps & { value?: MuxUIDateValue | null; defaultValue?: MuxUIDateValue; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue) => boolean; onChange?: (value: MuxUIDateValue | null) => void; name?: string; };
export declare const DateField: React.ForwardRefExoticComponent<DateFieldProps & React.RefAttributes<HTMLDivElement>>;
/** TimeField works at minute precision: HH:mm:ss values and bounds are accepted, their seconds are ignored, and values submit and emit as HH:mm. */
export type TimeFieldProps = NamedFieldProps & { value?: MuxUITimeValue | null; defaultValue?: MuxUITimeValue; minValue?: MuxUITimeValue; maxValue?: MuxUITimeValue; onChange?: (value: MuxUITimeValue | null) => void; name?: string; size?: ControlSize; };
export declare const TimeField: React.ForwardRefExoticComponent<TimeFieldProps & React.RefAttributes<HTMLDivElement>>;
export type DatePickerProps = DateFieldProps & { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; };
export declare const DatePicker: React.ForwardRefExoticComponent<DatePickerProps & React.RefAttributes<HTMLDivElement>>;
export type DateRangePickerProps = NamedFieldProps & { value?: MuxUIDateRange | null; defaultValue?: MuxUIDateRange; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue, anchorDate: MuxUIDateValue | null) => boolean; open?: boolean; defaultOpen?: boolean; onChange?: (value: MuxUIDateRange | null) => void; startName?: string; endName?: string; onOpenChange?: (open: boolean) => void; };
export declare const DateRangePicker: React.ForwardRefExoticComponent<DateRangePickerProps & React.RefAttributes<HTMLDivElement>>;
export interface AutocompleteItem { id?: string; label?: React.ReactNode; value?: string; disabled?: boolean; }
export interface AutocompleteSelectionItem { id: string; label: React.ReactNode; value: string; }
export type AutocompleteProps = NamedFieldProps & { items?: Array<AutocompleteItem | string>; /** The submitted value; the input shows a matching item's label. */ value?: string; defaultValue?: string; onChange?: (value: string) => void; onSelect?: (item?: AutocompleteSelectionItem) => void; name?: string; placeholder?: string; size?: 'sm' | 'md' | 'lg'; };
export declare const Autocomplete: React.ForwardRefExoticComponent<AutocompleteProps & React.RefAttributes<HTMLDivElement>>;

/** A CSS color string. A color control's onChange returns one in the color space of its value, of an enclosing ColorPicker's color, or of its defaultValue: rgba(r, g, b, a) for hex and rgb, hsla(h, s%, l%, a) for hsl and hsb. ColorSlider with colorSpace uses that space, and ColorSwatchPicker returns the chosen item's color. */
export type MuxUIColorValue = string;
export type MuxUIColorSpace = 'rgb' | 'hsl' | 'hsb';
/** Channels must belong to colorSpace, or, when colorSpace is omitted, to the space of an enclosing ColorPicker's color, otherwise value or defaultValue. */
export type MuxUIColorChannel = 'red' | 'green' | 'blue' | 'hue' | 'saturation' | 'lightness' | 'brightness' | 'alpha';
export interface MuxUICollectionItem { id?: string; key?: string; label?: React.ReactNode; /** Consumer data; named Select and ComboBox forms submit the item `id`, not `value`. */ value?: string; textValue?: string; disabled?: boolean; [key: string]: unknown; }
export type MuxUISelection = string[] | 'all';
export type MuxUIItems = Array<MuxUICollectionItem | string>;
export type CalendarProps = MuxUIAccessibleName & { value?: MuxUIDateValue | null; defaultValue?: MuxUIDateValue; focusedValue?: MuxUIDateValue; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue) => boolean; onChange?: (value?: MuxUIDateValue) => void; onFocusChange?: (value?: MuxUIDateValue) => void; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; className?: string; };
export declare const Calendar: React.ForwardRefExoticComponent<CalendarProps & React.RefAttributes<HTMLDivElement>>;
export type RangeCalendarProps = MuxUIAccessibleName & { value?: MuxUIDateRange | null; defaultValue?: MuxUIDateRange; focusedValue?: MuxUIDateValue; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue) => boolean; onChange?: (value?: MuxUIDateRange) => void; onFocusChange?: (value?: MuxUIDateValue) => void; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; className?: string; };
export declare const RangeCalendar: React.ForwardRefExoticComponent<RangeCalendarProps & React.RefAttributes<HTMLDivElement>>;
export type ColorAreaProps = MuxUIAccessibleName & { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; disabled?: boolean; readOnly?: boolean; onChange?: (value: MuxUIColorValue) => void; className?: string; };
export declare const ColorArea: React.ForwardRefExoticComponent<ColorAreaProps & React.RefAttributes<HTMLDivElement>>;
export type ColorFieldProps = NamedFieldProps & { value?: MuxUIColorValue | null; defaultValue?: MuxUIColorValue; onChange?: (value: MuxUIColorValue | null) => void; name?: string; size?: ControlSize; };
export declare const ColorField: React.ForwardRefExoticComponent<ColorFieldProps & React.RefAttributes<HTMLDivElement>>;
export type ColorPickerProps = { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; disabled?: boolean; readOnly?: boolean; onChange?: (value: MuxUIColorValue) => void; children?: React.ReactNode; className?: string; };
export declare const ColorPicker: React.ForwardRefExoticComponent<ColorPickerProps & React.RefAttributes<HTMLDivElement>>;
export type ColorSliderProps = MuxUIAccessibleName & { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; channel?: MuxUIColorChannel; colorSpace?: MuxUIColorSpace; disabled?: boolean; readOnly?: boolean; orientation?: 'horizontal' | 'vertical'; onChange?: (value: MuxUIColorValue) => void; className?: string; };
export declare const ColorSlider: React.ForwardRefExoticComponent<ColorSliderProps & React.RefAttributes<HTMLDivElement>>;
export type ColorSwatchProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'color'> & { color: MuxUIColorValue; secondaryColor?: MuxUIColorValue; shape?: 'square' | 'circle'; colorName?: string; disabled?: boolean; };
export declare const ColorSwatch: React.ForwardRefExoticComponent<ColorSwatchProps & React.RefAttributes<HTMLDivElement>>;
export type ColorSwatchPickerProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; value?: MuxUIColorValue | null; defaultValue?: MuxUIColorValue; disabled?: boolean; readOnly?: boolean; onChange?: (value: MuxUIColorValue) => void; className?: string; };
export declare const ColorSwatchPicker: React.ForwardRefExoticComponent<ColorSwatchPickerProps & React.RefAttributes<HTMLDivElement>>;
export type ColorWheelProps = MuxUIAriaAccessibleName & { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; outerRadius?: number; innerRadius?: number; disabled?: boolean; readOnly?: boolean; onChange?: (value: MuxUIColorValue) => void; className?: string; };
export declare const ColorWheel: React.ForwardRefExoticComponent<ColorWheelProps & React.RefAttributes<HTMLDivElement>>;
export type CollectionProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; selectedIds?: MuxUISelection; defaultSelectedIds?: MuxUISelection; disabled?: boolean; selectionMode?: 'none' | 'single' | 'multiple'; onSelectionChange?: (ids: MuxUISelection) => void; onAction?: (item?: MuxUICollectionItem) => void; className?: string; };
export type GridListProps = CollectionProps & { children?: React.ReactNode; style?: React.CSSProperties; layout?: 'stack' | 'grid'; orientation?: 'vertical' | 'horizontal'; };
export type GridListItemProps = { id: string; textValue?: string; disabled?: boolean; className?: string; style?: React.CSSProperties; children?: React.ReactNode; };
export declare const GridList: React.ForwardRefExoticComponent<GridListProps & React.RefAttributes<HTMLDivElement>> & {
  Item: React.ForwardRefExoticComponent<GridListItemProps & React.RefAttributes<HTMLDivElement>>;
};
export type ListBoxProps = CollectionProps & { children?: React.ReactNode; style?: React.CSSProperties; layout?: 'stack' | 'grid'; orientation?: 'vertical' | 'horizontal'; };
export type ListBoxItemProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> & { id: string; textValue?: string; disabled?: boolean; };
export type ListBoxSectionProps = Omit<React.HTMLAttributes<HTMLElement>, 'title'> & { title?: React.ReactNode; };
export declare const ListBox: React.ForwardRefExoticComponent<ListBoxProps & React.RefAttributes<HTMLDivElement>> & {
  Root: React.ForwardRefExoticComponent<ListBoxProps & React.RefAttributes<HTMLDivElement>>;
  Section: React.ForwardRefExoticComponent<ListBoxSectionProps & React.RefAttributes<HTMLElement>>;
  Header: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Item: React.ForwardRefExoticComponent<ListBoxItemProps & React.RefAttributes<HTMLDivElement>>;
};
export type MenuProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; disabled?: boolean; shouldCloseOnSelect?: boolean; onAction?: (item?: MuxUICollectionItem) => void; onSelect?: (item?: MuxUICollectionItem) => void; children?: React.ReactNode; className?: string; };
export type MenuRootProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; disabled?: boolean; shouldCloseOnSelect?: boolean; onAction?: (item?: MuxUICollectionItem) => void; onSelect?: (item?: MuxUICollectionItem) => void; };
export type MenuListProps = Omit<MenuProps, 'aria-label' | 'aria-labelledby'> & { 'aria-label'?: string; 'aria-labelledby'?: string; };
export type MenuItemProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> & { id: string; textValue?: string; disabled?: boolean; onAction?: () => void; shouldCloseOnSelect?: boolean; };
export type MenuSectionProps = Omit<React.HTMLAttributes<HTMLElement>, 'title'> & { title?: React.ReactNode; };
export type MenuPopupProps = React.HTMLAttributes<HTMLDivElement> & { placement?: MuxUIPlacement; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; anchorRef?: React.RefObject<Element | null>; modal?: boolean; };
export type MenuTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { onActivate?: (event: ButtonActivationEvent) => void; };
export type MenuSubmenuProps = { children: React.ReactNode; delay?: number; };
export declare const Menu: React.ForwardRefExoticComponent<MenuProps & React.RefAttributes<HTMLDivElement>> & {
  Root: React.ForwardRefExoticComponent<MenuRootProps & React.RefAttributes<HTMLDivElement>>;
  Trigger: React.ForwardRefExoticComponent<MenuTriggerProps & React.RefAttributes<HTMLButtonElement>>;
  Popup: React.ForwardRefExoticComponent<MenuPopupProps & React.RefAttributes<HTMLDivElement>>;
  List: React.ForwardRefExoticComponent<MenuListProps & React.RefAttributes<HTMLDivElement>>;
  Item: React.ForwardRefExoticComponent<MenuItemProps & React.RefAttributes<HTMLDivElement>>;
  Submenu: (props: MenuSubmenuProps) => React.ReactElement;
  Section: React.ForwardRefExoticComponent<MenuSectionProps & React.RefAttributes<HTMLElement>>;
  Header: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Separator: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLHRElement> & React.RefAttributes<HTMLHRElement>>;
};
export type RadioOption = { id?: string; value: string; label?: React.ReactNode; disabled?: boolean; };
export type RadioGroupProps = MuxUIAccessibleName & { /** Shown once for the whole group, only while the group is invalid, through the invalid prop or failed validation, and replaces the built-in message; it never makes the group invalid by itself. */ errorMessage?: React.ReactNode; options?: RadioOption[]; children?: React.ReactNode; value?: string; defaultValue?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; orientation?: 'vertical' | 'horizontal'; size?: 'sm' | 'md' | 'lg'; name?: string; onChange?: (value: string) => void; className?: string; };
export declare const RadioGroup: React.ForwardRefExoticComponent<RadioGroupProps & React.RefAttributes<HTMLDivElement>>;
export type SelectProps = NamedFieldProps & SelectOptions;
export type SelectOptions = { items?: MuxUIItems; value?: string; defaultValue?: string; open?: boolean; defaultOpen?: boolean; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; size?: ControlSize; name?: string; placeholder?: string; selectedContent?: React.ReactNode; trigger?: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement> & React.RefAttributes<HTMLButtonElement>, 'button'>; placement?: MuxUIPlacement; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; anchorRef?: React.RefObject<Element | null>; modal?: boolean; children?: React.ReactNode; onChange?: (value?: string) => void; onOpenChange?: (open: boolean) => void; };
export type SelectRootProps = SelectOptions & FieldValidationProps & (MuxUIAccessibleName | { children: React.ReactNode; label?: React.ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string; });
export type SelectTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
export type SelectItemProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> & { id: string; textValue?: string; disabled?: boolean; };
export type SelectPopupProps = React.HTMLAttributes<HTMLDivElement> & { placement?: MuxUIPlacement; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; anchorRef?: React.RefObject<Element | null>; modal?: boolean; };
export declare const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<HTMLDivElement>> & {
  Root: React.ForwardRefExoticComponent<SelectRootProps & React.RefAttributes<HTMLDivElement>>;
  Label: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Trigger: React.ForwardRefExoticComponent<SelectTriggerProps & React.RefAttributes<HTMLButtonElement>>;
  Value: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Popup: React.ForwardRefExoticComponent<SelectPopupProps & React.RefAttributes<HTMLDivElement>>;
  List: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & { items?: MuxUIItems; } & React.RefAttributes<HTMLDivElement>>;
  Item: React.ForwardRefExoticComponent<SelectItemProps & React.RefAttributes<HTMLDivElement>>;
  Description: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Error: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
};
export type ComboBoxProps = NamedFieldProps & { /** The full option set, filtered as the user types by a case- and accent-insensitive contains match on each item's text. */ items?: MuxUIItems; value?: string; defaultValue?: string; /** The selected item's id. A controlled field with no selection passes null; an empty string throws. */ selectedId?: string | null; defaultSelectedId?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; size?: ControlSize; name?: string; placeholder?: string; onChange?: (value: string) => void; /** Called with the chosen item, or with no item when the selection clears. */ onSelect?: (item?: MuxUICollectionItem) => void; };
export declare const ComboBox: React.ForwardRefExoticComponent<ComboBoxProps & React.RefAttributes<HTMLDivElement>>;
export type SliderProps = MuxUIAccessibleName & { value?: number; defaultValue?: number; min?: number; max?: number; step?: number; disabled?: boolean; readOnly?: boolean; orientation?: 'horizontal' | 'vertical'; name?: string; onChange?: (value: number) => void; onChangeEnd?: (value: number) => void; className?: string; };
export declare const Slider: React.ForwardRefExoticComponent<SliderProps & React.RefAttributes<HTMLDivElement>>;
export interface MuxUITableColumn extends MuxUICollectionItem { isRowHeader?: boolean; sortable?: boolean; }
export interface MuxUITableRow extends MuxUICollectionItem { values?: Record<string, React.ReactNode>; }
export type MuxUITableSortDescriptor = { column: string; direction: 'ascending' | 'descending'; };
export type TableProps = MuxUIAriaLabel & { columns?: MuxUITableColumn[]; rows?: MuxUITableRow[]; selectedIds?: MuxUISelection; defaultSelectedIds?: MuxUISelection; sortDescriptor?: MuxUITableSortDescriptor; disabled?: boolean; selectionMode?: 'none' | 'single' | 'multiple'; onSelectionChange?: (ids: MuxUISelection) => void; onRowAction?: (row?: MuxUITableRow) => void; onSortChange?: (next: MuxUITableSortDescriptor) => void; className?: string; };
export declare const Table: React.ForwardRefExoticComponent<TableProps & React.RefAttributes<HTMLTableElement>>;
export type TabsProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; value?: string; defaultValue?: string; disabled?: boolean; orientation?: 'horizontal' | 'vertical'; keyboardActivation?: 'automatic' | 'manual'; size?: ControlSize; variant?: 'underline' | 'pill' | 'overflow' | 'segment'; onChange?: (value: string) => void; className?: string; };
export declare const Tabs: React.ForwardRefExoticComponent<TabsProps & React.RefAttributes<HTMLDivElement>>;
/** A TagGroup colour: neutral, the theme's brand, a status, or a fixed hue family. */
export type TagGroupColor = 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald' | 'teal' | 'bluegreen' | 'cyan' | 'sky' | 'indigo' | 'violet' | 'purple' | 'fuchsia' | 'pink' | 'rose';
export type TagGroupVariant = 'soft' | 'outline' | 'dot' | 'strong';
export type TagGroupItem = MuxUICollectionItem & { /** Overrides the group's color for this tag. */ color?: TagGroupColor; };
export type TagGroupProps = MuxUIAccessibleName & { items?: Array<TagGroupItem | string>; variant?: TagGroupVariant; /** The default color of every tag; an item's own color wins. */ color?: TagGroupColor; selectionMode?: 'none' | 'single' | 'multiple'; /** The selected item ids. */ selectedKeys?: Set<string>; defaultSelectedKeys?: Set<string>; onSelectionChange?: (keys: Set<string>) => void; disabled?: boolean; onRemove?: (items: TagGroupItem[]) => void; onAction?: (item?: TagGroupItem) => void; className?: string; };
export declare const TagGroup: React.ForwardRefExoticComponent<TagGroupProps & React.RefAttributes<HTMLDivElement>>;
export type ToggleButtonGroupProps = MuxUIAriaAccessibleName & { selectedIds?: readonly string[]; defaultSelectedIds?: readonly string[]; selectionMode?: 'single' | 'multiple'; disabled?: boolean; orientation?: 'horizontal' | 'vertical'; disallowEmptySelection?: boolean; size?: 'sm' | 'md' | 'lg'; onSelectionChange?: (ids: readonly string[]) => void; children?: React.ReactNode; className?: string; };
export declare const ToggleButtonGroup: React.ForwardRefExoticComponent<ToggleButtonGroupProps & React.RefAttributes<HTMLDivElement>>;
export type TokenFieldProps = MuxUIAccessibleName & { value?: string[]; defaultValue?: string[]; disabled?: boolean; readOnly?: boolean; name?: string; placeholder?: string; onChange?: (value: string[]) => void; className?: string; };
export declare const TokenField: React.ForwardRefExoticComponent<TokenFieldProps & React.RefAttributes<HTMLDivElement>>;
export type ToolbarProps = MuxUIAriaAccessibleName & { orientation?: 'horizontal' | 'vertical'; children?: React.ReactNode; className?: string; };
export declare const Toolbar: React.ForwardRefExoticComponent<ToolbarProps & React.RefAttributes<HTMLDivElement>>;
export interface MuxUITreeItem extends MuxUICollectionItem { children?: MuxUITreeItem[]; items?: MuxUITreeItem[]; }
export type TreeProps = MuxUIAriaAccessibleName & { items?: MuxUITreeItem[]; selectedIds?: MuxUISelection; defaultSelectedIds?: MuxUISelection; expandedIds?: MuxUISelection; defaultExpandedIds?: MuxUISelection; disabled?: boolean; selectionMode?: 'none' | 'single' | 'multiple'; expansionTrigger?: 'chevron' | 'row'; onSelectionChange?: (ids: MuxUISelection) => void; onExpandedChange?: (ids: MuxUISelection) => void; onAction?: (item?: MuxUITreeItem) => void; className?: string; };
export declare const Tree: React.ForwardRefExoticComponent<TreeProps & React.RefAttributes<HTMLDivElement>>;
export type VirtualizerProps = VirtualizerStackProps | VirtualizerGridProps;
/** The default fixed-row list: a bounded, named scroll viewport that renders its own items. */
export type VirtualizerStackProps = MuxUIAriaLabel & { layout?: 'stack'; items?: MuxUIItems; height?: number; itemHeight?: number; overscan?: number; disabled?: boolean; onScroll?: React.UIEventHandler<HTMLDivElement>; className?: string; style?: React.CSSProperties; children?: never; minItemWidth?: never; maxItemWidth?: never; estimatedItemHeight?: never; maxColumns?: never; };
/** Lays out a GridList with layout="grid" in measured rows. It renders no element of its own: the GridList is the scroll region, so name, size, spacing, and scroll handling belong on the GridList. */
export type VirtualizerGridProps = {
  layout: 'grid';
  /** A GridList with layout="grid". */
  children: React.ReactElement;
  /** Minimum item width in px. Default 200. */
  minItemWidth?: number;
  /** Maximum item width in px. Default unbounded, so items stretch to fill their columns. */
  maxItemWidth?: number;
  /** Estimated height in px of rows that have not mounted yet. Default 200. Mounted rows take their measured content height. */
  estimatedItemHeight?: number;
  /** Cap on the number of columns. Default unbounded. */
  maxColumns?: number;
  /** Extra rows mounted above and below the viewport. Default 2. */
  overscan?: number;
  'aria-label'?: never; 'aria-labelledby'?: never; items?: never; height?: never; itemHeight?: never; disabled?: never; onScroll?: never; className?: never; style?: never;
};
export declare const Virtualizer: React.ForwardRefExoticComponent<(VirtualizerStackProps & React.RefAttributes<HTMLDivElement>) | (VirtualizerGridProps & { ref?: never })>;

export type MuxUIDropOperation = 'copy' | 'link' | 'move' | 'cancel';
export interface MuxUIFileDropItem { readonly kind: 'file'; readonly type: string; readonly name: string; readonly getFile: () => Promise<File>; readonly getText: () => Promise<string>; }
export interface MuxUIDirectoryDropItem { readonly kind: 'directory'; readonly name: string; readonly getEntries: () => AsyncIterable<MuxUIDropItem>; }
export interface MuxUITextDropItem { readonly kind: 'text'; readonly types: ReadonlySet<string>; readonly getText: (type: string) => Promise<string>; }
export type MuxUIDropItem = MuxUIFileDropItem | MuxUIDirectoryDropItem | MuxUITextDropItem;
export interface MuxUIDropEvent { readonly type: 'drop'; readonly x: number; readonly y: number; readonly dropOperation: MuxUIDropOperation; readonly items: MuxUIDropItem[]; }
export interface MuxUIDropActivateEvent { readonly type: 'activate'; readonly x: number; readonly y: number; }
export interface DropZoneProps { children?: React.ReactNode; disabled?: boolean; className?: string; 'aria-label'?: string; 'aria-labelledby'?: string; onDrop?: (event: MuxUIDropEvent) => void; onActivate?: (event: MuxUIDropActivateEvent) => void; }
export declare const DropZone: React.ForwardRefExoticComponent<DropZoneProps & React.RefAttributes<HTMLDivElement>>;
export interface FileTriggerProps { children?: React.ReactNode; acceptedFileTypes?: readonly string[]; allowsMultiple?: boolean; acceptDirectory?: boolean; defaultCamera?: 'user' | 'environment'; disabled?: boolean; className?: string; onSelect?: (files: File[]) => void; }
export declare const FileTrigger: React.ForwardRefExoticComponent<FileTriggerProps & React.RefAttributes<HTMLInputElement>>;
export type OverlayAccessibleName = { 'aria-label': string; 'aria-labelledby'?: never } | { 'aria-label'?: never; 'aria-labelledby': string };
export type MuxUIPlacement = 'top' | 'bottom' | 'start' | 'end' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'start-top' | 'start-bottom' | 'end-top' | 'end-bottom';
export type DialogProps = { 'aria-describedby'?: string; children?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; open?: boolean; defaultOpen?: boolean; dismissable?: boolean; trigger?: React.ReactElement; onOpenChange?: (open: boolean) => void; className?: string; backdropClassName?: string; panelClassName?: string; titleClassName?: string; descriptionClassName?: string; contentClassName?: string; actionsClassName?: string; closeClassName?: string; } & ({ title: Exclude<React.ReactNode, null | undefined | boolean>; 'aria-label'?: string; 'aria-labelledby'?: string } | ({ title?: never } & OverlayAccessibleName));
export declare const Dialog: React.ForwardRefExoticComponent<DialogProps & React.RefAttributes<HTMLElement>>;
export type PopoverProps = { children: React.ReactNode; trigger: React.ReactElement; open?: boolean; defaultOpen?: boolean; dismissable?: boolean; placement?: MuxUIPlacement; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; anchorRef?: React.RefObject<Element | null>; modal?: boolean; onOpenChange?: (open: boolean) => void; className?: string; } & OverlayAccessibleName;
export declare const Popover: React.ForwardRefExoticComponent<PopoverProps & React.RefAttributes<HTMLDivElement>>;
export type PreviewTriggerProps = { children: React.ReactNode; trigger: React.ReactElement; delay?: number; closeDelay?: number; open?: boolean; defaultOpen?: boolean; disabled?: boolean; placement?: MuxUIPlacement; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; onOpenChange?: (open: boolean) => void; className?: string; } & OverlayAccessibleName;
export declare const PreviewTrigger: React.ForwardRefExoticComponent<PreviewTriggerProps & React.RefAttributes<HTMLDivElement>>;
export interface ToastProps { message: Exclude<React.ReactNode, null | undefined | boolean>; title?: React.ReactNode; variant?: 'neutral' | 'success' | 'warning' | 'danger'; duration?: number; onDismiss?: () => void; className?: string; }
export declare const Toast: React.FC<ToastProps>;
export interface ToastOptions { title?: React.ReactNode; variant?: 'neutral' | 'success' | 'warning' | 'danger'; duration?: number; onDismiss?: () => void; className?: string; }
export interface ToastManager { add: (message: Exclude<React.ReactNode, null | undefined | boolean>, options?: ToastOptions) => string; remove: (key: string) => void; }
export interface ToastProviderProps { children?: React.ReactNode; maxVisible?: number; placement?: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'; className?: string; }
export declare const ToastProvider: React.FC<ToastProviderProps>;
export declare function useToast(): ToastManager;
export type TooltipProps = { content: Exclude<React.ReactNode, null | undefined | boolean>; trigger: React.ReactElement; delay?: number; closeDelay?: number; placement?: MuxUIPlacement; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; anchorRef?: React.RefObject<Element | null>; open?: boolean; defaultOpen?: boolean; disabled?: boolean; onOpenChange?: (open: boolean) => void; className?: string; };
export declare const Tooltip: React.ForwardRefExoticComponent<TooltipProps & React.RefAttributes<HTMLDivElement>>;

export * from './supplemental.js';
export * from './activity.js';
export * from './avatar.js';
export * from './code-block.js';
export * from './data-diff.js';
export * from './icon-button.js';
export * from './image.js';
export * from './lightbox.js';
export * from './message.js';
export * from './prompt-composer.js';
export * from './resizable.js';
export * from './select-native.js';
