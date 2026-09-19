import * as React from 'react';
import { Button, CommandPalette, IconButton, SearchField, TextField, type FieldInputProps } from '@muxui/react';

const inputRef = React.createRef<HTMLInputElement>();
const fieldRef = React.createRef<HTMLDivElement>();
const buttonRef = React.createRef<HTMLButtonElement>();
const inputProps = {
  className: 'application-input',
  onKeyDown(event) { if (!event.nativeEvent.isComposing && event.key === 'Enter') event.currentTarget.select(); },
  onPaste(event) { const text: string = event.clipboardData.getData('text/plain'); void text; },
  onFocus(event) { event.currentTarget.setSelectionRange(0, 1); },
  onBlur(event) { const value: string = event.currentTarget.value; void value; },
  onSelect(event) { const start: number | null = event.currentTarget.selectionStart; void start; },
} satisfies FieldInputProps;

const fields = <>
  <TextField id="name" label="Name" ref={fieldRef} inputRef={inputRef} inputProps={inputProps} onChange={(value) => { const text: string = value; void text; }} />
  <SearchField id="query" label="Query" ref={fieldRef} inputRef={inputRef} inputProps={inputProps} />
  <CommandPalette.Root>
    <CommandPalette.Content>
      <CommandPalette.Input ref={inputRef} value="controlled" onChange={(event) => { const text: string = event.currentTarget.value; void text; }} {...inputProps} />
      <CommandPalette.ListBox><CommandPalette.Item id="result" title="External result" onActivate={({ id }) => { const selected: string | undefined = id; void selected; }} /></CommandPalette.ListBox>
    </CommandPalette.Content>
  </CommandPalette.Root>
</>;
void fields;

const pointerProps = {
  onPointerDown(event) { event.currentTarget.setPointerCapture(event.pointerId); },
  onPointerMove(event) { const id: number = event.pointerId; void id; },
  onPointerUp(event) { event.currentTarget.releasePointerCapture(event.pointerId); },
  onPointerCancel(event) { const host: HTMLButtonElement = event.currentTarget; void host; },
  onLostPointerCapture(event) { const host: HTMLButtonElement = event.currentTarget; void host; },
  onAuxClick(event) { const button: number = event.button; void button; },
  onContextMenu(event) { event.preventDefault(); },
} satisfies React.ButtonHTMLAttributes<HTMLButtonElement>;
const buttons = <><Button ref={buttonRef} {...pointerProps} onActivate={() => {}}>Action</Button><IconButton ref={buttonRef} aria-label="Action" {...pointerProps} onActivate={() => {}}>X</IconButton></>;
void buttons;

const outerRefContract = <TextField label="Name" ref={(node) => { const field: HTMLDivElement | null = node; void field; }} />;
// @ts-expect-error inputRef points to the native input, not the outer field.
const incorrectInputRef = <SearchField label="Search" inputRef={fieldRef} />;
// @ts-expect-error Root value ownership cannot be bypassed through inputProps.
const nestedValue = <TextField label="Name" inputProps={{ value: 'other' }} />;
// @ts-expect-error Root onChange owns the value callback.
const nestedChange = <SearchField label="Search" inputProps={{ onChange: () => {} }} />;
// @ts-expect-error Root validation ownership cannot be bypassed through inputProps.
const nestedDisabled = <TextField label="Name" inputProps={{ disabled: true }} />;
// @ts-expect-error Root accessible naming cannot be bypassed through inputProps.
const nestedLabel = <SearchField label="Search" inputProps={{ 'aria-label': 'Other' }} />;
// @ts-expect-error Query state belongs on CommandPalette.Input.
const misplacedQuery = <CommandPalette.Content inputValue="query" />;
// @ts-expect-error Upstream press handlers are not part of the Mux action contract.
const upstreamPress = <Button onPress={() => {}}>Action</Button>;
// @ts-expect-error Upstream disabled names are not part of the Mux action contract.
const upstreamDisabled = <IconButton aria-label="Action" isDisabled>X</IconButton>;
void [outerRefContract, incorrectInputRef, nestedValue, nestedChange, nestedDisabled, nestedLabel, misplacedQuery, upstreamPress, upstreamDisabled];
