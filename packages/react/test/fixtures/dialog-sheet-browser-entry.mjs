import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { DialogSheetFixture } from './dialog-sheet-fixture.mjs';

// The page's query picks the sheet (mode) and whether it starts open (open=1); the browser proof drives the rest
// through window.__muxuiSheet.
const query = new URLSearchParams(window.location.search);

function Fixture() {
  const [open, setOpen] = React.useState(query.get('open') === '1');
  const [mode, setMode] = React.useState(query.get('mode') ?? 'long');
  const handleOpenChange = React.useCallback((next) => {
    window.__muxuiSheetChanges = [...(window.__muxuiSheetChanges ?? []), next];
    if (!(mode === 'rejected' && !next)) setOpen(next);
  }, [mode]);
  React.useEffect(() => {
    window.__muxuiSheet = { setOpen, setMode };
    document.documentElement.dataset.muxuiSheetHydrated = 'true';
  }, []);
  return React.createElement(DialogSheetFixture, { mode, open, onOpenChange: handleOpenChange });
}

hydrateRoot(document.getElementById('root'), React.createElement(Fixture));
