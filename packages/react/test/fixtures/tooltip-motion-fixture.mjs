import React from 'react';
import { Tooltip } from '../../src/overlays.mjs';

const h = React.createElement;

export function TooltipMotionFixture() {
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState('top');
  const [shouldFlip, setShouldFlip] = React.useState(false);
  const [position, setPosition] = React.useState('center');
  const [refMode, setRefMode] = React.useState('object');
  const [mounted, setMounted] = React.useState(true);
  const objectRef = React.useRef(null);
  const callbackRef = React.useCallback((node) => {
    if (typeof window === 'undefined' || !window.__tooltipRefEvents) return undefined;
    if (node) {
      window.__tooltipRefEvents.push({ type: 'set', connected: node.isConnected });
      return () => window.__tooltipRefEvents.push({ type: 'cleanup' });
    }
    window.__tooltipRefEvents.push({ type: 'clear' });
    return undefined;
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.muxuiTooltipMotionHydrated = 'true';
    window.__tooltipRefEvents = [];
    window.__tooltipReadRefs = () => ({
      objectAttached: Boolean(objectRef.current?.isConnected),
      events: [...window.__tooltipRefEvents],
    });
    window.__tooltipConfigure = ({ nextOpen, nextPlacement = 'top', nextShouldFlip = false, nextPosition = 'center', nextRefMode = 'object' }) => {
      setPlacement(nextPlacement);
      setShouldFlip(nextShouldFlip);
      setPosition(nextPosition);
      setRefMode(nextRefMode);
      setOpen(nextOpen);
    };
    window.__tooltipUnmount = () => setMounted(false);
    return () => {
      delete window.__tooltipConfigure;
      delete window.__tooltipUnmount;
    };
  }, []);

  if (!mounted) return h('div', { id: 'tooltip-unmounted' });

  const triggerStyle = position === 'top-edge'
    ? { position: 'fixed', left: '420px', top: '4px' }
    : position === 'left-edge'
      ? { position: 'fixed', left: '4px', top: '320px' }
      : { position: 'fixed', left: '420px', top: '320px' };

  return h('main', { id: 'tooltip-motion-fixture' },
    h(Tooltip, {
      content: 'Helpful description',
      ref: refMode === 'callback' ? callbackRef : objectRef,
      trigger: h('button', {
        id: 'tooltip-trigger',
        type: 'button',
        style: triggerStyle,
      }, 'Help'),
      open,
      onOpenChange: setOpen,
      placement,
      shouldFlip,
    }),
  );
}
