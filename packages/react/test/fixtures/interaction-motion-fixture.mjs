import React from 'react';
import { Disclosure, DisclosureGroup } from '../../src/components.mjs';
import { ToastProvider, useToast } from '../../src/overlays.mjs';
import { AlertDialog, CommandPalette, MultiSelect, TagSelect } from '../../src/supplemental/index.mjs';

const h = React.createElement;

const tagItems = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
  { id: 'gamma', label: 'Gamma' },
];

const multiItems = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
  { id: 'three', label: 'Three' },
];

const disclosureCopy = h(React.Fragment, null,
  h('p', null, 'Motion keeps the contents readable while the panel changes size.'),
  h('p', null, 'This deliberately wraps over several lines so the browser can observe an in-flight height.'),
  h('p', null, 'Natural height must be restored after the resize finishes.'),
);

function ToastControls() {
  const toast = useToast();
  React.useEffect(() => {
    const keys = new Map();
    const dismisses = {};
    window.__interactionToastDismisses = dismisses;
    window.__interactionToastAdd = (id, duration = 5000) => {
      const key = toast.add(id, {
        title: `Toast ${id}`,
        className: `interaction-toast-${id}`,
        duration,
        onDismiss: () => { dismisses[id] = (dismisses[id] ?? 0) + 1; },
      });
      keys.set(id, key);
      return key;
    };
    window.__interactionToastRemove = (id) => {
      const key = keys.get(id);
      if (key) toast.remove(key);
    };
    return () => {
      delete window.__interactionToastAdd;
      delete window.__interactionToastRemove;
      delete window.__interactionToastDismisses;
    };
  }, [toast]);
  return null;
}

function DisclosureFixture() {
  const [primaryGrown, setPrimaryGrown] = React.useState(false);
  React.useEffect(() => {
    window.__interactionGrowDisclosure = () => setPrimaryGrown(true);
    return () => { delete window.__interactionGrowDisclosure; };
  }, []);
  const primaryCopy = h(React.Fragment, null,
    disclosureCopy,
    primaryGrown && h('p', null, 'Late content arrives while the disclosure is still opening and must not restart from zero.'),
  );
  return h('section', { 'aria-label': 'Disclosure motion fixtures' },
    h(Disclosure, {
      id: 'primary-disclosure',
      title: 'Primary disclosure',
      'data-motion-id': 'primary-disclosure',
    }, primaryCopy),
    h(DisclosureGroup, {
      id: 'disclosure-group',
      multiple: false,
      'data-motion-id': 'disclosure-group',
    },
    h(Disclosure, {
      id: 'group-first',
      title: 'First grouped disclosure',
      'data-motion-id': 'group-first',
    }, disclosureCopy),
    h(Disclosure, {
      id: 'group-second',
      title: 'Second grouped disclosure',
      'data-motion-id': 'group-second',
    }, disclosureCopy)),
  );
}

function TagAndMultiSelectFixture() {
  const [currentTagItems, setCurrentTagItems] = React.useState(tagItems);
  const [selectedTags, setSelectedTags] = React.useState(new Set(['alpha', 'beta']));
  const [selectedMulti, setSelectedMulti] = React.useState(new Set(['one']));
  const getTagLabel = React.useCallback((item) => item.label, []);

  React.useEffect(() => {
    window.__interactionUpdateTagLabel = () => {
      setCurrentTagItems((items) => items.map((item) => item.id === 'alpha' ? { ...item, label: 'Alpha updated' } : item));
    };
    window.__interactionResetTags = () => setSelectedTags(new Set(['alpha', 'beta']));
    return () => {
      delete window.__interactionUpdateTagLabel;
      delete window.__interactionResetTags;
    };
  }, []);

  return h('section', { 'aria-label': 'Field and collection motion fixtures' },
    h(TagSelect.Root, {
      label: 'Motion tags',
      items: currentTagItems,
      selectedKeys: selectedTags,
      onSelectionChange: setSelectedTags,
      getItemLabel: getTagLabel,
      'data-motion-id': 'tag-select',
    }, (item) => h(TagSelect.Item, { id: item.id, textValue: item.label }, item.label)),
    h(MultiSelect.Root, {
      label: 'Motion multi select',
      items: multiItems,
      selectedKeys: selectedMulti,
      onSelectionChange: (next) => setSelectedMulti(next === 'all' ? new Set(multiItems.map((item) => item.id)) : next),
      showSearch: false,
      showFooter: false,
      'data-motion-id': 'multi-select',
    }, (item) => h(MultiSelect.Item, { id: item.id, textValue: item.label }, item.label)),
  );
}

function AlertDialogFixture() {
  return h(AlertDialog.Root, null,
    h(AlertDialog.Trigger, { id: 'interaction-alert-trigger' }, 'Open alert dialog'),
    h(AlertDialog.Backdrop, null,
      h(AlertDialog.Popup, null,
        h(AlertDialog.Content, null,
          h(AlertDialog.Title, null, 'Delete item'),
          h(AlertDialog.Description, null, 'This action cannot be undone.'),
          h(AlertDialog.Actions, null, h(AlertDialog.Close, null, 'Cancel'))))),
  );
}

function CommandPaletteFixture() {
  return h(CommandPalette.Root, null,
    h(CommandPalette.Trigger, { id: 'interaction-command-trigger' }, 'Open commands'),
    h(CommandPalette.Backdrop, null,
      h(CommandPalette.Popup, { 'aria-label': 'Command palette' },
        h(CommandPalette.Content, null,
          h(CommandPalette.Input, { id: 'interaction-command-input', 'aria-label': 'Search commands' }),
          h(CommandPalette.ListBox, null,
            h(CommandPalette.Item, { id: 'open-settings', title: 'Open settings', description: 'View application settings' }),
            h(CommandPalette.Item, { id: 'open-help', title: 'Open help', description: 'Read help documentation' }))))),
  );
}

export function InteractionMotionFixture() {
  const [mounted, setMounted] = React.useState(true);
  React.useEffect(() => {
    document.documentElement.dataset.muxuiInteractionMotionHydrated = 'true';
    window.__interactionUnmount = () => setMounted(false);
    return () => { delete window.__interactionUnmount; };
  }, []);

  if (!mounted) return h('div', { id: 'interaction-unmounted' });
  return h('main', { 'data-muxui-interaction-motion-fixture': true },
    h(ToastProvider, { maxVisible: 2, placement: 'top-end' },
      h(ToastControls),
      h(DisclosureFixture),
      h(TagAndMultiSelectFixture),
      h(AlertDialogFixture),
      h(CommandPaletteFixture)),
  );
}
