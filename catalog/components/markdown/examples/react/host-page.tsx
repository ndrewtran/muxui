import { Text } from '@muxui/react';
import { Markdown } from '@muxui/react/markdown';

// The host page owns the h1 and the section heading, so the document starts at ###.
// A table stays as text and an HTML block is dropped with its text, because neither is in the subset.
const source = [
  '### Highlights',
  '',
  'This release adds **faster search** and a `--watch` flag.',
  '',
  '- Results appear as you type.',
  '- Reports export as CSV.',
  '',
  '> Upgrade notes are in the changelog.',
  '',
  '| Plan | Seats |',
  '| --- | --- |',
  '| Team | 10 |',
  '',
  '<div>Dropped with its text.</div>',
].join('\n');

export function MarkdownHostPageExample() {
  return (
    <article>
      <Text as="h1" variant="heading" size="lg">Release notes</Text>
      <Text as="h2" variant="title" size="lg">Version 1.4</Text>
      <Markdown source={source} />
    </article>
  );
}
