import { Markdown } from '@muxui/react/markdown';

// Heading depth is rendered as written. This document sits under the host page's h1, so it starts at ##.
export function BasicMarkdown() { return <Markdown source={'## Notes\n\nA [safe link](https://example.com).'} />; }
