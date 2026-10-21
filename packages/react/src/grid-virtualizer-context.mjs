import React from 'react';

// A grid Virtualizer provides this so its GridList can report the CSS gap it
// resolves to; the Virtualizer turns that gap into layout spacing.
export const GridVirtualizerContext = React.createContext(null);
