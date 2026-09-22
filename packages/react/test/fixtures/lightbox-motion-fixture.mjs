import React from 'react';
import {
  Lightbox,
  LightboxBackdrop,
  LightboxCaption,
  LightboxClose,
  LightboxContent,
  LightboxNext,
  LightboxPopup,
  LightboxPrevious,
  LightboxTrigger,
} from '../../src/supplemental/lightbox.mjs';

const h = React.createElement;
const items = [
  { key: 'one', label: 'First image' },
  { key: 'two', label: 'Second image' },
  { key: 'three', label: 'Third image' },
];

function imageFor(item) {
  const colors = { one: '#ff5f56', two: '#27c93f', three: '#1f8fff' };
  return h('img', {
    src: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="420" height="280"><rect width="420" height="280" fill="${encodeURIComponent(colors[item.key])}"/></svg>`,
    alt: item.label,
    width: 420,
    height: 280,
    'data-image-key': item.key,
  });
}

export function LightboxMotionFixture() {
  const [mounted, setMounted] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [selectedKey, setSelectedKey] = React.useState('one');
  const changesRef = React.useRef([]);

  React.useEffect(() => {
    document.documentElement.dataset.muxuiLightboxHydrated = 'true';
    window.__muxuiLightboxChanges = changesRef.current;
    window.__muxuiLightboxSetOpen = (next) => setOpen(Boolean(next));
    window.__muxuiLightboxSetSelected = (next) => setSelectedKey(next);
    window.__muxuiLightboxUnmount = () => setMounted(false);
    return () => {
      delete window.__muxuiLightboxChanges;
      delete window.__muxuiLightboxSetOpen;
      delete window.__muxuiLightboxSetSelected;
      delete window.__muxuiLightboxUnmount;
    };
  }, []);

  if (!mounted) return h('div', { id: 'lightbox-unmounted' });
  return h('main', { id: 'lightbox-origin', 'data-muxui-motion': 'full' },
    h(Lightbox, {
      items,
      open,
      selectedKey,
      loop: true,
      onOpenChange: (next) => {
        changesRef.current.push({ type: 'open', value: next });
        setOpen(next);
      },
      onSelectedChange: (next) => {
        changesRef.current.push({ type: 'selected', value: next });
        setSelectedKey(next);
      },
    },
    h(LightboxTrigger, { itemKey: 'one' }, 'Open lightbox'),
    h(LightboxBackdrop, null,
      h(LightboxPopup, null,
        h(LightboxContent, { 'aria-label': 'Images', renderContent: ({ item }) => imageFor(item) }),
        h(LightboxCaption),
        h(LightboxPrevious),
        h(LightboxNext),
        h(LightboxClose),
      ),
    )),
  );
}
