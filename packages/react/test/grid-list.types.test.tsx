import { createRef } from 'react';
import { GridList, type GridListItemProps, type GridListProps, type MuxUISelection } from '@muxui/react';

const rootRef = createRef<HTMLDivElement>();
const itemRef = createRef<HTMLDivElement>();

const cards = <GridList ref={rootRef} aria-label="Cards" layout="grid" orientation="horizontal" selectedIds={['a']} style={{ maxBlockSize: 320 }}
  onSelectionChange={(ids: MuxUISelection) => { void ids; }}
  onAction={(item) => { const id: string | undefined = item?.id; void id; }}>
  <GridList.Item id="a" ref={itemRef} textValue="Alpha" className="poster" style={{ minBlockSize: 120 }}><strong>Alpha</strong></GridList.Item>
  <GridList.Item id="b" disabled>Beta</GridList.Item>
</GridList>;
const stack = <GridList aria-label="Files" layout="stack" orientation="vertical" items={['One']} />;
const rootProps: GridListProps = { 'aria-label': 'Files', layout: 'grid' };
const itemProps: GridListItemProps = { id: 'a' };
void [cards, stack, rootProps, itemProps];

// @ts-expect-error layout accepts stack or grid.
const masonry = <GridList aria-label="Files" layout="masonry" />;
// @ts-expect-error orientation accepts vertical or horizontal.
const diagonal = <GridList aria-label="Files" orientation="diagonal" />;
// @ts-expect-error GridList.Item forwards only its declared props.
const itemClick = <GridList.Item id="a" onClick={() => {}}>Alpha</GridList.Item>;
// @ts-expect-error GridList.Item requires a stable string id.
const missingId = <GridList.Item>Alpha</GridList.Item>;
// @ts-expect-error GridList still needs an accessible name.
const unnamed = <GridList items={['One']} />;
void [masonry, diagonal, itemClick, missingId, unnamed];
