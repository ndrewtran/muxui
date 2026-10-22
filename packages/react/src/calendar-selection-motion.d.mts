// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, Ref } from 'react';
import type { CalendarCellRenderProps } from 'react-aria-components';

/** Keeps React Aria in control while one selected date background travels within a month; `children` is the Calendar element. */
export declare function CalendarSelectionMotion(props: { children: ReactElement; rootRef?: Ref<HTMLDivElement> }): ReactElement;

/** A calendar day cell's content: the travelling selection background and the formatted date. */
export declare function CalendarSelectionCell(props: Pick<CalendarCellRenderProps, 'date' | 'formattedDate' | 'isSelected'>): ReactElement;
