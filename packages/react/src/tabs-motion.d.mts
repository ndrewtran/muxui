// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, ReactNode } from 'react';

/** The sliding selection indicator and the overflow scroll buttons of a Tabs list; `children` is the React Aria TabList element. */
export declare function TabsMotion(props: { children?: ReactNode; orientation?: 'horizontal' | 'vertical'; variant?: 'underline' | 'pill' | 'overflow' | 'segment'; disabled?: boolean }): ReactElement;
