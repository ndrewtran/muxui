import React from 'react';
import { h } from './part-utils.mjs';

export const defaultItemLabel = (item) => String(item.name ?? item.label ?? item.id);

// react-aria collection render functions must return an item element: its
// useCachedChildren reads `rendered.props.id`, and fragments or host elements
// cannot become collection nodes. The public type allows any ReactNode, so
// wrap everything except a composite element (such as the component's Item).
// `getTextValue(item, rendered)` names the wrapped item for search/typeahead.
export function useItemRenderer(children, Item, getTextValue) {
  return React.useMemo(() => {
    if (typeof children !== 'function') return children;
    const renderItem = (item) => {
      const rendered = children(item);
      const isItemElement = React.isValidElement(rendered) && rendered.type !== React.Fragment && typeof rendered.type !== 'string';
      return isItemElement ? rendered : h(Item, { id: item.id, textValue: getTextValue(item, rendered) }, rendered);
    };
    // react-aria resets its item cache in development when children.toString()
    // changes (hot reload), so expose the caller's source text.
    renderItem.toString = () => String(children);
    return renderItem;
  }, [children, Item, getTextValue]);
}
