// The `react/jsx-runtime` that catalog examples are rendered with when the test asks which elements the example itself creates:
// every native element created through it carries `data-caller`. An element a Mux component creates goes through the package's own
// runtime and is never marked, so an unmarked element in the markup is Mux's. See `renderCatalogExamples({ markCallerElements })`.
import * as runtime from 'react/jsx-runtime';

export const callerAttribute = 'data-caller';

const marked = (type, props) => (typeof type === 'string' ? { ...props, [callerAttribute]: '' } : props);

export const { Fragment } = runtime;
export const jsx = (type, props, key) => runtime.jsx(type, marked(type, props), key);
export const jsxs = (type, props, key) => runtime.jsxs(type, marked(type, props), key);
