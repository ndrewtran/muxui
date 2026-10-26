import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { TagGroup as AriaTagGroup, Label as AriaLabel } from 'react-aria-components';
import { AriaTagList, AriaTag } from './substrate.ts';
import type { Key, Selection } from 'react-aria-components';
import { IconButton } from './supplemental/icon-button.ts';
import type { IconButtonProps } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems } from './collection-items.ts';
import type { MuxUICollectionItem, NormalizedItem } from './collection-items.ts';
import type { MuxUIAccessibleName } from './fields.ts';

/** A TagGroup colour: neutral, the theme's brand, a status, or a fixed hue family. */
export type TagGroupColor = 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald' | 'teal' | 'bluegreen' | 'cyan' | 'sky' | 'indigo' | 'violet' | 'purple' | 'fuchsia' | 'pink' | 'rose';
export type TagGroupVariant = 'soft' | 'outline' | 'dot' | 'strong';
export type TagGroupItem = MuxUICollectionItem & {
  /** Overrides the group's color for this tag. */
  color?: TagGroupColor;
};

// The accessible name's arms (aria-label and aria-labelledby) and className stay in the public type and are
// not Mux UI-owned members, and the label is owned here but offered by those arms. The own props are a type
// literal, not an interface, so the public props type stays assignable to Record<string, unknown>, as it
// was before the move.

/** The props Mux UI defines for TagGroup. The group is named by label, aria-label, or aria-labelledby. */
export type TagGroupOwnProps = {
  /** The visible label, which also names the group. Without one, the group needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** The tags as data: strings, or items with an `id`, a `label`, a `textValue`, `disabled`, and a `color` that overrides the group's. */
  items?: (TagGroupItem | string)[];
  /** The treatment of every tag: soft, outline, dot, or strong. */
  variant?: TagGroupVariant;
  /** The default color of every tag; an item's own color wins. */
  color?: TagGroupColor;
  /** Whether tags can be selected: `single` or `multiple` makes them selectable. */
  selectionMode?: 'none' | 'single' | 'multiple';
  /** The selected item ids, when the caller controls the selection. Without it the group keeps the selection and drops the ids of removed items without calling onSelectionChange, so a caller controlling the selection removes those ids itself. */
  selectedKeys?: Set<string>;
  /** The item ids selected at first, when the group keeps its own selection. */
  defaultSelectedKeys?: Set<string>;
  /** Called with a new Set of the selected item ids when the selection changes; selecting everything passes the ids of the enabled items. It is not called while the group is disabled. */
  onSelectionChange?: (keys: Set<string>) => void;
  /** Disables every tag and its remove button, and stops the selection, removal, and action callbacks. A tag's own `disabled` disables just that tag. */
  disabled?: boolean;
  /** Called with the removed item records, not ids. Each tag shows a remove button only when this is supplied, and Backspace or Delete on a focused tag also removes it. A disabled tag cannot be removed, and a disabled group removes nothing. */
  onRemove?: (items: TagGroupItem[]) => void;
  /** Called with the item record when the user activates a tag. It is not called for a disabled tag or while the group is disabled. */
  onAction?: (item?: TagGroupItem) => void;
};

export type TagGroupProps = Omit<TagGroupOwnProps, 'label'> & { className?: string } & MuxUIAccessibleName;

const TAG_VARIANTS: readonly TagGroupVariant[] = ['soft', 'outline', 'dot', 'strong'];
const TAG_COLORS: readonly TagGroupColor[] = [
  'neutral', 'brand', 'success', 'warning', 'error',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'bluegreen', 'cyan', 'sky', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return options.some((option) => option === value);
}

function normalizeTagOption<T extends string>(name: string, options: readonly T[], value: unknown): T {
  if (!isOneOf(options, value)) throw new TypeError(`TagGroup ${name} must be one of: ${options.join(', ')}`);
  return value;
}

export const TagGroup: ForwardRefExoticComponent<TagGroupProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, TagGroupProps>(function TagGroup({ label, items, variant = 'soft', color = 'neutral', selectionMode = 'none', selectedKeys, defaultSelectedKeys, onSelectionChange, onRemove, onAction, disabled = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  // normalizeItems takes no items as an empty list, so an omitted list has no default here to state.
  const normalized = normalizeItems(items);
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TagGroup');
  const resolvedVariant = normalizeTagOption('variant', TAG_VARIANTS, variant);
  const groupColor = normalizeTagOption('color', TAG_COLORS, color);
  // An item's own colour wins over the group's.
  const tagColor = (item: NormalizedItem): TagGroupColor => (item.color === undefined ? groupColor : normalizeTagOption('item color', TAG_COLORS, item.color));
  normalized.forEach(tagColor);
  // Without selectedKeys the group holds React Aria's own selection value, so range anchors and select-all keep working.
  // It drops the ids of items removed since the last render; a default waiting for its first item is not a removal.
  const controlled = selectedKeys !== undefined;
  const itemIds = new Set(normalized.map((item) => item.id));
  const [held, setHeld] = React.useState<Selection>(() => new Set<Key>(defaultSelectedKeys));
  const [knownIds, setKnownIds] = React.useState(itemIds);
  if (itemIds.size !== knownIds.size || [...itemIds].some((id) => !knownIds.has(id))) {
    setKnownIds(itemIds);
    // A held key may be a number, which no item id equals, so the removed ids are a set of keys.
    const removed = new Set<Key>([...knownIds].filter((id) => !itemIds.has(id)));
    // Any removal rebuilds the selection as a plain Set: a deselected id can still be a range anchor.
    if (held !== 'all' && removed.size > 0) setHeld(new Set([...held].filter((id) => !removed.has(id))));
  }
  // The application gets a fresh Set of ids; 'all' becomes the enabled ids.
  const handleSelectionChange = (keys: Selection) => {
    if (disabled) return;
    if (!controlled) setHeld(keys);
    onSelectionChange?.(keys === 'all' ? new Set(normalized.filter((item) => !item.disabled).map((item) => item.id)) : new Set([...keys].map(String)));
  };
  return React.createElement(AriaTagGroup, {
    ref,
    selectionMode,
    selectedKeys: controlled ? selectedKeys : held,
    onSelectionChange: handleSelectionChange,
    ...(onRemove ? {
      onRemove: (keys: Set<Key>) => {
        if (!disabled) onRemove([...keys].map(String).map((id) => normalized.find((item) => item.id === id)).filter((item): item is NormalizedItem => item !== undefined && !item.disabled));
      },
    } : {}),
    ...(onAction ? {
      onAction: (key: Key) => {
        const item = normalized.find((candidate) => candidate.id === String(key));
        if (!disabled && !item?.disabled) onAction(item);
      },
    } : {}),
    // React Aria's TagGroup props name no isDisabled, and TypeScript accepts such a key in a call only from a spread.
    ...{ isDisabled: disabled },
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    className: classNames('muxui-tag-group', className),
  },
  label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
  React.createElement(AriaTagList<NormalizedItem>, {
    items: normalized,
    className: 'muxui-tag-group__list',
    children: (item) => React.createElement(AriaTag, {
      id: item.id,
      textValue: item.textValue,
      isDisabled: disabled ? disabled : item.disabled,
      className: 'muxui-tag-group__tag',
      // React Aria's Tag props name neither data-muxui-color nor data-muxui-variant, the hooks the styles read.
      ...{ 'data-muxui-color': tagColor(item), 'data-muxui-variant': resolvedVariant },
    }, item.label, onRemove ? React.createElement(IconButton, {
      slot: 'remove',
      disabled: disabled ? disabled : item.disabled,
      className: 'muxui-tag-group__remove',
      // React Aria's ButtonContext names the remove button through its slot, which IconButtonProps, requiring an aria-label or aria-labelledby, cannot express.
    } as IconButtonProps, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 12 })) : null),
  }));
});
TagGroup.displayName = 'TagGroup';
