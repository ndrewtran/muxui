import {
  MARKDOWN_DEPTH_LIMIT,
  MARKDOWN_LINE_LENGTH_LIMIT,
  MARKDOWN_LINE_LIMIT,
  MARKDOWN_NODE_LIMIT,
  MARKDOWN_SOURCE_LIMIT,
  Markdown,
  type MarkdownProps,
} from '@muxui/react/markdown';

const limits: readonly number[] = [
  MARKDOWN_SOURCE_LIMIT,
  MARKDOWN_LINE_LIMIT,
  MARKDOWN_LINE_LENGTH_LIMIT,
  MARKDOWN_DEPTH_LIMIT,
  MARKDOWN_NODE_LIMIT,
];
const props: MarkdownProps = { source: '# Title', baseUrl: 'https://example.com/', invalidFallback: 'Unavailable' };
const markdown = <Markdown {...props} />;
void [limits, markdown];

// @ts-expect-error The limits are numbers, not any.
const text: string = MARKDOWN_LINE_LENGTH_LIMIT;
void text;

// The limits are `number`, not their literal values: a variable typed by one can hold any number.
let sourceLimit: typeof MARKDOWN_SOURCE_LIMIT = MARKDOWN_SOURCE_LIMIT;
sourceLimit = 1;
void sourceLimit;
