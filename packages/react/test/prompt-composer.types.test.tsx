import * as React from 'react';
import { PromptComposer, type PromptComposerProps } from '@muxui/react';
const form = React.createRef<HTMLFormElement>(); const input = React.createRef<HTMLTextAreaElement>();
const props: PromptComposerProps = { defaultValue: 'Draft', onSend: (value) => { value.toUpperCase(); }, onFilesSelected: (files) => { files[0]?.name; } };
const model = <PromptComposer models={[{ id: 'standard', label: 'Standard' }]} defaultSelectedModel="standard" selectedModel="standard" onModelChange={(id) => { const value: string = id; void value; }} />;
const native = <PromptComposer {...props} ref={form} inputRef={input} inputProps={{ name: 'draft', required: true, maxLength: 40, onSelect: (event) => { const textarea: HTMLTextAreaElement = event.currentTarget; void textarea; } }} onSubmit={(event) => { const nativeEvent: React.FormEvent<HTMLFormElement> = event; void nativeEvent; }} onChange={(event) => { const nativeEvent: React.ChangeEvent<HTMLFormElement> = event; void nativeEvent; }} onSuggestionSelect={(item, kind) => { void [item.insertText, kind]; }} />;
// @ts-expect-error Native onSubmit receives an event, not domain text.
const wrongSubmit = <PromptComposer onSubmit={(text: string) => { void text; }} />;
// @ts-expect-error The root ref points to the form.
const wrongRef = <PromptComposer ref={input} />;
// @ts-expect-error Text value is owned by the component-level field.
const wrongValue = <PromptComposer inputProps={{ value: 'duplicate' }} />;
void [native, model, wrongSubmit, wrongRef, wrongValue];
