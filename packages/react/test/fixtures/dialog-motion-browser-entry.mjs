import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Dialog } from '../../src/overlays.mjs';

function Fixture() {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState('trigger');
  const changesRef = React.useRef([]);
  const handleOpenChange = React.useCallback((nextOpen) => {
    changesRef.current.push(nextOpen);
    window.__muxuiDialogChanges = [...changesRef.current];
    if (!(mode === 'rejected' && !nextOpen)) setOpen(nextOpen);
  }, [mode]);

  React.useEffect(() => {
    window.__muxuiDialogSetOpen = setOpen;
    window.__muxuiDialogSetMode = (nextMode) => {
      setMode(nextMode);
      setOpen(false);
    };
    window.__muxuiDialogSetModeOpen = (nextMode) => {
      setMode(nextMode);
      setOpen(true);
    };
    window.__muxuiDialogUnmount = () => window.__muxuiDialogRoot.unmount();
    document.documentElement.dataset.muxuiDialogHydrated = 'true';
    return () => {
      delete window.__muxuiDialogSetOpen;
      delete window.__muxuiDialogSetMode;
      delete window.__muxuiDialogSetModeOpen;
      delete window.__muxuiDialogUnmount;
    };
  }, []);

  const hasTrigger = mode !== 'no-trigger';
  const dismissable = mode !== 'dismissablefalse';
  return React.createElement('div', {
    id: 'dialog-scope',
    'data-muxui-motion': 'full',
  },
  React.createElement(Dialog, {
    title: 'Review changes',
    description: 'These changes will be saved.',
    trigger: hasTrigger ? React.createElement('button', { type: 'button' }, 'Open dialog') : undefined,
    open,
    onOpenChange: handleOpenChange,
    dismissable,
  }, React.createElement('p', null, 'Dialog body')));
}

window.__muxuiDialogRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(Fixture),
);
