// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:628ac41f86bcb5260208c3e97b496d54e9e6a1c343c9994e934f540493efd7ff
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

const binding = {
  "api": {
    "defaults": {
      "disabled": false,
      "selectionMode": "none"
    },
    "events": [
      "selectionChange",
      "rowAction",
      "sortChange"
    ],
    "parts": [
      "root",
      "header",
      "column",
      "body",
      "row",
      "cell"
    ],
    "props": [
      "aria-label",
      "columns",
      "rows",
      "selectedIds",
      "defaultSelectedIds",
      "sortDescriptor",
      "disabled",
      "selectionMode"
    ]
  },
  "binding": "muxui:component:table#web.react",
  "export": "Table",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-table",
  "states": [
    "idle",
    "focused",
    "disabled",
    "selected",
    "empty"
  ],
  "strategy": "direct"
};
const record = { family: 'Table', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/Table',
  id: 'muxui-react-r1-3-table',
  component: MuxUI.Table,
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
        component: 'Private development showcase for the Mux UI-owned Table family.',
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
