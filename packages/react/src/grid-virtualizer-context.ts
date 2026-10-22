import React from 'react';
import type { Context } from 'react';

/** The resolved CSS column and row gap of a grid GridList, in px. */
export type GridGap = { column: number; row: number };
/** What a GridList in a grid Virtualizer calls to report its gap. */
export type ReportGridGap = (gap: GridGap) => void;

// A grid Virtualizer provides this so its GridList can report the CSS gap it
// resolves to; the Virtualizer turns that gap into layout spacing. Both read the one
// type, so the value a provider supplies is the value a consumer calls.
export const GridVirtualizerContext: Context<ReportGridGap | null> = React.createContext<ReportGridGap | null>(null);
