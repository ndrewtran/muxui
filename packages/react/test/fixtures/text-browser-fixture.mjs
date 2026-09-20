import React from 'react';
import {
  Input as AriaInput,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  TextField as AriaTextField,
} from 'react-aria-components';
import { Text } from '../../src/supplemental/index.mjs';

const h = React.createElement;

export function TextBrowserFixture() {
  const spanRef = React.useRef(null);
  const headingRef = React.useRef(null);

  React.useEffect(() => {
    document.documentElement.dataset.textReady = 'true';
    document.documentElement.dataset.textRefs = `${spanRef.current?.tagName ?? ''}:${headingRef.current?.tagName ?? ''}`;
  }, []);

  return h('main', { id: 'text-fixture' },
    h('section', { id: 'native-refs' },
      h(Text, { id: 'native-span', ref: spanRef }, 'Body'),
      h(Text, { id: 'native-heading', ref: headingRef, as: 'h2', variant: 'heading', size: 'm' }, 'Heading'),
    ),
    h('section', { id: 'typography' },
      h(Text, { id: 'display-l', variant: 'display', size: 'l' }, 'Display'),
      h(Text, { id: 'heading-m', variant: 'heading', size: 'm' }, 'Heading'),
      h(Text, { id: 'title-s', variant: 'title', size: 's' }, 'Title'),
      h(Text, { id: 'label-l', variant: 'label', size: 'l' }, 'Label large'),
      h(Text, { id: 'label-xs', variant: 'label', size: 'xs' }, 'Label'),
      h(Text, { id: 'body-m', variant: 'body', size: 'm' }, 'Body'),
      h(Text, { id: 'mono-s', variant: 'mono', size: 's' }, 'Mono'),
      h(Text, { id: 'expressive-muted', variant: 'expressive', size: 'm', color: 'muted' }, 'Expressive muted'),
    ),
    h('section', { id: 'truncate-shell', style: { width: '120px' } },
      h(Text, { id: 'truncated', truncate: true }, 'A deliberately long value that must remain in the DOM while its container clips it.'),
    ),
    h('section', { id: 'field-fixture' },
      h(AriaTextField, { 'aria-label': 'Name' },
        h(Text, { id: 'field-description', slot: 'description' }, 'Use your full name.'),
        h(AriaInput, { id: 'field-input', name: 'name' }),
      ),
    ),
    h('section', { id: 'collection-fixture' },
      h(AriaListBox, { 'aria-label': 'Accounts', selectionMode: 'none' },
      h(AriaListBoxItem, { id: 'collection-item', 'data-testid': 'collection-item', textValue: 'Account' },
          h(Text, { id: 'collection-label', slot: 'label' }, 'Account'),
          h(Text, { id: 'collection-description', slot: 'description' }, 'Primary workspace account.'),
        ),
      ),
    ),
  );
}
