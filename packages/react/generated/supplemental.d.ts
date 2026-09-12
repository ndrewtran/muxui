// @generated-from: packages/react/src/supplemental/index.d.ts
// @generated-content-sha256: sha256:5f772335263434bb4271f0472a56ed241036fe21cc50b5db2289cb707d7c52e9
import type * as React from 'react';

export type SupplementalActivation = {
  type: 'activate';
  pointerType?: string;
  target?: EventTarget | null;
};

export type SupplementalFieldProps = {
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

type PartProps<T extends HTMLElement = HTMLElement> = React.HTMLAttributes<T> & { className?: string };
type ButtonPartProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  disabled?: boolean;
  onActivate?: (event: SupplementalActivation) => void;
  className?: string;
};

export type AlertDialogRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};
export type AlertDialogActionsProps = PartProps<HTMLDivElement>;
export type AlertDialogTriggerProps = ButtonPartProps;
export type AlertDialogCloseProps = ButtonPartProps;

export declare const AlertDialog: {
  Root: React.ForwardRefExoticComponent<AlertDialogRootProps & React.RefAttributes<HTMLElement>>;
  Backdrop: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Popup: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Content: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Title: React.ForwardRefExoticComponent<PartProps<HTMLHeadingElement> & React.RefAttributes<HTMLHeadingElement>>;
  Description: React.ForwardRefExoticComponent<PartProps<HTMLParagraphElement> & React.RefAttributes<HTMLParagraphElement>>;
  Trigger: React.ForwardRefExoticComponent<AlertDialogTriggerProps & React.RefAttributes<HTMLButtonElement>>;
  Actions: React.ForwardRefExoticComponent<AlertDialogActionsProps & React.RefAttributes<HTMLDivElement>>;
  Close: React.ForwardRefExoticComponent<AlertDialogCloseProps & React.RefAttributes<HTMLButtonElement>>;
};

export type ButtonGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical';
  attached?: boolean;
  disabled?: boolean;
  role?: 'group' | 'region' | 'presentation';
  children?: React.ReactNode;
};
export declare const ButtonGroup: React.ForwardRefExoticComponent<ButtonGroupProps & React.RefAttributes<HTMLDivElement>>;

export type CardVariant = 'elevated' | 'outlined' | 'filled';
export type CardPadding = 'sm' | 'md' | 'lg';
export type CardRootProps = React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant; padding?: CardPadding };
export type CardButtonProps = ButtonPartProps & { variant?: CardVariant; padding?: CardPadding; selected?: boolean; pending?: boolean };
export type CardHeaderProps = PartProps<HTMLDivElement>;
export type CardBodyProps = PartProps<HTMLDivElement>;
export type CardFooterProps = PartProps<HTMLDivElement>;
export declare const Card: {
  Root: React.ForwardRefExoticComponent<CardRootProps & React.RefAttributes<HTMLDivElement>>;
  Button: React.ForwardRefExoticComponent<CardButtonProps & React.RefAttributes<HTMLButtonElement>>;
  Header: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Body: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Footer: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
};

export type CheckboxFieldRootProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & SupplementalFieldProps & { checked?: boolean; defaultChecked?: boolean; indeterminate?: boolean; name?: string; value?: string; onChange?: (checked: boolean) => void };
export type CheckboxFieldButtonProps = React.LabelHTMLAttributes<HTMLLabelElement> & { disabled?: boolean };
export type CheckboxFieldIndicatorProps = PartProps<HTMLSpanElement>;
export type CheckboxFieldDescriptionProps = PartProps<HTMLElement>;
export type CheckboxFieldErrorProps = PartProps<HTMLElement>;
export declare const CheckboxField: {
  Root: React.ForwardRefExoticComponent<CheckboxFieldRootProps & React.RefAttributes<HTMLDivElement>>;
  Button: React.ForwardRefExoticComponent<CheckboxFieldButtonProps & React.RefAttributes<HTMLLabelElement>>;
  Indicator: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Description: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Error: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
};

export type ColorMode = 'light' | 'dark';
export type ColorModeToggleProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  mode?: ColorMode;
  defaultMode?: ColorMode;
  storageKey?: string;
  disabled?: boolean;
  onModeChange?: (mode: ColorMode) => void;
};
export declare const ColorModeToggle: React.ForwardRefExoticComponent<ColorModeToggleProps & React.RefAttributes<HTMLLabelElement>>;

export type CommandPaletteRootProps = React.HTMLAttributes<HTMLDivElement> & { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; size?: 'sm' | 'md' | 'lg'; closeOnSelect?: boolean };
export type CommandPaletteItemProps = React.HTMLAttributes<HTMLDivElement> & { id?: string; title?: string; description?: string; textValue?: string; href?: string; disabled?: boolean; closeOnSelect?: boolean; onActivate?: (event: { id?: string }) => void };
export type CommandPaletteTriggerProps = ButtonPartProps;
export type CommandPaletteBackdropProps = PartProps<HTMLDivElement> & { dismissable?: boolean };
export type CommandPalettePopupProps = PartProps<HTMLElement>;
export type CommandPaletteTitleProps = PartProps<HTMLHeadingElement>;
export type CommandPaletteDescriptionProps = PartProps<HTMLParagraphElement>;
export type CommandPaletteCloseProps = ButtonPartProps;
export type CommandPaletteContentProps = PartProps<HTMLDivElement>;
export type CommandPaletteSearchFieldProps = React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'inline' };
export type CommandPaletteInputProps = React.InputHTMLAttributes<HTMLInputElement>;
export type CommandPaletteClearButtonProps = ButtonPartProps;
export type CommandPaletteListBoxProps = PartProps<HTMLDivElement>;
export type CommandPaletteSectionProps = PartProps<HTMLElement>;
export type CommandPaletteSectionHeaderProps = PartProps<HTMLElement>;
export type CommandPaletteSeparatorProps = PartProps<HTMLHRElement>;
export type CommandPaletteItemIconProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemContentProps = PartProps<HTMLDivElement>;
export type CommandPaletteItemTitleProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemDescriptionProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemMetaProps = PartProps<HTMLSpanElement>;
export type CommandPaletteShortcutProps = PartProps<HTMLSpanElement> & { keys?: readonly string[] };
export type CommandPaletteLoadMoreItemProps = PartProps<HTMLDivElement>;
export type CommandPaletteCollectionProps = React.PropsWithChildren<Record<string, unknown>>;
export type CommandPaletteEmptyProps = PartProps<HTMLDivElement>;
export type CommandPaletteFooterProps = PartProps<HTMLDivElement>;
export type CommandPaletteChipsProps = PartProps<HTMLDivElement>;
export type CommandPaletteChipProps = PartProps<HTMLSpanElement>;
export type CommandPaletteChipRemoveProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
export declare const CommandPalette: {
  Root: React.ForwardRefExoticComponent<CommandPaletteRootProps & React.RefAttributes<HTMLDivElement>>;
  Trigger: React.ForwardRefExoticComponent<ButtonPartProps & React.RefAttributes<HTMLButtonElement>>;
  Backdrop: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & { dismissable?: boolean } & React.RefAttributes<HTMLDivElement>>;
  Popup: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Title: React.ForwardRefExoticComponent<PartProps<HTMLHeadingElement> & React.RefAttributes<HTMLHeadingElement>>;
  Description: React.ForwardRefExoticComponent<PartProps<HTMLParagraphElement> & React.RefAttributes<HTMLParagraphElement>>;
  Close: React.ForwardRefExoticComponent<ButtonPartProps & React.RefAttributes<HTMLButtonElement>>;
  Content: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  SearchField: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'inline' } & React.RefAttributes<HTMLDivElement>>;
  Input: React.ForwardRefExoticComponent<React.InputHTMLAttributes<HTMLInputElement> & React.RefAttributes<HTMLInputElement>>;
  ClearButton: React.ForwardRefExoticComponent<ButtonPartProps & React.RefAttributes<HTMLButtonElement>>;
  ListBox: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Section: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  SectionHeader: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Item: React.ForwardRefExoticComponent<CommandPaletteItemProps & React.RefAttributes<HTMLDivElement>>;
  Separator: React.ForwardRefExoticComponent<PartProps<HTMLHRElement> & React.RefAttributes<HTMLHRElement>>;
  Collection: React.ComponentType<React.PropsWithChildren<Record<string, unknown>>>;
  ItemIcon: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  ItemContent: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  ItemTitle: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  ItemDescription: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  ItemMeta: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Shortcut: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & { keys?: readonly string[] } & React.RefAttributes<HTMLSpanElement>>;
  LoadMoreItem: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Empty: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Footer: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Chips: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Chip: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  ChipRemove: React.ForwardRefExoticComponent<React.ButtonHTMLAttributes<HTMLButtonElement> & React.RefAttributes<HTMLButtonElement>>;
};

export type HeaderNavRootProps = React.HTMLAttributes<HTMLElement>;
export type HeaderNavNavButtonProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { current?: boolean };
export declare const HeaderNav: {
  Root: React.ForwardRefExoticComponent<HeaderNavRootProps & React.RefAttributes<HTMLElement>>;
  Logo: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & { href?: string } & React.RefAttributes<HTMLDivElement>>;
  NavButton: React.ForwardRefExoticComponent<HeaderNavNavButtonProps & React.RefAttributes<HTMLAnchorElement>>;
  Actions: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Secondary: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  MobileTrigger: React.ComponentType<{ children?: React.ReactNode }>;
};

export type InputTagsProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & SupplementalFieldProps & {
  tagPlacement?: 'inline' | 'below';
  placeholder?: string;
  value?: string[];
  defaultValue?: string[];
  onChange?: (tags: string[]) => void;
  onTagAdded?: (tag: string) => void;
  onTagRemoved?: (tag: string) => void;
  allowDuplicates?: boolean;
  maxTags?: number;
  validate?: (value: string) => boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
};
export type InputTagsRootProps = InputTagsProps;
export declare const InputTags: { Root: React.ForwardRefExoticComponent<InputTagsProps & React.RefAttributes<HTMLDivElement>> };

export type InputRootProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & SupplementalFieldProps & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};
export type InputControlProps = React.InputHTMLAttributes<HTMLInputElement>;
export type InputProps = InputControlProps;
export type InputLabelProps = PartProps<HTMLLabelElement>;
export type InputDescriptionProps = PartProps<HTMLElement>;
export type InputErrorProps = PartProps<HTMLElement>;
export declare const Input: {
  Root: React.ForwardRefExoticComponent<InputRootProps & React.RefAttributes<HTMLDivElement>>;
  Input: React.ForwardRefExoticComponent<InputControlProps & React.RefAttributes<HTMLInputElement>>;
  Label: React.ForwardRefExoticComponent<PartProps<HTMLLabelElement> & React.RefAttributes<HTMLLabelElement>>;
  Description: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Error: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
};

export type MultiSelectItem = { id: React.Key; [key: string]: unknown };
export type MultiSelectProps<T extends MultiSelectItem = MultiSelectItem> = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & SupplementalFieldProps & { label?: React.ReactNode; placeholder?: string; description?: React.ReactNode; errorMessage?: React.ReactNode; supportingText?: React.ReactNode; emptyStateTitle?: string; emptyStateDescription?: string; items?: Iterable<T>; children?: React.ReactNode | ((item: T) => React.ReactNode); selectedKeys?: Set<React.Key> | 'all'; defaultSelectedKeys?: Set<React.Key>; onSelectionChange?: (keys: Set<React.Key> | 'all') => void; showSearch?: boolean; showFooter?: boolean; onReset?: () => void; onSelectAll?: () => void; selectedCountFormatter?: (count: number) => React.ReactNode };
export type MultiSelectRootProps<T extends MultiSelectItem = MultiSelectItem> = MultiSelectProps<T>;
export type MultiSelectItemProps = React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean; textValue?: string };
export type MultiSelectFooterProps = PartProps<HTMLDivElement>;
export type MultiSelectEmptyStateProps = PartProps<HTMLDivElement>;
export interface MultiSelectRootComponent {
  <T extends MultiSelectItem = MultiSelectItem>(props: MultiSelectRootProps<T> & React.RefAttributes<HTMLDivElement>): React.ReactElement | null;
}
export declare const MultiSelect: {
  Root: MultiSelectRootComponent;
  Item: React.ForwardRefExoticComponent<MultiSelectItemProps & React.RefAttributes<HTMLDivElement>>;
  Footer: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  EmptyState: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
};

export type PaymentInputProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & SupplementalFieldProps & { value?: string; defaultValue?: string; onChange?: (value: string) => void };
export type PaymentInputRootProps = PaymentInputProps;
export type PaymentInputGroupProps = PartProps<HTMLDivElement>;
export type PaymentInputInputProps = InputControlProps;
export type PaymentInputLabelProps = PartProps<HTMLLabelElement>;
export type PaymentInputDescriptionProps = PartProps<HTMLElement>;
export type PaymentInputErrorProps = PartProps<HTMLElement>;
export type PaymentInputCardIconProps = Omit<PartProps<HTMLSpanElement>, 'aria-label' | 'children'> & { cardType?: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown' };
export declare const PaymentInput: {
  Root: React.ForwardRefExoticComponent<PaymentInputProps & React.RefAttributes<HTMLDivElement>>;
  Group: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Input: React.ForwardRefExoticComponent<InputControlProps & React.RefAttributes<HTMLInputElement>>;
  Label: React.ForwardRefExoticComponent<PartProps<HTMLLabelElement> & React.RefAttributes<HTMLLabelElement>>;
  Description: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Error: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  CardIcon: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
};

export type ProgressCircleProps = React.HTMLAttributes<HTMLDivElement> & { value?: number | null; minValue?: number; maxValue?: number; size?: 'sm' | 'md' | 'lg'; label?: string };
export type ProgressCircleRootProps = ProgressCircleProps;
export type ProgressCircleTrackProps = React.SVGAttributes<SVGSVGElement>;
export type ProgressCircleLabelProps = PartProps<HTMLSpanElement>;
export type ProgressCircleValueProps = PartProps<HTMLSpanElement>;
export declare const ProgressCircle: {
  Root: React.ForwardRefExoticComponent<ProgressCircleProps & React.RefAttributes<HTMLDivElement>>;
  Track: React.ForwardRefExoticComponent<React.SVGAttributes<SVGSVGElement> & React.RefAttributes<SVGSVGElement>>;
  Label: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Value: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
};

export type RadioFieldRootProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & Omit<SupplementalFieldProps, 'size'> & { size?: 'sm' | 'md' | 'lg'; value: string };
export type RadioFieldButtonProps = React.LabelHTMLAttributes<HTMLLabelElement> & { disabled?: boolean };
export type RadioFieldIndicatorProps = PartProps<HTMLSpanElement>;
export type RadioFieldDotProps = PartProps<HTMLSpanElement>;
export type RadioFieldDescriptionProps = PartProps<HTMLElement>;
export type RadioFieldErrorProps = PartProps<HTMLElement>;
export declare const RadioField: {
  Root: React.ForwardRefExoticComponent<RadioFieldRootProps & React.RefAttributes<HTMLDivElement>>;
  Button: React.ForwardRefExoticComponent<RadioFieldButtonProps & React.RefAttributes<HTMLLabelElement>>;
  Indicator: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Dot: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Description: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Error: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
};

export type SidebarProps = React.HTMLAttributes<HTMLElement> & { hideBorder?: boolean };
export declare const Sidebar: {
  Root: React.ForwardRefExoticComponent<SidebarProps & React.RefAttributes<HTMLElement>>;
  Header: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  Search: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & { placeholder?: string; value?: string; onChange?: React.ChangeEventHandler<HTMLInputElement> } & React.RefAttributes<HTMLDivElement>>;
  Divider: React.ForwardRefExoticComponent<PartProps<HTMLHRElement> & React.RefAttributes<HTMLHRElement>>;
  NavList: React.ForwardRefExoticComponent<PartProps<HTMLUListElement> & React.RefAttributes<HTMLUListElement>>;
  NavItem: React.ComponentType<{ href?: string; icon?: React.ComponentType<{ className?: string }>; badge?: React.ReactNode; current?: boolean; children?: React.ReactNode; items?: Array<{ href: string; label: string; current?: boolean }>; external?: boolean }>;
  NavButton: React.ForwardRefExoticComponent<React.AnchorHTMLAttributes<HTMLAnchorElement> & { icon?: React.ComponentType<{ className?: string }>; label?: string; current?: boolean } & React.RefAttributes<HTMLAnchorElement>>;
  AccountCard: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & { name: string; email: string; avatarSrc?: string; avatarAlt?: string; status?: 'online' | 'offline' } & React.RefAttributes<HTMLDivElement>>;
  AccountMenu: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & React.RefAttributes<HTMLDivElement>>;
  MobileTrigger: React.ComponentType<{ children?: React.ReactNode; logo?: React.ReactNode }>;
  FeatureCard: React.ForwardRefExoticComponent<PartProps<HTMLDivElement> & { title?: string; description?: string; dismissLabel?: string; onDismiss?: () => void } & React.RefAttributes<HTMLDivElement>>;
};

export type SwitchFieldRootProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & SupplementalFieldProps & { checked?: boolean; defaultChecked?: boolean; name?: string; value?: string; onChange?: (checked: boolean) => void };
export type SwitchFieldButtonProps = React.LabelHTMLAttributes<HTMLLabelElement> & { disabled?: boolean };
export type SwitchFieldThumbProps = PartProps<HTMLSpanElement>;
export type SwitchFieldDescriptionProps = PartProps<HTMLElement>;
export type SwitchFieldErrorProps = PartProps<HTMLElement>;
export declare const SwitchField: {
  Root: React.ForwardRefExoticComponent<SwitchFieldRootProps & React.RefAttributes<HTMLDivElement>>;
  Button: React.ForwardRefExoticComponent<SwitchFieldButtonProps & React.RefAttributes<HTMLLabelElement>>;
  Thumb: React.ForwardRefExoticComponent<PartProps<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement>>;
  Description: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Error: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
};

export type TagSelectItem = { id: React.Key; [key: string]: unknown };
export type TagSelectProps<T extends TagSelectItem = TagSelectItem> = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & SupplementalFieldProps & { label?: React.ReactNode; placeholder?: string; description?: React.ReactNode; errorMessage?: React.ReactNode; items?: T[]; children?: React.ReactNode | ((item: T) => React.ReactNode); selectedKeys?: Set<React.Key>; defaultSelectedKeys?: Set<React.Key>; onSelectionChange?: (keys: Set<React.Key>) => void; getItemLabel?: (item: T) => string };
export type TagSelectRootProps<T extends TagSelectItem = TagSelectItem> = TagSelectProps<T>;
export type TagSelectItemProps = React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean; textValue?: string };
export interface TagSelectRootComponent {
  <T extends TagSelectItem = TagSelectItem>(props: TagSelectRootProps<T> & React.RefAttributes<HTMLDivElement>): React.ReactElement | null;
}
export declare const TagSelect: {
  Root: TagSelectRootComponent;
  Item: React.ForwardRefExoticComponent<TagSelectItemProps & React.RefAttributes<HTMLDivElement>>;
};

export type TextAreaRootProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & SupplementalFieldProps & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};
export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export type TextAreaLabelProps = PartProps<HTMLLabelElement>;
export type TextAreaDescriptionProps = PartProps<HTMLElement>;
export type TextAreaErrorProps = PartProps<HTMLElement>;
export declare const TextArea: {
  Root: React.ForwardRefExoticComponent<TextAreaRootProps & React.RefAttributes<HTMLDivElement>>;
  TextArea: React.ForwardRefExoticComponent<React.TextareaHTMLAttributes<HTMLTextAreaElement> & React.RefAttributes<HTMLTextAreaElement>>;
  Label: React.ForwardRefExoticComponent<PartProps<HTMLLabelElement> & React.RefAttributes<HTMLLabelElement>>;
  Description: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Error: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
};

export declare const supplementalFamilies: readonly [
  'AlertDialog', 'ButtonGroup', 'Card', 'CheckboxField', 'ColorModeToggle', 'CommandPalette', 'HeaderNav', 'InputTags', 'Input', 'MultiSelect', 'PaymentInput', 'ProgressCircle', 'RadioField', 'Sidebar', 'SwitchField', 'TagSelect', 'TextArea'
];
