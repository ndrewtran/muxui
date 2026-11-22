import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Popover } from '../../src/overlays.ts';
import { PopoverAnchorFixture } from './popover-anchor-fixture.mjs';

// The page's `props` query holds the fixture's first props, as the server rendered them, and `strict=1` renders it in
// StrictMode. The browser proof drives the rest through window.__popoverAnchor: setOpen and setSheetOpen change the
// controlled states, setProps overrides the fixture's props, and each open change is recorded in `changes`.
// withElsewhere(props) renders a non-modal Popover, open as it mounts, in a root of its own and then sets `props`, in one
// synchronous update, so both roots render in the same task, that root first.
const query = new URLSearchParams(window.location.search);
const initial = JSON.parse(query.get('props') ?? '{}');

function Fixture() {
  const [open, setOpen] = React.useState(initial.open === true);
  const [sheetOpen, setSheetOpen] = React.useState(initial.sheetOpen === true);
  const [overrides, setOverrides] = React.useState({});
  const handleOpenChange = React.useCallback((next) => {
    window.__popoverAnchor.changes.push(next);
    setOpen(next);
  }, []);
  React.useEffect(() => {
    window.__popoverAnchor.setOpen = setOpen;
    window.__popoverAnchor.setSheetOpen = setSheetOpen;
    window.__popoverAnchor.setProps = (next) => setOverrides((current) => ({ ...current, ...next }));
    document.documentElement.dataset.popoverAnchorHydrated = 'true';
  }, []);
  return React.createElement(PopoverAnchorFixture, { ...initial, open, onOpenChange: handleOpenChange, sheetOpen, onSheetOpenChange: setSheetOpen, ...overrides });
}

window.__popoverAnchor = {
  changes: [],
  withElsewhere: (props) => {
    const container = document.createElement('div');
    document.body.append(container);
    const elsewhere = createRoot(container);
    flushSync(() => {
      elsewhere.render(React.createElement(Popover, { 'aria-label': 'Elsewhere', modal: false, defaultOpen: true, trigger: React.createElement('button', { type: 'button', id: 'elsewhere' }, 'Elsewhere') }, 'Elsewhere'));
      window.__popoverAnchor.setProps(props);
    });
  },
};
const tree = React.createElement(Fixture);
hydrateRoot(document.getElementById('root'), query.get('strict') === '1' ? React.createElement(React.StrictMode, null, tree) : tree);
