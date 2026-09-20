import React from 'react';
import { ProgressCircle } from '../../src/supplemental/index.mjs';

const h = React.createElement;

/**
 * Consumer-shaped ProgressCircle fixture covering a compact tab indicator,
 * a determinate progress display, and a decorative SVG inside an action.
 */
export function ProgressCircleConsumerFixture() {
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    const root = rootRef.current;
    document.documentElement.dataset.progressCircleReady = `${root?.tagName ?? ''}:${root?.getAttribute('role') ?? ''}`;
  }, []);

  return h('main', { 'data-muxui-progress-circle-consumer': 'true' },
    h('style', null, `
      .consumer-progress-circle--compact .muxui-progress-circle__track,
      .consumer-progress-circle__track {
        inline-size: 16px;
        block-size: 16px;
      }

      /* A decorative Track-only icon owns its compact, static pending treatment. */
      .consumer-progress-circle__track .muxui-progress-circle__indicator[data-indeterminate] {
        stroke-dasharray: 28 72;
        animation: none;
      }
    `),
    h('section', { id: 'tab-loading', style: { inlineSize: '10px', blockSize: '16px', overflow: 'visible' } },
      h(ProgressCircle.Root, {
        ref: rootRef,
        size: 'sm',
        value: null,
        className: 'consumer-progress-circle--compact',
        label: 'Loading tab',
      }, h(ProgressCircle.Track)),
    ),
    h('section', { id: 'session-import' },
      h(ProgressCircle.Root, {
        value: 65,
        minValue: 0,
        maxValue: 100,
      },
      h(ProgressCircle.Track),
      h(ProgressCircle.Label, null, 'Session import'),
      h(ProgressCircle.Value),
      ),
    ),
    h('button', { id: 'decorative-action', type: 'button', 'aria-label': 'View session import progress' },
      h('span', { id: 'decorative-track-wrapper', 'aria-hidden': 'true' },
        h(ProgressCircle.Track, { className: 'consumer-progress-circle__track' }),
      ),
    ),
  );
}
