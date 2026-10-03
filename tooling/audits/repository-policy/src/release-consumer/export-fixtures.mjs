// Release-preparation fixtures for packed runtime exports that no canonical
// catalog example imports. Copied into the clean consumer beside the examples.
import React from 'react';
import { Lightbox, LightboxBackdrop, LightboxCaption, LightboxClose, LightboxContent, LightboxNext, LightboxPopup, LightboxPrevious, LightboxTrigger, Toast, ToastProvider, reactCompatibility, supplementalFamilies } from '@muxui/react';
import { MARKDOWN_DEPTH_LIMIT, MARKDOWN_LINE_LIMIT, MARKDOWN_NODE_LIMIT, MARKDOWN_SOURCE_LIMIT } from '@muxui/react/markdown';
import { isTextEditorDocument, normalizeTextEditorDocument } from '@muxui/react/text-editor';

const h = React.createElement;
const items = [{ key: 'one', label: 'First' }, { key: 'two', label: 'Second' }];

export function ToastFixture() {
  return h(ToastProvider, null, h(Toast, { title: 'Saved', message: 'Changes saved' }));
}

export function LightboxPartsFixture() {
  return h(Lightbox, { items, defaultOpen: true, renderContent: (item) => h('p', null, item.label) },
    h(LightboxTrigger, { itemKey: 'one' }, 'Open'),
    h(LightboxBackdrop, null, h(LightboxPopup, null,
      h(LightboxContent),
      h(LightboxCaption, null, 'Caption'),
      h(LightboxPrevious),
      h(LightboxNext),
      h(LightboxClose),
    )));
}

/** Runtime exports each fixture renders, keyed by fixture export name. */
export const fixtureCoverage = {
  ToastFixture: ['@muxui/react:Toast', '@muxui/react:ToastProvider'],
  LightboxPartsFixture: ['@muxui/react:Lightbox', '@muxui/react:LightboxBackdrop', '@muxui/react:LightboxCaption', '@muxui/react:LightboxClose', '@muxui/react:LightboxContent', '@muxui/react:LightboxNext', '@muxui/react:LightboxPopup', '@muxui/react:LightboxPrevious', '@muxui/react:LightboxTrigger'],
};

/** Non-component runtime exports, proved by value instead of rendering. */
export function checkValueExports() {
  const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] };
  const checks = {
    '@muxui/react:reactCompatibility': typeof reactCompatibility?.version === 'string',
    '@muxui/react:supplementalFamilies': Array.isArray(supplementalFamilies) && supplementalFamilies.length > 0,
    '@muxui/react/markdown:MARKDOWN_DEPTH_LIMIT': Number.isInteger(MARKDOWN_DEPTH_LIMIT) && MARKDOWN_DEPTH_LIMIT > 0,
    '@muxui/react/markdown:MARKDOWN_LINE_LIMIT': Number.isInteger(MARKDOWN_LINE_LIMIT) && MARKDOWN_LINE_LIMIT > 0,
    '@muxui/react/markdown:MARKDOWN_NODE_LIMIT': Number.isInteger(MARKDOWN_NODE_LIMIT) && MARKDOWN_NODE_LIMIT > 0,
    '@muxui/react/markdown:MARKDOWN_SOURCE_LIMIT': Number.isInteger(MARKDOWN_SOURCE_LIMIT) && MARKDOWN_SOURCE_LIMIT > 0,
    '@muxui/react/text-editor:isTextEditorDocument': isTextEditorDocument(document) === true && isTextEditorDocument({ type: 'doc', content: [{ type: 'text', text: 'Root' }] }) === false,
    '@muxui/react/text-editor:normalizeTextEditorDocument': JSON.stringify(normalizeTextEditorDocument(document)) === JSON.stringify(document),
  };
  const failed = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name);
  if (failed.length !== 0) throw new Error(`value export checks failed: ${failed.join(', ')}`);
  return Object.keys(checks);
}
