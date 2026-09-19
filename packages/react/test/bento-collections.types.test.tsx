import { createRef } from 'react';
import { ListBox, Menu, Select, type MuxUISelection } from '@muxui/react';

const buttonRef = createRef<HTMLButtonElement>();
const spanRef = createRef<HTMLSpanElement>();
const itemRef = createRef<HTMLDivElement>();
const separatorRef = createRef<HTMLHRElement>();
const anchorRef = createRef<Element>();

const list = <ListBox.Root aria-label="Colors" layout="grid" orientation="vertical" selectedIds={['red']}
  onSelectionChange={(ids: MuxUISelection) => { void ids; }} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
  <ListBox.Section title={<strong>Colors</strong>}><ListBox.Item id="red" ref={itemRef} textValue="Red"><strong>Red</strong></ListBox.Item></ListBox.Section>
</ListBox.Root>;

const menu = <Menu.Root open={false} onOpenChange={(open: boolean) => { void open; }} onAction={(item) => { const id: string | undefined = item?.id; void id; }}>
  <Menu.Trigger ref={buttonRef} onPointerDown={(event) => { event.currentTarget.focus(); }} onActivate={(event) => { const kind: 'activate' = event.type; void kind; }}>Actions</Menu.Trigger>
  <Menu.Popup anchorRef={anchorRef} placement="end-top" offset={4} modal={false}>
    <Menu.List><Menu.Section title={<strong>Edit</strong>}><Menu.Item id="cut" onAction={() => {}}>Cut</Menu.Item></Menu.Section><Menu.Separator ref={separatorRef} />
      <Menu.Submenu delay={200}><Menu.Item id="share">Share</Menu.Item><Menu.Popup><Menu.List><Menu.Item id="email">Email</Menu.Item></Menu.List></Menu.Popup></Menu.Submenu>
    </Menu.List>
  </Menu.Popup>
</Menu.Root>;

const select = <Select.Root name="city" value="melbourne" onChange={(value: string | undefined) => { void value; }}>
  <Select.Label ref={spanRef}>City</Select.Label><Select.Trigger ref={buttonRef} onContextMenu={(event) => event.preventDefault()}><Select.Value ref={spanRef} /></Select.Trigger>
  <Select.Popup anchorRef={anchorRef} modal={false}><Select.List><Select.Item id="melbourne" textValue="Melbourne"><strong>Melbourne</strong></Select.Item></Select.List></Select.Popup>
  <Select.Description ref={spanRef}>Description</Select.Description><Select.Error ref={spanRef}>Error</Select.Error>
</Select.Root>;
const customTrigger = <Select label="City" items={['Melbourne']} selectedContent={<strong>City</strong>}
  trigger={<button ref={buttonRef} onClick={(event) => event.currentTarget.focus()}><Select.Value /></button>} />;
void [list, menu, select, customTrigger];

// @ts-expect-error Compound items require stable string IDs.
const missingItemId = <ListBox.Item>Missing</ListBox.Item>;
// @ts-expect-error Root composition cannot expose upstream selection keys.
const upstreamSelect = <Select label="City" selectedKey="melbourne" />;
// @ts-expect-error Select.Value does not expose upstream state/render-prop objects.
const upstreamValue = <Select.Value>{() => 'City'}</Select.Value>;
// @ts-expect-error Menu.Submenu is a non-DOM owner and has no public ref.
const submenuRef = <Menu.Submenu ref={itemRef}><Menu.Item id="one">One</Menu.Item><Menu.Popup /></Menu.Submenu>;
// @ts-expect-error Menu.Submenu has no DOM class.
const submenuClass = <Menu.Submenu className="submenu"><Menu.Item id="one">One</Menu.Item><Menu.Popup /></Menu.Submenu>;
// @ts-expect-error Logical placements do not admit physical left/right sides.
const physicalPlacement = <Select label="City" placement="left" />;
// @ts-expect-error Simple Select still requires an accessible name.
const unnamed = <Select items={['one']} />;
void [missingItemId, upstreamSelect, upstreamValue, submenuRef, submenuClass, physicalPlacement, unnamed];
