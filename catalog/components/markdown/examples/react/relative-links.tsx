import { Markdown } from '@muxui/react/markdown';

// Heading depth is rendered as written, so this document starts at ## under the host page's h1.
// Markdown adds no heading ids, so the #summary link needs an element with that id on the host page.
const source = [
  '## Release notes',
  '',
  'Read the [changelog](/changelog) or [jump to the summary](#summary).',
  '',
  '![Release banner](/images/banner.png)',
  '',
  'An [archive link](ftp://example.com/archive.zip) keeps only its text, and an ![unsafe image](data:image/png;base64,AAAA) keeps only its alt text.',
].join('\n');

export function MarkdownRelativeLinksExample() {
  return <Markdown source={source} baseUrl="https://example.com/docs/" />;
}
