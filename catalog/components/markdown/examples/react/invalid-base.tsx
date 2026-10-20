import { Markdown } from '@muxui/react/markdown';

export function MarkdownInvalidBaseExample() {
  return <Markdown source="## Release notes" baseUrl="/docs/" invalidFallback="These notes could not be shown." />;
}
