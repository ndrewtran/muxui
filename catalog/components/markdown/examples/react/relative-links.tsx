import { Markdown } from '@muxui/react/markdown';

const source = [
  '# Release notes',
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
