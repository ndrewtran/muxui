// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:76d0672249211f23d3cd28a25d47b000572dc8d592b010bca228ba6665188a02
import * as MuxUI from '@muxui/react';
import {
  argTypesForBinding,
  controlledDefaultPairsForBinding,
  createAnatomyStory,
  createBrowserProofStory,
  createControlledStory,
  createEventsStory,
  createStory,
  createUncontrolledStory,
} from '../../src/storybook-factory.mjs';
import React from 'react';
import { LinkIconCompositionExample } from './link-icon-composition.example.mjs';

const binding = {
  "api": {
    "defaults": {
      "current": false,
      "disabled": false
    },
    "events": [
      "activate"
    ],
    "parts": [
      "root",
      "label"
    ],
    "props": [
      "href",
      "disabled",
      "current",
      "target",
      "rel"
    ]
  },
  "binding": "muxui:component:link#web.react",
  "export": "Link",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-link",
  "states": [
    "idle",
    "current",
    "disabled",
    "pressed"
  ],
  "strategy": "direct"
};
const record = { family: 'Link', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/R1.1/Link',
  id: 'muxui-react-r1-1-link',
  component: MuxUI.Link,
  tags: ['autodocs'],
  parameters: {
    controls: {
      include: binding.api.props,
    },
    muxuiApi: {
      props: binding.api.props,
      events: binding.api.events,
      parts: binding.api.parts,
      states: binding.states,
      controlled: controlledDefaultPairsForBinding(binding),
    },
    docs: {
      description: {
        component: 'Private development showcase for the Mux UI-owned Link family.',
      },
    },
  },
  argTypes: argTypesForBinding(binding),
};
export const Default = createStory(record, 'default');
export const States = createStory(record, 'states');
export const Controlled = createControlledStory(record);
export const Uncontrolled = createUncontrolledStory(record);
export const Events = createEventsStory(record);
export const Anatomy = createAnatomyStory(record);
export const BrowserProof = createBrowserProofStory(record);
export const IconComposition = {
  name: 'Icon composition',
  parameters: {
    docs: {
      source: {
        code: "import { Link } from '@muxui/react';\n\nfunction HomeIcon() {\n  return (\n    <svg\n      xmlns=\"http://www.w3.org/2000/svg\"\n      viewBox=\"0 0 24 24\"\n      width=\"1em\"\n      height=\"1em\"\n      fill=\"none\"\n      stroke=\"currentColor\"\n      strokeWidth=\"2\"\n      strokeLinecap=\"round\"\n      strokeLinejoin=\"round\"\n      aria-hidden=\"true\"\n      focusable=\"false\"\n    >\n      <path d=\"m3 11 9-8 9 8\" />\n      <path d=\"M5 10v10h14V10\" />\n    </svg>\n  );\n}\n\nfunction SettingsIcon() {\n  return (\n    <svg\n      xmlns=\"http://www.w3.org/2000/svg\"\n      viewBox=\"0 0 24 24\"\n      width=\"1em\"\n      height=\"1em\"\n      fill=\"none\"\n      stroke=\"currentColor\"\n      strokeWidth=\"2\"\n      strokeLinecap=\"round\"\n      strokeLinejoin=\"round\"\n      aria-hidden=\"true\"\n      focusable=\"false\"\n    >\n      <circle cx=\"12\" cy=\"12\" r=\"3\" />\n      <path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.1A1.7 1.7 0 0 0 7.6 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1L9 6.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.5 1Z\" />\n    </svg>\n  );\n}\n\nexport function LinkIconCompositionExample() {\n  return (\n    <nav aria-label=\"Example navigation links\" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.75rem' }}>\n      <Link href=\"/dashboard\">\n        <HomeIcon />\n        Dashboard\n      </Link>\n      <Link href=\"/settings\">\n        Settings\n        <SettingsIcon />\n      </Link>\n    </nav>\n  );\n}\n",
        language: 'tsx',
      },
    },
  },
  render: () => React.createElement(LinkIconCompositionExample),
};
