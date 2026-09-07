import React from 'react';
import { Markdown } from '../../src/markdown/index.mjs';
import { TextEditor } from '../../src/text-editor/index.mjs';
import { Lightbox, LightboxBackdrop, LightboxClose, LightboxContent, LightboxPopup, LightboxTrigger } from '../../src/supplemental/lightbox.mjs';
import { Resizable, ResizableHandle, ResizablePanel } from '../../src/supplemental/resizable.mjs';
import { PaymentInput } from '../../src/supplemental/index.mjs';

const h = React.createElement;
const initialDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hydrated draft' }] }],
};

export function HeavyBrowserFixture({ interactive = true }) {
  const [editorValue, setEditorValue] = React.useState(initialDocument);
  const [rejectEditorChanges, setRejectEditorChanges] = React.useState(false);
  const [sizes, setSizes] = React.useState({ left: 50, right: 50 });
  const [commits, setCommits] = React.useState(0);
  const [dark, setDark] = React.useState(false);
  const [linkRequests, setLinkRequests] = React.useState(0);
  const [paymentValue, setPaymentValue] = React.useState('4111111111111111');
  const [rejectPaymentChanges, setRejectPaymentChanges] = React.useState(false);
  const [lastPaymentChange, setLastPaymentChange] = React.useState('');
  React.useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  return h('main', { id: 'heavy-fixture', 'data-interactive': interactive ? 'true' : undefined },
    h('button', { id: 'dark-toggle', type: 'button', onClick: () => setDark((value) => !value) }, 'Dark mode'),
    h('button', { id: 'reject-editor', type: 'button', onClick: () => setRejectEditorChanges(true) }, 'Reject editor changes'),
    h('button', { id: 'accept-payment', type: 'button', onClick: () => setRejectPaymentChanges(false) }, 'Accept payment changes'),
    h('button', { id: 'reject-payment', type: 'button', onClick: () => setRejectPaymentChanges(true) }, 'Reject payment changes'),
    h('button', { id: 'set-payment-mastercard', type: 'button', onClick: () => { setRejectPaymentChanges(false); setPaymentValue('5555555555554444'); } }, 'Set Mastercard'),
    h(PaymentInput.Root, {
      value: paymentValue,
      onChange: (next) => {
        setLastPaymentChange(next);
        if (!rejectPaymentChanges) setPaymentValue(next);
      },
    },
      h(PaymentInput.Label, null, 'Payment card'),
      h(PaymentInput.Group, null,
        h(PaymentInput.Input, { 'aria-label': 'Payment card number' }),
        h(PaymentInput.CardIcon, null)),
    ),
    h('output', { 'data-testid': 'payment-value' }, paymentValue),
    h('output', { 'data-testid': 'payment-last-change' }, lastPaymentChange),
    h(TextEditor, {
      id: 'document-editor',
      value: editorValue,
      onChange: (next) => { if (!rejectEditorChanges) setEditorValue(next); },
      onLinkRequest: (actions) => { setLinkRequests((value) => value + 1); actions.setLink('https://example.com'); },
      'aria-label': 'Document editor',
      toolbar: 'advanced',
      floating: true,
      bubbleMenu: true,
      limit: 500,
    }),
    h(TextEditor, { id: 'readonly-editor', defaultValue: initialDocument, 'aria-label': 'Read-only editor', toolbar: false, readOnly: true }),
    h('output', { 'data-testid': 'editor-value' }, editorValue.content?.[0]?.content?.[0]?.text ?? ''),
    h('output', { 'data-testid': 'editor-document' }, JSON.stringify(editorValue)),
    h('output', { 'data-testid': 'link-requests' }, String(linkRequests)),
    h(Markdown, { source: 'before <span>raw</span> after\n\n[bad](https://user:pass@example.com) [good](https://example.com)' }),
    h(Resizable, { sizes, onSizesChange: setSizes, onSizesCommit: () => setCommits((value) => value + 1), 'aria-label': 'Workspace' },
      h(ResizablePanel, { id: 'left', minSize: 10, maxSize: 55 }, 'Left'),
      h(ResizableHandle, { id: 'split', before: 'left', after: 'right', 'aria-label': 'Resize panels' }),
      h(ResizablePanel, { id: 'right', minSize: 10, maxSize: 90 }, 'Right')),
    h('output', { 'data-testid': 'sizes' }, `${sizes.left}/${sizes.right}`),
    h('output', { 'data-testid': 'commits' }, String(commits)),
    h(Lightbox, { items: [{ key: 'one', label: 'First' }, { key: 'two', label: 'Second' }], loop: true, renderContent: (item) => h('span', null, item.label) },
      h(LightboxTrigger, { itemKey: 'one' }, 'Open lightbox'),
      h(LightboxTrigger, { itemKey: 'two', disabled: true }, 'Disabled lightbox'),
      h(LightboxBackdrop, null,
        h(LightboxPopup, null,
          h(LightboxContent, null),
          h(LightboxClose, null)))),
  );
}
