// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { Context } from 'react';

/** The choice control size an enclosing CheckboxGroup supplies. */
export declare const ChoiceControlSizeContext: Context<'sm' | 'md' | 'lg' | undefined>;

/** The size to use: the one given, else `md`. Throws for any other value. */
export declare function normalizeChoiceControlSize(size: string | undefined, componentName: string): 'sm' | 'md' | 'lg';
