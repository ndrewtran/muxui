import React from 'react';

// Carries a GridList item's disabled state to a nested Link. A Link inherits an item's disabled
// state exactly where React Aria hands it to a nested Button, which in react-aria-components 1.20.0
// is a GridListItem alone (ButtonContext default slot). React Aria provides no LinkContext there,
// and a Mux-owned context leaves every outer React Aria LinkContext, such as a Breadcrumb's, untouched.
export const GridListItemDisabledContext = React.createContext(false);
