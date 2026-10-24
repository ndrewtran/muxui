import type * as React from 'react';
import type { SupplementalActivation as PartUtilsActivation } from './part-utils.ts';

export type SupplementalActivation = PartUtilsActivation;

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

export type CommandPaletteRootProps = React.HTMLAttributes<HTMLDivElement> & { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; size?: 'sm' | 'md' | 'lg'; closeOnSelect?: boolean };
export type CommandPaletteItemProps = React.HTMLAttributes<HTMLDivElement> & { id?: string; title?: string; description?: string; textValue?: string; href?: string; target?: string; disabled?: boolean; closeOnSelect?: boolean; onActivate?: (event: { id?: string }) => void };
export interface CommandPaletteCommand {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: readonly string[];
  group?: string;
  icon?: React.ReactNode;
  shortcut?: readonly string[];
  disabled?: boolean;
  href?: string;
  target?: string;
  action?: () => void | Promise<void>;
  closeOnSelect?: boolean;
}
export interface CommandPaletteGroup<T extends CommandPaletteCommand = CommandPaletteCommand> {
  id: string;
  title: string;
  commands: readonly T[];
}
export interface UseCommandPaletteOptions<T extends CommandPaletteCommand> {
  commands: readonly T[];
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  filter?: false | ((command: T, query: string) => boolean);
  sort?: false | ((a: T, b: T, query: string) => number);
  groupBy?: (command: T) => string | null | undefined;
  getGroupTitle?: (groupId: string) => string;
  onAction?: (command: T) => void | Promise<void>;
  onError?: (error: unknown, command: T) => void;
  close?: () => void;
  closeOnSelect?: boolean;
}
export interface UseCommandPaletteReturn<T extends CommandPaletteCommand> {
  query: string;
  setQuery: (query: string) => void;
  filteredCommands: readonly T[];
  groupedCommands: readonly CommandPaletteGroup<T>[];
  runCommand: (commandOrId: T | string) => Promise<void>;
  getItemProps: (command: T) => CommandPaletteItemProps;
}
export declare function useCommandPalette<T extends CommandPaletteCommand>(options: UseCommandPaletteOptions<T>): UseCommandPaletteReturn<T>;
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
// Static children, or items with a render function that returns one element per item.
// A render function without items renders nothing, and items without a render function are ignored.
type CommandPaletteItemsProps<T> =
  | { items?: undefined; dependencies?: undefined; children?: React.ReactNode }
  | { items: Iterable<T>; dependencies?: readonly unknown[]; children: (item: T) => React.ReactElement };
export type CommandPaletteListBoxProps<T = unknown> = Omit<PartProps<HTMLDivElement>, 'children'> & CommandPaletteItemsProps<T>;
export type CommandPaletteSectionProps<T = unknown> = Omit<PartProps<HTMLElement>, 'children'> & CommandPaletteItemsProps<T>;
export type CommandPaletteSectionHeaderProps = PartProps<HTMLElement>;
export type CommandPaletteSeparatorProps = PartProps<HTMLHRElement>;
export type CommandPaletteItemIconProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemContentProps = PartProps<HTMLDivElement>;
export type CommandPaletteItemTitleProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemDescriptionProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemMetaProps = PartProps<HTMLSpanElement>;
export type CommandPaletteShortcutProps = PartProps<HTMLSpanElement> & { keys?: readonly string[] };
export type CommandPaletteLoadMoreItemProps = PartProps<HTMLDivElement>;
export type CommandPaletteCollectionProps<T = unknown> = CommandPaletteItemsProps<T>;
export type CommandPaletteEmptyProps = PartProps<HTMLDivElement>;
export type CommandPaletteFooterProps = PartProps<HTMLDivElement>;
export type CommandPaletteChipsProps = PartProps<HTMLDivElement>;
export type CommandPaletteChipProps = PartProps<HTMLSpanElement>;
export type CommandPaletteChipRemoveProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
export interface CommandPaletteListBoxComponent {
  <T = unknown>(props: CommandPaletteListBoxProps<T> & React.RefAttributes<HTMLDivElement>): React.ReactElement | null;
}
export interface CommandPaletteSectionComponent {
  <T = unknown>(props: CommandPaletteSectionProps<T> & React.RefAttributes<HTMLElement>): React.ReactElement | null;
}
export interface CommandPaletteCollectionComponent {
  <T = unknown>(props: CommandPaletteCollectionProps<T>): React.ReactElement | null;
}
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
  ListBox: CommandPaletteListBoxComponent;
  Section: CommandPaletteSectionComponent;
  SectionHeader: React.ForwardRefExoticComponent<PartProps<HTMLElement> & React.RefAttributes<HTMLElement>>;
  Item: React.ForwardRefExoticComponent<CommandPaletteItemProps & React.RefAttributes<HTMLDivElement>>;
  Separator: React.ForwardRefExoticComponent<PartProps<HTMLHRElement> & React.RefAttributes<HTMLHRElement>>;
  Collection: CommandPaletteCollectionComponent;
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

export type MultiSelectItem = { id: React.Key; [key: string]: unknown };
export type MultiSelectProps<T extends MultiSelectItem = MultiSelectItem> = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & SupplementalFieldProps & { label?: React.ReactNode; placeholder?: string; description?: React.ReactNode; errorMessage?: React.ReactNode; supportingText?: React.ReactNode; emptyStateTitle?: string; emptyStateDescription?: string; items?: Iterable<T>; children?: React.ReactNode | ((item: T) => React.ReactNode); selectedKeys?: Set<React.Key> | 'all'; defaultSelectedKeys?: Set<React.Key>; onSelectionChange?: (keys: Set<React.Key> | 'all') => void; showSearch?: boolean; showFooter?: boolean; onReset?: () => void; onSelectAll?: () => void; selectedCountFormatter?: (count: number) => React.ReactNode };
export type MultiSelectRootProps<T extends MultiSelectItem = MultiSelectItem> = MultiSelectProps<T>;
export type MultiSelectItemProps = React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean; textValue?: string };
export interface MultiSelectRootComponent {
  <T extends MultiSelectItem = MultiSelectItem>(props: MultiSelectRootProps<T> & React.RefAttributes<HTMLDivElement>): React.ReactElement | null;
}
export declare const MultiSelect: {
  Root: MultiSelectRootComponent;
  Item: React.ForwardRefExoticComponent<MultiSelectItemProps & React.RefAttributes<HTMLDivElement>>;
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

export type TextVariant = 'display' | 'heading' | 'title' | 'label' | 'body' | 'expressive' | 'mono';
export type TextSize = 'xs' | 'sm' | 'md' | 'lg';
export type TextColor = 'default' | 'muted';
export type TextElement = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div' | 'label';
type TextVisualProps =
  | { variant?: 'body'; size?: TextSize }
  | { variant: 'display' | 'heading' | 'title'; size?: Exclude<TextSize, 'xs'> }
  | { variant: 'label' | 'expressive' | 'mono'; size?: TextSize };
export type TextProps<T extends TextElement = 'span'> = Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'color' | 'size' | 'variant'> & TextVisualProps & {
  as?: T;
  color?: TextColor;
  truncate?: boolean;
  className?: string;
};
export interface TextComponent {
  <T extends TextElement = 'span'>(props: TextProps<T> & React.RefAttributes<HTMLElementTagNameMap[T]>): React.ReactElement | null;
}
export declare const Text: TextComponent;

export declare const supplementalFamilies: readonly [
  'AlertDialog', 'Avatar', 'ButtonGroup', 'Card', 'CheckboxField', 'ColorModeToggle', 'CommandPalette', 'HeaderNav', 'Image', 'InputTags', 'Input', 'MultiSelect', 'PaymentInput', 'ProgressCircle', 'RadioField', 'SelectNative', 'Sidebar', 'SwitchField', 'TagSelect', 'TextArea', 'Text'
];
