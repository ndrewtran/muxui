import React from 'react';

// Carries a GridList item's disabled state to a nested Link. React Aria hands it to
// a nested Button through ButtonContext but provides no LinkContext, and a Mux-owned
// context leaves every outer React Aria LinkContext, such as a Breadcrumb's, untouched.
export const GridListItemDisabledContext = React.createContext(false);
