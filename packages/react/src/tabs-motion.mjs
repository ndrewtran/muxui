import React from 'react';
import { animate } from 'motion/react';
import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import ChevronUpIcon from 'lucide-react/dist/esm/icons/chevron-up.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { observeReducedMotion, resolvedMotionSpring, resolvedMotionTransition } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const TAB_SELECTOR = '[role="tab"]';

function selectedTab(root) {
  const tab = root.querySelector(`.muxui-tab-list ${TAB_SELECTOR}[aria-selected="true"]`)
    ?? root.querySelector(`${TAB_SELECTOR}[aria-selected="true"]`);
  if (!tab) return null;
  return { tab, label: tab.querySelector('.muxui-tab-label') ?? tab };
}

function sameGeometry(previous, next) {
  return previous && Math.abs(previous.left - next.left) < 0.5
    && Math.abs(previous.top - next.top) < 0.5
    && Math.abs(previous.width - next.width) < 0.5
    && Math.abs(previous.height - next.height) < 0.5;
}

function sameEdges(previous, next) {
  return previous.overflow === next.overflow && previous.before === next.before && previous.after === next.after;
}

function readTarget(root, host, orientation, variant) {
  const list = root.querySelector('.muxui-tab-list') ?? root.querySelector('[role="tablist"]');
  const selected = selectedTab(root);
  if (!list || !selected || !host) return null;
  const hostRect = host.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const targetRect = (variant === 'underline' ? selected.label : selected.tab).getBoundingClientRect();
  if (!listRect.width || !listRect.height || !targetRect.width || !targetRect.height) return null;
  const vertical = orientation === 'vertical' || list.getAttribute('aria-orientation') === 'vertical';
  const rtl = getComputedStyle(list).direction === 'rtl';
  if (variant !== 'underline') {
    return {
      left: targetRect.left - hostRect.left,
      top: targetRect.top - hostRect.top,
      width: targetRect.width,
      height: targetRect.height,
      tab: selected.tab,
      label: selected.label,
    };
  }
  if (vertical) {
    return {
      left: (rtl ? listRect.left : listRect.right - 2) - hostRect.left,
      top: targetRect.top - hostRect.top,
      width: 2,
      height: targetRect.height,
      tab: selected.tab,
      label: selected.label,
    };
  }
  return {
    left: targetRect.left - hostRect.left,
    top: listRect.bottom - hostRect.top - 2,
    width: targetRect.width,
    height: 2,
    tab: selected.tab,
    label: selected.label,
  };
}

function geometryStyle(target) {
  if (!target) return { left: '0px', top: '0px', width: '0px', height: '0px' };
  return {
    left: `${target.left}px`,
    top: `${target.top}px`,
    width: `${target.width}px`,
    height: `${target.height}px`,
  };
}

function applyGeometry(node, target) {
  if (!node || !target) return;
  Object.assign(node.style, geometryStyle(target), { opacity: '1' });
}

function applyClip(foreground, geometry, radius) {
  if (!foreground || !geometry) return;
  const right = `calc(100% - ${geometry.left + geometry.width}px)`;
  const bottom = `calc(100% - ${geometry.top + geometry.height}px)`;
  const clip = `inset(${geometry.top}px ${right} ${bottom} ${geometry.left}px round ${radius})`;
  foreground.style.clipPath = clip;
  foreground.style.opacity = '1';
}

function readGeometry(node, fallback) {
  if (!node) return fallback;
  const values = ['left', 'top', 'width', 'height'].map((property) => Number.parseFloat(node.style[property]));
  return values.every(Number.isFinite)
    ? { left: values[0], top: values[1], width: values[2], height: values[3] }
    : fallback;
}

function interpolateGeometry(from, to, progress) {
  return {
    left: from.left + ((to.left - from.left) * progress),
    top: from.top + ((to.top - from.top) * progress),
    width: from.width + ((to.width - from.width) * progress),
    height: from.height + ((to.height - from.height) * progress),
  };
}

function applyLayers(indicator, foreground, geometry, radius) {
  applyGeometry(indicator, geometry);
  applyClip(foreground, geometry, radius);
}

function refreshForeground(foreground, list, host) {
  if (!foreground || !list || !host) return;
  const hostRect = host.getBoundingClientRect();
  const labels = Array.from(list.querySelectorAll('.muxui-tab-label'), (label) => {
    const rect = label.getBoundingClientRect();
    const tab = label.closest(TAB_SELECTOR);
    const style = getComputedStyle(label);
    return {
      label,
      left: rect.left - hostRect.left,
      top: rect.top - hostRect.top,
      width: rect.width,
      height: rect.height,
      font: style.font,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      opacity: tab ? getComputedStyle(tab).opacity : '1',
    };
  });
  foreground.replaceChildren(...labels.map(({ label, left, top, width, height, font, letterSpacing, lineHeight, opacity }) => {
    const copy = label.cloneNode(true);
    copy.removeAttribute('id');
    for (const child of copy.querySelectorAll('[id]')) child.removeAttribute('id');
    copy.classList.add('muxui-tabs-motion-label');
    Object.assign(copy.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      font,
      letterSpacing,
      lineHeight,
      opacity,
    });
    return copy;
  }));
}

function revealDelta(viewport, tab, orientation) {
  if (!viewport || !tab) return 0;
  const frame = viewport.getBoundingClientRect();
  const item = tab.getBoundingClientRect();
  const styles = getComputedStyle(viewport);
  const inset = 4;
  const before = orientation === 'vertical' ? parseFloat(styles.paddingTop) : parseFloat(styles.paddingLeft);
  const after = orientation === 'vertical' ? parseFloat(styles.paddingBottom) : parseFloat(styles.paddingRight);
  if (orientation === 'vertical') {
    return item.top < frame.top + before + inset
      ? item.top - frame.top - before - inset
      : item.bottom > frame.bottom - after - inset
        ? item.bottom - frame.bottom + after + inset
        : 0;
  }
  return item.left < frame.left + before + inset
    ? item.left - frame.left - before - inset
    : item.right > frame.right - after - inset
      ? item.right - frame.right + after + inset
      : 0;
}

/**
 * Mux-owned selected-tab shape. RAC owns tab state and ARIA updates; this
 * wrapper measures one local target and lets Motion interpolate its geometry.
 * Inverse-contrast labels live inside the moving shape, so the shape and its
 * mask cannot drift during a transition or while overflow content scrolls.
 */
export function TabsMotion({ children, orientation = 'horizontal', variant = 'underline', disabled = false }) {
  const [root, setRoot] = React.useState(null);
  const [edges, setEdges] = React.useState({ overflow: false, before: false, after: false });
  const [direction, setDirection] = React.useState('ltr');
  const [reduced, setReduced] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const targetRef = React.useRef(null);
  const edgesRef = React.useRef(edges);
  const directionRef = React.useRef(direction);
  const reducedRef = React.useRef(false);
  const readyRef = React.useRef(false);
  const indicatorRef = React.useRef(null);
  const foregroundRef = React.useRef(null);
  const viewportRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const observedLabelRef = React.useRef(null);
  const indicatorAnimationRef = React.useRef(null);
  const scrollAnimationRef = React.useRef(null);
  const scrollByRef = React.useRef(null);
  const instanceId = React.useId();
  edgesRef.current = edges;
  directionRef.current = direction;
  readyRef.current = ready;

  useIsomorphicLayoutEffect(() => {
    if (!root) return undefined;
    let active = true;
    let indicatorAnimationId = 0;
    const viewport = viewportRef.current;
    const host = contentRef.current ?? root;
    const list = root.querySelector('.muxui-tab-list') ?? root.querySelector('[role="tablist"]');
    const indicator = indicatorRef.current;
    const foreground = foregroundRef.current;
    const scrollIsVertical = orientation === 'vertical';
    let indicatorRadius = '0px';
    let scrollTarget = null;

    const stopIndicatorAnimation = () => {
      indicatorAnimationId += 1;
      indicatorAnimationRef.current?.stop();
      indicatorAnimationRef.current = null;
    };
    const stopScrollAnimation = () => {
      scrollAnimationRef.current?.stop();
      scrollAnimationRef.current = null;
      scrollTarget = null;
    };
    const setScrollPosition = (position) => {
      if (!viewport) return;
      if (scrollIsVertical) viewport.scrollTop = position;
      else viewport.scrollLeft = position;
    };
    const scrollBounds = () => {
      if (!viewport) return { min: 0, max: 0 };
      const max = Math.max(0, scrollIsVertical
        ? viewport.scrollHeight - viewport.clientHeight
        : viewport.scrollWidth - viewport.clientWidth);
      if (scrollIsVertical || directionRef.current !== 'rtl') return { min: 0, max };
      return { min: -max, max: 0 };
    };
    const scrollTo = (position, immediate = false) => {
      if (!viewport) return;
      const bounds = scrollBounds();
      const target = Math.min(bounds.max, Math.max(bounds.min, position));
      const current = scrollIsVertical ? viewport.scrollTop : viewport.scrollLeft;
      stopScrollAnimation();
      if (Math.abs(target - current) < 0.5) return;
      if (immediate || reducedRef.current) {
        setScrollPosition(target);
        return;
      }
      const transition = resolvedMotionTransition(viewport, root, 'state', 'interaction')
        ?? resolvedMotionTransition(viewport, root, 'interaction', 'interaction');
      if (!transition) {
        setScrollPosition(target);
        return;
      }
      let controls = null;
      scrollTarget = target;
      controls = animate(current, target, {
        ...transition,
        onUpdate: (value) => {
          if (active && scrollAnimationRef.current === controls) setScrollPosition(value);
        },
        onComplete: () => {
          if (scrollAnimationRef.current === controls) {
            scrollAnimationRef.current = null;
            scrollTarget = null;
          }
        },
      });
      scrollAnimationRef.current = controls;
    };
    const scrollBy = (delta) => {
      if (!viewport) return;
      const current = scrollIsVertical ? viewport.scrollTop : viewport.scrollLeft;
      const amount = Math.max(1, (scrollIsVertical ? viewport.clientHeight : viewport.clientWidth) * 0.8);
      scrollTo(current + delta * amount);
    };
    scrollByRef.current = scrollBy;

    const measureOverflow = () => {
      if (!viewport) return;
      const nextDirection = list && getComputedStyle(list).direction === 'rtl' ? 'rtl' : 'ltr';
      const maxScroll = scrollIsVertical ? viewport.scrollHeight - viewport.clientHeight : viewport.scrollWidth - viewport.clientWidth;
      const next = scrollIsVertical
        ? {
          overflow: maxScroll > 1,
          before: viewport.scrollTop > 1,
          after: viewport.scrollTop < maxScroll - 1,
        }
        : {
          overflow: maxScroll > 1,
          before: nextDirection === 'rtl' ? viewport.scrollLeft > -maxScroll + 1 : viewport.scrollLeft > 1,
          after: nextDirection === 'rtl' ? viewport.scrollLeft < -1 : viewport.scrollLeft < maxScroll - 1,
        };
      root.toggleAttribute('data-muxui-tabs-overflow', next.overflow);
      root.setAttribute('data-muxui-tabs-direction', nextDirection);
      if (!sameEdges(edgesRef.current, next)) {
        edgesRef.current = next;
        setEdges(next);
      }
      if (nextDirection !== directionRef.current) {
        directionRef.current = nextDirection;
        setDirection(nextDirection);
      }
    };

    const sync = (immediate = false, shouldReveal = false, forceRefresh = false) => {
      if (!active) return;
      measureOverflow();
      const next = readTarget(root, host, orientation, variant);
      if (!next || !indicator) {
        targetRef.current = null;
        stopIndicatorAnimation();
        if (indicator) Object.assign(indicator.style, geometryStyle(null), { opacity: '0' });
        if (foreground) Object.assign(foreground.style, { opacity: '0', clipPath: 'inset(100%)' });
        if (readyRef.current) {
          readyRef.current = false;
          setReady(false);
        }
        return;
      }
      if (shouldReveal && variant === 'overflow') {
        const delta = revealDelta(viewport, next.tab, orientation);
        if (delta) {
          const current = scrollIsVertical ? viewport?.scrollTop ?? 0 : viewport?.scrollLeft ?? 0;
          scrollTo(current + delta);
        }
      }
      const previous = targetRef.current;
      const changed = !previous || !sameGeometry(previous, next);
      targetRef.current = next;
      if (observedLabelRef.current !== next.label) {
        if (observedLabelRef.current) labelResizeObserver?.unobserve(observedLabelRef.current);
        labelResizeObserver?.observe(next.label);
        observedLabelRef.current = next.label;
      }
      if (variant !== 'underline' && (changed || forceRefresh)) refreshForeground(foreground, list, host);
      if (!changed && readyRef.current && !forceRefresh) return;

      indicatorRadius = getComputedStyle(indicator).borderTopLeftRadius;
      const from = readGeometry(indicator, previous ?? next);
      stopIndicatorAnimation();
      const transition = !immediate && previous && changed && !reducedRef.current
        ? resolvedMotionSpring(indicator, next.tab, 'state', 'interaction')
        : null;
      if (!transition) {
        applyLayers(indicator, foreground, next, indicatorRadius);
      } else {
        const animationId = indicatorAnimationId + 1;
        indicatorAnimationId = animationId;
        let controls = null;
        controls = animate(0, 1, {
          ...transition,
          onUpdate: (progress) => {
            if (active && indicatorAnimationId === animationId) {
              applyLayers(indicator, foreground, interpolateGeometry(from, next, progress), indicatorRadius);
            }
          },
          onComplete: () => {
            if (indicatorAnimationRef.current === controls) indicatorAnimationRef.current = null;
          },
        });
        indicatorAnimationRef.current = controls;
        controls.then?.(() => {
          if (indicatorAnimationRef.current === controls) indicatorAnimationRef.current = null;
        });
      }
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
    };

    const onScroll = () => measureOverflow();
    const onResize = () => sync(true, true, true);
    const onFocusIn = (event) => {
      const tab = event.target instanceof Element ? event.target.closest(TAB_SELECTOR) : null;
      if (!tab || !viewport || variant !== 'overflow') return;
      const delta = revealDelta(viewport, tab, orientation);
      if (delta) scrollTo((scrollIsVertical ? viewport.scrollTop : viewport.scrollLeft) + delta);
    };
    const onPointerDown = () => stopScrollAnimation();
    const onWheel = () => stopScrollAnimation();
    const onTouchStart = () => stopScrollAnimation();

    // Observing a new label also queues an initial callback. Unchanged geometry
    // must leave the selection animation running.
    const labelResizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => sync(true, false));
    const disconnectReduced = observeReducedMotion(root, null, (nextReduced) => {
      reducedRef.current = nextReduced;
      setReduced(nextReduced);
      root.toggleAttribute('data-muxui-tabs-reduced', nextReduced);
      if (nextReduced) {
        const destination = scrollTarget;
        stopIndicatorAnimation();
        stopScrollAnimation();
        if (destination !== null) scrollTo(destination, true);
        const target = targetRef.current;
        if (target && indicator) applyLayers(indicator, foreground, target, indicatorRadius);
      }
      sync(true, false, true);
    });
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
      sync(records.some(({ attributeName }) => attributeName === 'dir'), true);
    });
    mutationObserver?.observe(list ?? root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'data-selected', 'data-disabled', 'disabled', 'dir'],
    });
    for (let ancestor = root; ancestor; ancestor = ancestor.parentElement) {
      mutationObserver?.observe(ancestor, { attributes: true, attributeFilter: ['dir'] });
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => sync(true, true, true));
    resizeObserver?.observe(root);
    if (list) resizeObserver?.observe(list);
    if (viewport) resizeObserver?.observe(viewport);
    viewport?.addEventListener('scroll', onScroll, { passive: true });
    viewport?.addEventListener('focusin', onFocusIn);
    root.addEventListener('pointerdown', onPointerDown, { passive: true });
    viewport?.addEventListener('wheel', onWheel, { passive: true });
    viewport?.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('resize', onResize);
    sync(true, true, true);

    return () => {
      active = false;
      stopIndicatorAnimation();
      stopScrollAnimation();
      scrollByRef.current = null;
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      labelResizeObserver?.disconnect();
      disconnectReduced();
      viewport?.removeEventListener('scroll', onScroll);
      viewport?.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('pointerdown', onPointerDown);
      viewport?.removeEventListener('wheel', onWheel);
      viewport?.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('resize', onResize);
      root.removeAttribute('data-muxui-tabs-reduced');
      root.removeAttribute('data-muxui-tabs-overflow');
      root.removeAttribute('data-muxui-tabs-direction');
      targetRef.current = null;
      observedLabelRef.current = null;
      readyRef.current = false;
    };
  }, [orientation, root, variant]);

  const beforeButton = variant === 'overflow' && edges.overflow
    ? React.createElement('button', {
      type: 'button',
      className: `muxui-tabs-motion-edge muxui-tabs-motion-edge--${orientation === 'vertical' ? 'before' : 'left'}`,
      'aria-label': orientation === 'vertical' ? 'Scroll tabs up' : 'Scroll tabs left',
      'aria-controls': `${instanceId}-viewport`,
      'aria-disabled': disabled || !edges.before || undefined,
      disabled: disabled || !edges.before,
      onClick: () => scrollByRef.current?.(-1),
    }, React.createElement(orientation === 'vertical' ? ChevronUpIcon : ChevronLeftIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 }))
    : null;
  const afterButton = variant === 'overflow' && edges.overflow
    ? React.createElement('button', {
      type: 'button',
      className: `muxui-tabs-motion-edge muxui-tabs-motion-edge--${orientation === 'vertical' ? 'after' : 'right'}`,
      'aria-label': orientation === 'vertical' ? 'Scroll tabs down' : 'Scroll tabs right',
      'aria-controls': `${instanceId}-viewport`,
      'aria-disabled': disabled || !edges.after || undefined,
      disabled: disabled || !edges.after,
      onClick: () => scrollByRef.current?.(1),
    }, React.createElement(orientation === 'vertical' ? ChevronDownIcon : ChevronRightIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 }))
    : null;

  const indicator = React.createElement('span', {
    ref: indicatorRef,
    className: 'muxui-tabs-motion-underline',
    'data-muxui-tabs-underline': 'true',
    'aria-hidden': 'true',
    style: { opacity: 0 },
  });
  const foreground = variant === 'underline' ? null : React.createElement('span', {
    ref: foregroundRef,
    className: 'muxui-tabs-motion-foreground',
    'aria-hidden': true,
    inert: true,
    style: { opacity: 0 },
  });
  const content = variant === 'overflow'
    ? React.createElement('div', { ref: viewportRef, id: `${instanceId}-viewport`, className: 'muxui-tabs-motion-overflow-viewport' },
      React.createElement('div', { ref: contentRef, className: 'muxui-tabs-motion-overflow-content' }, children, indicator, foreground))
    : React.createElement(React.Fragment, null, children, indicator, foreground);

  return React.createElement('div', {
    ref: setRoot,
    className: 'muxui-tabs-motion',
    'data-orientation': orientation,
    'data-muxui-tabs-variant': variant,
    'data-muxui-tabs-overflow': edges.overflow || undefined,
    'data-muxui-tabs-direction': direction,
    'data-muxui-tabs-ready': ready ? '' : undefined,
    'data-muxui-tabs-reduced': reduced ? '' : undefined,
  }, beforeButton, content, afterButton);
}
