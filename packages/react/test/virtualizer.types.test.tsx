import { createRef } from 'react';
import type { ComponentProps, SyntheticEvent, UIEvent } from 'react';
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

// The grid arm forbids every prop that belongs to the stack arm or the GridList, one by one, and the stack arm forbids the grid's child.
// @ts-expect-error the GridList owns its row height, so grid mode takes no itemHeight.
const gridItemHeight = <Virtualizer layout="grid" itemHeight={40}><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error the GridList disables itself, so grid mode takes no disabled.
const gridDisabled = <Virtualizer layout="grid" disabled><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error the GridList handles its own scrolling, so grid mode takes no onScroll.
const gridOnScroll = <Virtualizer layout="grid" onScroll={() => {}}><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error the GridList carries its own class, so grid mode takes no className.
const gridClassName = <Virtualizer layout="grid" className="posters"><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error the GridList carries its own style, so grid mode takes no style.
const gridStyle = <Virtualizer layout="grid" style={{ blockSize: 480 }}><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error the GridList carries the accessible name, so grid mode takes no aria-labelledby either.
const gridLabelledBy = <Virtualizer layout="grid" aria-labelledby="heading"><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error a stack renders its own items, so it takes no child.
const stackChild = <Virtualizer layout="stack" aria-label="Results"><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error without layout="grid" the props are the stack's, which take no child.
const implicitStackChild = <Virtualizer aria-label="Results"><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
// @ts-expect-error the stack layout still needs its aria-label.
const unnamedStack = <Virtualizer layout="stack" items={['One']} />;
// @ts-expect-error a grid's child must be an element, not text.
const gridTextChild = <Virtualizer layout="grid">text</Virtualizer>;
void [gridItemHeight, gridDisabled, gridOnScroll, gridClassName, gridStyle, gridLabelledBy, stackChild, implicitStackChild, unnamedStack, gridTextChild];

// Optionality differs by arm: layout may be left off a stack, and must be given on a grid; overscan is optional on both.
const defaultLayout = <Virtualizer aria-label="Results" />;
const stackOverscan = <Virtualizer aria-label="Results" overscan={0} />;
const gridOverscan = <Virtualizer layout="grid" overscan={0}><GridList aria-label="Posters" layout="grid" /></Virtualizer>;
const gridSizing: VirtualizerGridProps = { layout: 'grid', children: <GridList aria-label="Posters" layout="grid" />, minItemWidth: 120, maxItemWidth: 240, estimatedItemHeight: 200, maxColumns: 4, overscan: 1 };
const stackOnly: VirtualizerStackProps = { 'aria-label': 'Results', layout: 'stack', items: ['One'], height: 200, itemHeight: 32, overscan: 1, disabled: true, className: 'results', style: { inlineSize: 200 } };
void [defaultLayout, stackOverscan, gridOverscan, gridSizing, stackOnly];

// @ts-expect-error height is a number of pixels, not a CSS length.
const heightString = <Virtualizer aria-label="Results" height="240px" />;
// @ts-expect-error itemHeight is a number of pixels, not a CSS length.
const itemHeightString = <Virtualizer aria-label="Results" itemHeight="2rem" />;
// @ts-expect-error disabled is a boolean.
const disabledString = <Virtualizer aria-label="Results" disabled="yes" />;
void [heightString, itemHeightString, disabledString];

// @ts-expect-error a grid arm without its layout is not a grid.
const gridMissingLayout: VirtualizerGridProps = { children: <GridList aria-label="Posters" layout="grid" /> };
// @ts-expect-error a grid arm needs its child.
const gridMissingChild: VirtualizerGridProps = { layout: 'grid' };
// @ts-expect-error a stack arm is named by aria-label.
const stackMissingName: VirtualizerStackProps = { items: ['One'] };
void [gridMissingLayout, gridMissingChild, stackMissingName];

// Ref: the stack arm takes one to its viewport, and the grid arm, which renders no element, takes none (above, gridWithRef).
const viewportRef = createRef<HTMLDivElement>();
const stackWithRef = <Virtualizer layout="stack" aria-label="Results" ref={viewportRef} />;
// @ts-expect-error the ref belongs to a div; a button ref does not fit the viewport.
const wrongRef = <Virtualizer aria-label="Results" ref={createRef<HTMLButtonElement>()} />;
void [stackWithRef, wrongRef];

// onScroll keeps React's bivariant UIEventHandler, as it was before the move, so a handler declared with a narrower event type
// is accepted by the stack props, the union, and the component's props alike. A strictly typed callback would reject all three.
declare const narrowScroll: (event: UIEvent<HTMLDivElement> & { readonly narrowed: true }) => void;
const narrowStackProps: VirtualizerStackProps = { 'aria-label': 'Results', onScroll: narrowScroll };
const narrowUnionProps: VirtualizerProps = { 'aria-label': 'Results', onScroll: narrowScroll };
const narrowComponentProps: ComponentProps<typeof Virtualizer> = { 'aria-label': 'Results', onScroll: narrowScroll };
const narrowElement = <Virtualizer aria-label="Results" onScroll={narrowScroll} />;
// An ordinary handler, and one on the wider SyntheticEvent, still fit.
const ordinaryScroll = <Virtualizer aria-label="Results" onScroll={(event: UIEvent<HTMLDivElement>) => { void event.currentTarget.scrollTop; }} />;
const wideScroll = <Virtualizer aria-label="Results" onScroll={(event: SyntheticEvent) => { void event; }} />;
// @ts-expect-error a handler of another element's scroll event does not fit the viewport's.
const wrongElementScroll = <Virtualizer aria-label="Results" onScroll={(event: UIEvent<HTMLButtonElement>) => { void event; }} />;
void [narrowStackProps, narrowUnionProps, narrowComponentProps, narrowElement, ordinaryScroll, wideScroll, wrongElementScroll];
