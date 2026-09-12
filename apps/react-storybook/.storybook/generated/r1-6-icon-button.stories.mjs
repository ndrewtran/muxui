// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:4c03eb0d8b2e3a8fc2d505ef50a016702dc21fe9077150575e71ec574c539425
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
import { BasicIconButtonExample } from './icon-button-basic.example.mjs';

const binding = {
  "api": {
    "defaults": {
      "disabled": false,
      "pending": false,
      "size": "md",
      "tone": "default",
      "variant": "ghost"
    },
    "events": [
      "activate"
    ],
    "parts": [
      "root",
      "icon"
    ],
    "props": [
      "aria-label",
      "aria-labelledby",
      "disabled",
      "pending",
      "variant",
      "tone",
      "size"
    ]
  },
  "binding": "muxui:component:icon-button#web.react",
  "export": "IconButton",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-icon-button",
  "states": [
    "default",
    "hovered",
    "pressed",
    "focus-visible",
    "disabled",
    "pending"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'IconButton', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/IconButton',
  id: 'muxui-react-r1-6-icon-button',
  component: MuxUI.IconButton,
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
        component: 'Private development showcase for the Mux UI-owned IconButton family.',
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
export const SizesAndStates = {
  name: 'Sizes and states',
  parameters: {
    docs: {
      source: {
        code: "import { IconButton } from '@muxui/react';\n\nfunction SearchIcon() {\n  return <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\" /><path d=\"m16 16 4 4\" /></svg>;\n}\n\nexport function BasicIconButtonExample() {\n  return <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>\n    <IconButton aria-label=\"Search\" size=\"sm\"><SearchIcon /></IconButton>\n    <IconButton aria-label=\"Search\" variant=\"neutral\"><SearchIcon /></IconButton>\n    <IconButton aria-label=\"Search\" size=\"lg\" variant=\"primary\"><SearchIcon /></IconButton>\n    <IconButton aria-label=\"Search\" disabled><SearchIcon /></IconButton>\n    <IconButton aria-label=\"Searching\" pending><SearchIcon /></IconButton>\n  </div>;\n}\n",
        language: 'tsx',
      },
    },
  },
  render: () => React.createElement(BasicIconButtonExample),
};
