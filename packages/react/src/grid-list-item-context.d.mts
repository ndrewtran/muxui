// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { Context } from 'react';

/** Whether the GridList item around a Link is disabled. */
export declare const GridListItemDisabledContext: Context<boolean>;
