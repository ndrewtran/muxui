import { createRef } from 'react';
import { GridList, Virtualizer, type VirtualizerGridProps, type VirtualizerProps, type VirtualizerStackProps } from '@muxui/react';

const stackRef = createRef<HTMLDivElement>();
const gridRef = createRef<HTMLDivElement>();

const stack = <Virtualizer ref={stackRef} aria-label="Results" items={['One']} height={160} itemHeight={32} overscan={1} />;
const explicitStack = <Virtualizer layout="stack" aria-label="Results" onScroll={() => {}} className="results" style={{ inlineSize: 240 }} />;
const grid = <Virtualizer layout="grid" minItemWidth={160} maxItemWidth={320} estimatedItemHeight={280} maxColumns={6} overscan={3}>
  <GridList aria-label="Posters" layout="grid" style={{ blockSize: 480 }}>
    <GridList.Item id="a">Alpha</GridList.Item>
  </GridList>
</Virtualizer>;
const bareGrid = <Virtualizer layout="grid"><GridList aria-label="Posters" layout="grid" ref={gridRef} /></Virtualizer>;
const stackProps: VirtualizerStackProps = { 'aria-label': 'Results' };
const gridProps: VirtualizerGridProps = { layout: 'grid', children: <GridList aria-label="Posters" layout="grid" /> };
const props: VirtualizerProps[] = [stackProps, gridProps];
void [stack, explicitStack, grid, bareGrid, props];

// @ts-expect-error grid mode renders the GridList as its only content, so it takes no items.
const gridItems = <Virtualizer layout="grid" items={['One']}><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error the GridList carries the accessible name, not the grid Virtualizer.
const gridLabel = <Virtualizer layout="grid" aria-label="Posters"><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error grid mode needs its GridList child.
const gridNoChild = <Virtualizer layout="grid" />;
// @ts-expect-error grid mode renders no element of its own, so it takes no ref.
const gridWithRef = <Virtualizer layout="grid" ref={gridRef}><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error the GridList owns scroll size and spacing, so grid mode takes no height.
const gridHeight = <Virtualizer layout="grid" height={480}><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error stack mode sizes rows with itemHeight and takes no column cap.
const stackMaxColumns = <Virtualizer aria-label="Results" maxColumns={4} />;
// @ts-expect-error stack mode takes no grid item width.
const stackMinWidth = <Virtualizer layout="stack" aria-label="Results" minItemWidth={160} />;
// @ts-expect-error layout accepts stack or grid.
const masonry = <Virtualizer layout="masonry" aria-label="Results" />;
// @ts-expect-error overscan counts whole rows as a number.
const rowsOverscan = <Virtualizer layout="grid" overscan={{ rows: 2 }}><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
void [gridItems, gridLabel, gridNoChild, gridWithRef, gridHeight, stackMaxColumns, stackMinWidth, masonry, rowsOverscan];
