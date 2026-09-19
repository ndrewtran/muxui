import * as React from 'react';
import { AlertDialog, Button, Dialog, Popover, PreviewTrigger, Tooltip, type MuxUIPlacement } from '@muxui/react';

const placements: MuxUIPlacement[] = ['top', 'bottom', 'start', 'end', 'top-start', 'top-end', 'bottom-start', 'bottom-end', 'start-top', 'start-bottom', 'end-top', 'end-bottom'];
const anchorRef = React.createRef<HTMLDivElement>();
const trigger = <Button>Open</Button>;

for (const placement of placements) {
  <Popover aria-label="Details" trigger={trigger} placement={placement} anchorRef={anchorRef} modal={false} offset={4} crossOffset={-2} shouldFlip={false} containerPadding={0}>Details</Popover>;
  <Tooltip trigger={trigger} content="Help" placement={placement} anchorRef={anchorRef} />;
  <PreviewTrigger aria-label="Preview" trigger={trigger} placement={placement}>Preview</PreviewTrigger>;
}

<Dialog title="Review" description={<>Check your changes.</>} actions={<Button>Save</Button>} trigger={trigger}
  backdropClassName="backdrop" panelClassName="panel" titleClassName="title" descriptionClassName="description"
  contentClassName="content" actionsClassName="actions" closeClassName="close" aria-describedby="other-context" />;

<AlertDialog.Content aria-describedby="other-context"><AlertDialog.Title>Delete?</AlertDialog.Title><AlertDialog.Description id="description">Cannot be undone.</AlertDialog.Description></AlertDialog.Content>;

// @ts-expect-error Mux placements use logical sides, not physical sides.
<Popover aria-label="Details" trigger={trigger} placement="left" />;
// @ts-expect-error Mux placements use hyphenated alignments.
<Tooltip trigger={trigger} content="Help" placement="bottom start" />;
// @ts-expect-error Upstream non-modal naming is not part of the Mux API.
<Popover aria-label="Details" trigger={trigger} isNonModal />;
// @ts-expect-error Geometry anchors are refs to existing DOM elements.
<Tooltip trigger={trigger} content="Help" anchorRef={{ current: { x: 10, y: 10 } }} />;
// @ts-expect-error Modal is a boolean switch.
<Popover aria-label="Details" trigger={trigger} modal="false" />;
// @ts-expect-error An independent geometry anchor does not replace the required trigger.
<Popover aria-label="Details" anchorRef={anchorRef} open />;
