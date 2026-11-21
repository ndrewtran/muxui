import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { DialogSheetFixture } from './dialog-sheet-fixture.mjs';

// The page's query picks the sheet (mode), whether it starts open (open=1) and whether its description wraps (wordy=1);
// the browser proof drives the rest through window.__muxuiSheet, whose setProps overrides the fixture's props.
const query = new URLSearchParams(window.location.search);

function Fixture() {
  const [open, setOpen] = React.useState(query.get('open') === '1');
  const [mode, setMode] = React.useState(query.get('mode') ?? 'long');
  const [overrides, setOverrides] = React.useState({});
  const handleOpenChange = React.useCallback((next) => {
    window.__muxuiSheetChanges = [...(window.__muxuiSheetChanges ?? []), next];
    if (!(mode === 'rejected' && !next)) setOpen(next);
  }, [mode]);
  React.useEffect(() => {
    window.__muxuiSheet = { setOpen, setMode, setProps: (next) => setOverrides((current) => ({ ...current, ...next })) };
    document.documentElement.dataset.muxuiSheetHydrated = 'true';
  }, []);
  return React.createElement(DialogSheetFixture, { mode, open, onOpenChange: handleOpenChange, wordy: query.get('wordy') === '1', ...overrides });
}

hydrateRoot(document.getElementById('root'), React.createElement(Fixture));
