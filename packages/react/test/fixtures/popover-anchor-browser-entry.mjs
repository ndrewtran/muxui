import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { PopoverAnchorFixture } from './popover-anchor-fixture.mjs';

// The page's `props` query holds the fixture's first props, as the server rendered them, and `strict=1` renders it in
// StrictMode. The browser proof drives the rest through window.__popoverAnchor: setOpen and setSheetOpen change the
// controlled states, setProps overrides the fixture's props, and each open change is recorded in `changes`.
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

window.__popoverAnchor = { changes: [] };
const tree = React.createElement(Fixture);
hydrateRoot(document.getElementById('root'), query.get('strict') === '1' ? React.createElement(React.StrictMode, null, tree) : tree);
