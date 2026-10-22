import React from 'react';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import {
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
  Tag as AriaTag,
  Label as AriaLabel,
} from 'react-aria-components';
import { IconButton } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.mjs';
import { normalizeItems } from './collection-items.mjs';

const TAG_VARIANTS = ['soft', 'outline', 'dot', 'strong'];
const TAG_COLORS = [
  'neutral', 'brand', 'success', 'warning', 'error',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'bluegreen', 'cyan', 'sky', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

function normalizeTagOption(name, options, value) {
  if (!options.includes(value)) throw new TypeError(`TagGroup ${name} must be one of: ${options.join(', ')}`);
  return value;
}

export const TagGroup = React.forwardRef(function TagGroup({ label, items = [], variant = 'soft', color = 'neutral', selectionMode = 'none', selectedKeys, defaultSelectedKeys, onSelectionChange, onRemove, onAction, disabled = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  const normalized = normalizeItems(items);
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TagGroup');
  const resolvedVariant = normalizeTagOption('variant', TAG_VARIANTS, variant);
  const groupColor = normalizeTagOption('color', TAG_COLORS, color);
  // An item's own colour wins over the group's.
  const tagColor = (item) => (item.color === undefined ? groupColor : normalizeTagOption('item color', TAG_COLORS, item.color));
  normalized.forEach(tagColor);
  // Without selectedKeys the group holds React Aria's own selection value, so range anchors and select-all keep working.
  // It drops the ids of items removed since the last render; a default waiting for its first item is not a removal.
  const controlled = selectedKeys !== undefined;
  const itemIds = new Set(normalized.map((item) => item.id));
  const [held, setHeld] = React.useState(() => new Set(defaultSelectedKeys));
  const [knownIds, setKnownIds] = React.useState(itemIds);
  if (itemIds.size !== knownIds.size || [...itemIds].some((id) => !knownIds.has(id))) {
    setKnownIds(itemIds);
    const removed = new Set([...knownIds].filter((id) => !itemIds.has(id)));
    // Any removal rebuilds the selection as a plain Set: a deselected id can still be a range anchor.
    if (held !== 'all' && removed.size > 0) setHeld(new Set([...held].filter((id) => !removed.has(id))));
  }
  // The application gets a fresh Set of ids; 'all' becomes the enabled ids.
  const handleSelectionChange = (keys) => {
    if (disabled) return;
    if (!controlled) setHeld(keys);
    onSelectionChange?.(keys === 'all' ? new Set(normalized.filter((item) => !item.disabled).map((item) => item.id)) : new Set([...keys].map(String)));
  };
  return React.createElement(AriaTagGroup, { ref, selectionMode, selectedKeys: controlled ? selectedKeys : held, onSelectionChange: handleSelectionChange, ...(onRemove ? { onRemove: (keys) => { if (!disabled) onRemove([...keys].map(String).map((id) => normalized.find((item) => item.id === id)).filter((item) => item && !item.disabled)); } } : {}), ...(onAction ? { onAction: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onAction(item); } } : {}), isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tag-group', className) }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTagList, { items: normalized, className: 'muxui-tag-list' }, (item) => React.createElement(AriaTag, { id: item.id, textValue: item.textValue, isDisabled: disabled || item.disabled, className: 'muxui-tag', 'data-color': tagColor(item), 'data-variant': resolvedVariant }, item.label, onRemove ? React.createElement(IconButton, { slot: 'remove', disabled: disabled || item.disabled, className: 'muxui-tag-remove' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 12 })) : null)));
});
TagGroup.displayName = 'TagGroup';
