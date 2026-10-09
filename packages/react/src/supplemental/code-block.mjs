import React from 'react';
import Check from 'lucide-react/dist/esm/icons/check.mjs';
import CodeXml from 'lucide-react/dist/esm/icons/code-xml.mjs';
import Copy from 'lucide-react/dist/esm/icons/copy.mjs';
import { Tooltip } from '../overlays.mjs';
import { useCandidateMotion } from './candidate-motion.mjs';
import { IconButton } from './icon-button.mjs';
import { highlightCodeDocuments } from './code-block-highlight.mjs';

const MAX_LENGTH = 1_000_000;
const MAX_LINES = 10_000;
const MAX_DIFF_CELLS = 250_000;

function linesOf(source, name) {
  if (typeof source !== 'string') throw new TypeError(`CodeBlock ${name} must be a string.`);
  if (source.length > MAX_LENGTH) throw new RangeError(`CodeBlock ${name} exceeds 1,000,000 characters.`);
  const lines = source === '' ? [] : source.split('\n');
  if (lines.length > MAX_LINES) throw new RangeError(`CodeBlock ${name} exceeds 10,000 lines.`);
  return lines;
}

// Trim equal edges before allocating a bounded LCS table. Large middle changes
// remain exact, but are honestly shown as a replacement rather than a minimal diff.
function diffLines(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  const rows = before.slice(0, start).map((text, index) => ({ text, kind: 'context', old: index + 1, next: index + 1 }));
  let old = start;
  let next = start;
  const oldCount = oldEnd - start;
  const newCount = newEnd - start;
  const coarse = oldCount > 0 && newCount > 0 && (oldCount + 1) * (newCount + 1) > MAX_DIFF_CELLS;
  if (coarse) {
    while (old < oldEnd) rows.push({ text: before[old], kind: 'removed', old: ++old });
    while (next < newEnd) rows.push({ text: after[next], kind: 'added', next: ++next });
  } else {
    const width = newCount + 1;
    const table = new Uint16Array((oldCount + 1) * width);
    for (let i = oldCount - 1; i >= 0; i--) {
      for (let j = newCount - 1; j >= 0; j--) {
        table[i * width + j] = before[start + i] === after[start + j]
          ? 1 + table[(i + 1) * width + j + 1]
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    while (old < oldEnd || next < newEnd) {
      if (old < oldEnd && next < newEnd && before[old] === after[next]) {
        rows.push({ text: before[old], kind: 'context', old: ++old, next: ++next });
      } else if (old < oldEnd && (next === newEnd || table[(old - start + 1) * width + next - start] >= table[(old - start) * width + next - start + 1])) {
        rows.push({ text: before[old], kind: 'removed', old: ++old });
      } else {
        rows.push({ text: after[next], kind: 'added', next: ++next });
      }
    }
  }
  while (old < before.length) rows.push({ text: before[old], kind: 'context', old: ++old, next: ++next });
  return { rows, coarse };
}

/** Escaped code and bounded line diffs. The copy action always uses the exact input. */
export const CodeBlock = React.forwardRef(function CodeBlock({
  mode = 'code', source, before, after, language, filename,
  lineNumbers = true, copyable = true, wrap = false,
  className, children, dangerouslySetInnerHTML, ...props
}, ref) {
  if (mode !== 'code' && mode !== 'diff') throw new TypeError('CodeBlock mode must be code or diff.');
  if (children !== undefined || dangerouslySetInnerHTML !== undefined) throw new TypeError('CodeBlock content is owned by source or before/after.');
  if (mode === 'code' && (before !== undefined || after !== undefined) || mode === 'diff' && source !== undefined) {
    throw new TypeError('CodeBlock source and before/after modes cannot be combined.');
  }
  const content = mode === 'diff' ? after : source;
  const listing = React.useMemo(() => {
    if (mode === 'diff') return diffLines(linesOf(before, 'before'), linesOf(after, 'after'));
    const lines = linesOf(source, 'source');
    return { rows: (lines.length ? lines : ['']).map((text, index) => ({ text, kind: 'context', next: index + 1 })), coarse: false };
  }, [mode, source, before, after]);
  const identity = React.useMemo(() => ({ mode, source, before, after, language }), [mode, source, before, after, language]);
  const [highlight, setHighlight] = React.useState(null);
  React.useEffect(() => {
    let active = true;
    highlightCodeDocuments(mode === 'diff' ? [before, after] : [source], language).then((documents) => {
      if (active) setHighlight(documents ? { identity, documents } : null);
    });
    return () => { active = false; };
  }, [identity]);
  const highlighted = highlight?.identity === identity ? highlight.documents : null;
  const [copy, setCopy] = React.useState({ content, mode, status: 'idle' });
  const request = React.useRef(0);
  const feedbackTimer = React.useRef(null);
  const feedbackDismissed = React.useRef(false);
  const lastPointerType = React.useRef(null);
  const clearFeedbackTimer = React.useCallback(() => {
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = null;
  }, []);
  React.useEffect(() => {
    request.current++;
    clearFeedbackTimer();
    setCopy({ content, mode, status: 'idle' });
    return () => { request.current++; clearFeedbackTimer(); };
  }, [content, mode, copyable, clearFeedbackTimer]);
  const currentCopy = copy.content === content && copy.mode === mode && copyable;
  const status = currentCopy ? copy.status : 'idle';
  const dismissFeedback = () => {
    // A pointer leaving during the write must not reopen feedback on fulfillment.
    feedbackDismissed.current = true;
    clearFeedbackTimer();
    setCopy((previous) => previous.status === 'copied' ? { ...previous, status: 'idle' } : previous);
  };
  const copyButton = React.useRef(null);
  const copyIcon = React.useRef(null);
  useCandidateMotion(copyIcon, status, { active: status === 'copied' || status === 'error' });
  const legendId = React.useId();
  const added = listing.rows.filter((row) => row.kind === 'added').length;
  const removed = listing.rows.filter((row) => row.kind === 'removed').length;
  const copyError = mode === 'diff'
    ? 'Could not copy updated code. Clipboard access failed.'
    : 'Could not copy code. Select and copy the code manually.';
  const copyText = async () => {
    const id = ++request.current;
    const clipboard = copyButton.current?.ownerDocument.defaultView?.navigator.clipboard;
    clearFeedbackTimer();
    feedbackDismissed.current = false;
    setCopy({ content, mode, status: 'pending' });
    try {
      if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await clipboard.writeText(content);
      if (id === request.current) {
        setCopy({ content, mode, status: feedbackDismissed.current ? 'idle' : 'copied', succeeded: true });
        if (!feedbackDismissed.current) feedbackTimer.current = setTimeout(() => {
          if (id === request.current) dismissFeedback();
        }, 3000);
      }
    } catch {
      if (id === request.current) setCopy({ content, mode, status: 'error' });
    }
  };
  return React.createElement('div', {
    ...props, ref,
    className: ['muxui-code-block', className].filter(Boolean).join(' '),
    'data-mode': mode,
    'data-wrap': wrap || undefined,
    'data-line-numbers': lineNumbers || undefined,
    'data-copy-state': status,
    'data-diff-strategy': mode === 'diff' ? listing.coarse ? 'replacement' : 'minimal' : undefined,
  },
  (filename || language || copyable || mode === 'diff') && React.createElement('div', { className: 'muxui-code-block-header' },
    React.createElement(CodeXml, { className: 'muxui-code-block-icon', size: 16, 'aria-hidden': true, focusable: 'false' }),
    React.createElement('span', { className: 'muxui-code-block-filename' }, filename || language),
    mode === 'diff' && React.createElement('span', { className: 'muxui-code-block-counts', role: 'group', 'aria-label': `${added} added lines, ${removed} removed lines` },
      React.createElement('span', { className: 'muxui-code-block-added-count', 'aria-hidden': true }, `+${added}`),
      React.createElement('span', { className: 'muxui-code-block-removed-count', 'aria-hidden': true }, `−${removed}`)),
    copyable && React.createElement(Tooltip, {
      content: 'Copied', open: status === 'copied', disabled: status !== 'copied',
      onOpenChange: (open) => { if (!open && status === 'copied') dismissFeedback(); },
      trigger: React.createElement(IconButton, {
      ref: copyButton, variant: 'neutral', size: 'sm',
      type: 'button', className: 'muxui-code-block-copy', onActivate: copyText,
      disabled: status === 'pending', pending: status === 'pending',
      onPointerEnter: (event) => { lastPointerType.current = event.pointerType; },
      onPointerDown: (event) => { lastPointerType.current = event.pointerType; },
      onPointerLeave: (event) => { if (event.pointerType !== 'touch') dismissFeedback(); },
      // Touch activation can synthesize a mouse departure after fulfillment.
      onMouseLeave: () => { if (lastPointerType.current !== 'touch') dismissFeedback(); },
      onBlur: () => { if (status === 'copied') dismissFeedback(); },
      onKeyDown: (event) => { if (event.key === 'Escape') dismissFeedback(); },
      'aria-label': mode === 'diff' ? 'Copy updated code' : 'Copy code',
    }, React.createElement('span', { ref: copyIcon, className: 'muxui-code-block-copy-icon' },
      React.createElement(status === 'copied' ? Check : Copy, { size: 16, 'aria-hidden': true, focusable: 'false' }))),
    })),
  listing.coarse && React.createElement('p', { className: 'muxui-code-block-notice' }, 'Large change shown as removed and added lines.'),
  mode === 'diff' && lineNumbers && React.createElement('span', { id: legendId, className: 'muxui-code-block-sr-only' }, 'Original line numbers are in the first column. Updated line numbers are in the second.'),
  React.createElement('pre', { className: 'muxui-code-block-pre', style: { '--muxui-code-block-gutter-width': `${String(listing.rows.length).length}ch` }, tabIndex: 0, 'aria-label': mode === 'diff' ? 'Code changes' : 'Code', 'aria-describedby': mode === 'diff' && lineNumbers ? legendId : undefined },
    React.createElement('code', { className: 'muxui-code-block-code', 'data-language': language }, listing.rows.map((row, index) =>
      React.createElement('span', { className: 'muxui-code-block-line', key: index, 'data-change': row.kind },
        lineNumbers && mode === 'diff' && React.createElement('span', { className: 'muxui-code-block-number', 'aria-hidden': true, 'data-line-number': row.old ?? '' }),
        lineNumbers && React.createElement('span', { className: 'muxui-code-block-number', 'aria-hidden': true, 'data-line-number': row.next ?? '' }),
        mode === 'diff' && React.createElement('span', { className: 'muxui-code-block-marker', 'aria-hidden': true, 'data-marker': row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' ' }),
        row.kind !== 'context' && React.createElement('span', { className: 'muxui-code-block-sr-only' }, `${row.kind === 'added' ? 'Added' : 'Removed'} line: `),
        React.createElement('span', { className: 'muxui-code-block-text' },
          highlighted
            ? [highlighted[mode === 'diff' && row.kind !== 'removed' ? 1 : 0][(row.kind === 'removed' ? row.old : row.next) - 1]?.map((token, tokenIndex) =>
              React.createElement('span', { key: tokenIndex, className: token.role ? `muxui-code-block-token-${token.role}` : undefined }, token.text)) ?? row.text,
              index < listing.rows.length - 1 ? '\n' : '']
            : row.text + (index < listing.rows.length - 1 ? '\n' : '')))))),
  React.createElement('span', { className: 'muxui-code-block-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': true },
    currentCopy && copy.succeeded ? 'Code copied.' : status === 'error' ? copyError : ''),
  status === 'error' && React.createElement('p', { className: 'muxui-code-block-notice', 'aria-hidden': true }, copyError));
});

CodeBlock.displayName = 'CodeBlock';
