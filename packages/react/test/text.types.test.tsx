import { createRef } from 'react';
import { Text, type TextProps } from '@muxui/react';

const spanRef = createRef<HTMLSpanElement>();
const headingRef = createRef<HTMLHeadingElement>();
const labelRef = createRef<HTMLLabelElement>();

const nativeHosts = (
  <>
    <Text ref={spanRef} id="body-copy" data-section="account" onClick={(event) => {
      const host: HTMLSpanElement = event.currentTarget;
      void host;
    }}>Body</Text>
    <Text as="h2" ref={headingRef} variant="heading" size="md" role="note">Heading</Text>
    <Text as="h3" variant="title">Section</Text>
    <Text as="label" ref={labelRef} htmlFor="name" variant="label" size="sm">Name</Text>
    <Text as="p" title="Source paragraph" color="muted" truncate>Paragraph</Text>
  </>
);
void nativeHosts;

const explicitProps: TextProps<'h3'> = {
  as: 'h3',
  variant: 'title',
  size: 'lg',
  color: 'muted',
  truncate: true,
  id: 'title',
};
void explicitProps;

// Without a type argument, the props are a span's: the host is the default of TextProps and of the call signature, each its own form.
const defaultProps: TextProps = { id: 'copy', onClick: (event) => { const host: HTMLSpanElement = event.currentTarget; void host; } };
void defaultProps;
// @ts-expect-error TextProps without a type argument is a span's, which has no htmlFor.
const defaultHtmlFor: TextProps = { htmlFor: 'name' };
void defaultHtmlFor;
// @ts-expect-error A Text with no as is a span, which has no htmlFor.
const spanHtmlFor = <Text htmlFor="name">Name</Text>;
void spanHtmlFor;
// @ts-expect-error TextProps takes one of the semantic text elements.
type ArticleProps = TextProps<'article'>;

// Text keeps its own finite visual vocabulary.
// @ts-expect-error Text variants do not accept arbitrary strings.
const invalidVariant = <Text variant="caption">Caption</Text>;
void invalidVariant;
// @ts-expect-error Text sizes do not accept arbitrary strings.
const invalidSize = <Text size="medium">Body</Text>;
void invalidSize;
// @ts-expect-error The former type-scale size names are not Text sizes.
const typeScaleSize = <Text size="m">Body</Text>;
void typeScaleSize;
// @ts-expect-error Display roles only expose sm, md, and lg sizes.
const invalidDisplaySize = <Text variant="heading" size="xs">Heading</Text>;
void invalidDisplaySize;
// @ts-expect-error Text hosts are limited to semantic text elements.
const invalidHost = <Text as="article">Article</Text>;
void invalidHost;
// @ts-expect-error RAC's implementation-only elementType must not leak through the Mux API.
const upstreamElementType = <Text elementType="h1">Heading</Text>;
void upstreamElementType;
// @ts-expect-error The ref follows the selected native host.
const wrongHostRef = <Text as="h2" ref={spanRef}>Heading</Text>;
void wrongHostRef;
// @ts-expect-error RAC's isDisabled prop is not a Text prop.
const upstreamProp = <Text isDisabled>Body</Text>;
void upstreamProp;
